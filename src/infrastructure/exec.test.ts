import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Exec = typeof import('./exec.ts')
let exec: Exec['exec']
let stopAll: Exec['stopAll']
let watchChildren: Exec['watchChildren']
let commandRunner: Exec['commandRunner']
const { cmdLine, resolveCommand } = await import('./exec.ts')

// `stopAll` is for a process that is going away: after it nothing starts. Each test gets its own copy.
beforeEach(async () => {
  vi.resetModules()
  ;({ exec, stopAll, watchChildren, commandRunner } = await import('./exec.ts'))
})

const node = process.execPath
/** Prints its pid, then stays up; `deaf` also ignores the request to end. */
const stay = (deaf: boolean): string[] => [
  '-e',
  `${deaf ? "process.on('SIGTERM', () => {});" : ''}console.log(process.pid);setInterval(() => {}, 1000)`,
]

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Start a process that stays up; gives its pid once it has printed it, and its end. */
async function start(deaf = false) {
  let ready: (pid: number) => void = () => {}
  const pid = new Promise<number>((resolve) => {
    ready = resolve
  })
  const done = exec(node, stay(deaf), {
    cwd: process.cwd(),
    timeoutMs: 30_000,
    onLine: (line) => ready(Number(line)),
  })
  return { pid: await pid, done }
}

describe('stopAll', () => {
  it('ends every process still running and waits until each is gone', async () => {
    const first = await start()
    const second = await start()

    await stopAll()

    expect(alive(first.pid)).toBe(false)
    expect(alive(second.pid)).toBe(false)
    expect((await first.done).timedOut).toBe(false)
  })

  it('ends a process that ignores the request, once the wait is over', async () => {
    const deaf = await start(true)

    await stopAll(100)

    expect(alive(deaf.pid)).toBe(false)
    // SIGKILL, where the platform says which signal ended it.
    if (process.platform !== 'win32') expect((await deaf.done).signal).toBe('SIGKILL')
  })

  it('has nothing to wait for when nothing is running', async () => {
    const finished = await exec(node, ['-e', ''], { cwd: process.cwd(), timeoutMs: 30_000 })
    expect(finished.code).toBe(0)

    await expect(stopAll()).resolves.toBeUndefined()
  })
})

describe('exec', () => {
  it('ends what the process started too, when it is ended', async () => {
    // A parent that starts a child of its own and prints both pids, as an agent's Bash tool does.
    const script = `
      const { spawn } = require('node:child_process')
      const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
      console.log(process.pid + ' ' + child.pid)
      setInterval(() => {}, 1000)
    `
    let ready: (pids: number[]) => void = () => {}
    const pids = new Promise<number[]>((resolve) => {
      ready = resolve
    })
    const controller = new AbortController()
    const done = exec(node, ['-e', script], {
      cwd: process.cwd(),
      timeoutMs: 30_000,
      signal: controller.signal,
      onLine: (line) => ready(line.split(' ').map(Number)),
    })
    const [parent, grandchild] = await pids
    expect(alive(grandchild)).toBe(true)

    controller.abort()
    await done
    // The grandchild hears the same signal; it is gone within moments, not at once.
    const deadline = Date.now() + 5000
    while (alive(grandchild) && Date.now() < deadline)
      await new Promise((wait) => setTimeout(wait, 10))

    expect(alive(parent)).toBe(false)
    expect(alive(grandchild)).toBe(false)
  })

  it('reports each process to the watcher as it starts and ends', async () => {
    const started: string[] = []
    const ended: number[] = []
    watchChildren({
      started: (pid, command) => started.push(`${pid}:${command}`),
      ended: (pid) => ended.push(pid),
    })
    try {
      const result = await exec(node, ['-e', 'console.log(process.pid)'], {
        cwd: process.cwd(),
        timeoutMs: 30_000,
      })
      const pid = Number(result.stdout.trim())
      expect(started).toEqual([`${pid}:${node}`])
      expect(ended).toEqual([pid])
    } finally {
      watchChildren(null)
    }
  })

  it('says when the command cannot be started', async () => {
    const result = await exec('no-such-command-here', [], { cwd: process.cwd(), timeoutMs: 1000 })
    expect(result.spawnError).toMatch(/ENOENT/)
  })
})

/** Wait until `met` holds, asking every few milliseconds, five seconds at most. Says whether it did. */
async function until(met: () => boolean, withinMs = 5000): Promise<boolean> {
  const deadline = Date.now() + withinMs
  while (!met()) {
    if (Date.now() > deadline) return false
    await new Promise((wait) => setTimeout(wait, 10))
  }
  return true
}

const here = { cwd: process.cwd(), timeoutMs: 30_000 }
const posix = process.platform !== 'win32'

describe('exec, when the app is going away', () => {
  it('starts nothing once stopAll has been called', async () => {
    await stopAll()
    await expect(exec(node, ['-e', ''], here)).rejects.toThrow('Stopping.')
  })

  it('starts nothing for a signal that has already fired', async () => {
    const controller = new AbortController()
    controller.abort()
    const started: number[] = []
    watchChildren({ started: (pid) => started.push(pid), ended: () => {} })
    const result = await exec(node, ['-e', 'console.log(1)'], {
      ...here,
      signal: controller.signal,
    })
    expect(result).toMatchObject({ code: null, stdout: '', spawnError: null })
    expect(started).toEqual([])
  })
})

describe('exec, reading output', () => {
  it('keeps a character whole when it arrives split across two chunks', async () => {
    // The three bytes of the euro sign, two now and one later.
    const script = `
      process.stdout.write(Buffer.from([0xe2, 0x82]))
      setTimeout(() => process.stdout.write(Buffer.from([0xac, 0x0a])), 100)
    `
    const lines: string[] = []
    const streamed = await exec(node, ['-e', script], { ...here, onLine: (l) => lines.push(l) })
    expect(lines).toEqual(['€'])
    expect(streamed.stdout).toBe('€\n')
    expect((await exec(node, ['-e', script], here)).stdout).toBe('€\n')
  })

  it('keeps only the end of stdout when the lines are handed on as they arrive', async () => {
    const script = `for (let i = 0; i < 4000; i += 1) console.log(String(i).padStart(99, '0'))`
    let count = 0
    const result = await exec(node, ['-e', script], { ...here, onLine: () => (count += 1) })
    expect(count).toBe(4000)
    expect(result.stdout.length).toBe(64 * 1024)
    expect(result.stdout.endsWith(`${'3999'.padStart(99, '0')}\n`)).toBe(true)
  })

  it('keeps stdout from its start up to the cap when it is read whole', async () => {
    const result = await exec(node, ['-e', `process.stdout.write('abc' + 'x'.repeat(5000))`], {
      ...here,
      maxOutput: 10,
    })
    expect(result.stdout).toBe('abcxxxxxxx')
    expect(result.code).toBe(0)
  })

  it('ends the run, and says why, when the line handler throws', async () => {
    const result = await exec(node, stay(false), {
      ...here,
      onLine: () => {
        throw new Error('handler broke')
      },
    })
    expect(result.stderr).toContain('handler broke')
    expect(result.code).not.toBe(0)
  })

  it('goes on when the watcher cannot write its record, and warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    watchChildren({
      started: () => {
        throw new Error('ENOSPC: no space left on device')
      },
      ended: () => {
        throw new Error('ENOSPC: no space left on device')
      },
    })
    try {
      const result = await exec(node, ['-e', 'console.log("still read")'], here)
      expect(result).toMatchObject({ code: 0, stdout: 'still read\n' })
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0][0]).toMatch(/ENOSPC/)
    } finally {
      warn.mockRestore()
    }
  })

  it.skipIf(!posix)('says so when the arguments are more than a command can carry', async () => {
    const result = await exec(node, ['-e', '', 'x'.repeat(3 * 1024 * 1024)], here)
    expect(result.spawnError).toMatch(/E2BIG/)
  })
})

describe('exec, with a shell command line', () => {
  it('runs the line in a shell', async () => {
    const result = await exec('echo one && echo two', [], { ...here, shell: true })
    // cmd.exe echoes the space before `&&` too.
    const lines = result.stdout.split(/\r?\n/).map((line) => line.trim())
    expect(lines.filter(Boolean)).toEqual(['one', 'two'])
    expect(result.code).toBe(0)
  })

  it.skipIf(!posix)('ends everything the line started when its time is up', async () => {
    // As `cd app && npm test` does: the shell starts a runner that never ends.
    let ready: (pid: number) => void = () => {}
    const pid = new Promise<number>((resolve) => {
      ready = resolve
    })
    const done = exec(
      `cd . && "${node}" -e "console.log(process.pid);setInterval(() => {}, 1000)"`,
      [],
      {
        cwd: process.cwd(),
        timeoutMs: 300,
        shell: true,
        onLine: (line) => ready(Number(line)),
      },
    )
    const runner = await pid
    const result = await done
    expect(result.timedOut).toBe(true)
    expect(await until(() => !alive(runner))).toBe(true)
  })

  it.skipIf(!posix)(
    'settles once the wait is over, though a process that left the group still holds the output',
    async () => {
      // The runner starts a process in a group of its own, which outlives every signal sent here.
      const script = `
        const { spawn } = require('node:child_process')
        const away = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
          stdio: 'inherit',
          detached: true,
        })
        console.log(away.pid)
        setInterval(() => {}, 1000)
      `
      let ready: (pid: number) => void = () => {}
      const pid = new Promise<number>((resolve) => {
        ready = resolve
      })
      const done = exec(node, ['-e', script], { ...here, onLine: (line) => ready(Number(line)) })
      const away = await pid
      try {
        await stopAll(50)
        // `close` never came: the other process is still there, holding the pipe.
        expect(alive(away)).toBe(true)
        expect((await done).code).toBeNull()
      } finally {
        process.kill(away, 'SIGKILL')
      }
    },
  )

  it.skipIf(!posix)(
    'settles with the exit code soon after the line ends, and ends a job it left in the background',
    async () => {
      // As a check that starts a server with `&` does: the server holds the output open.
      const started = Date.now()
      const result = await exec(`"${node}" -e "setInterval(() => {}, 1000)" & echo $!`, [], {
        ...here,
        timeoutMs: 20_000,
        shell: true,
      })
      expect(Date.now() - started).toBeLessThan(5000)
      expect(result).toMatchObject({ code: 0, timedOut: false })
      const server = Number(result.stdout.trim())
      expect(server).toBeGreaterThan(1)
      expect(await until(() => !alive(server))).toBe(true)
    },
  )
})

describe('exec, when something the process started outlives it', () => {
  it.skipIf(!posix)(
    'settles with the exit code, not as timed out, while that process still holds the output',
    async () => {
      const script = `
        const { spawn } = require('node:child_process')
        const away = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
          stdio: 'inherit',
          detached: true,
        })
        console.log(away.pid)
        process.exit(3)
      `
      const started = Date.now()
      const result = await exec(node, ['-e', script], { ...here, timeoutMs: 20_000 })
      const away = Number(result.stdout.trim())
      try {
        expect(Date.now() - started).toBeLessThan(5000)
        expect(result).toMatchObject({ code: 3, timedOut: false })
      } finally {
        process.kill(away, 'SIGKILL')
      }
    },
  )

  it('waits for output that comes after the exit, as long as it keeps coming', async () => {
    const result = await exec(node, ['-e', "console.log('a'.repeat(1 << 20))"], here)
    expect(result.stdout.trim()).toHaveLength(1 << 20)
    expect(result.code).toBe(0)
  })
})

describe('commandRunner', () => {
  it("runs a check command without the app's keys, its input on stdin", async () => {
    process.env.TYPESAFE_API_KEY = 'secret'
    try {
      const script = join(mkdtempSync(join(tmpdir(), 'st-run-')), 'check.js')
      writeFileSync(
        script,
        `process.stdin.on('data', (d) => console.log(String(d).trim(), process.env.TYPESAFE_API_KEY ?? 'no key'))`,
      )
      try {
        const result = await commandRunner()(`"${node}" "${script}"`, {
          cwd: process.cwd(),
          timeoutMs: 30_000,
          input: 'copy',
        })
        expect(result).toEqual({
          exit: 0,
          stdout: 'copy no key\n',
          tail: 'copy no key',
          timedOut: false,
        })
      } finally {
        rmSync(join(script, '..'), { recursive: true, force: true })
      }
    } finally {
      delete process.env.TYPESAFE_API_KEY
    }
  })

  it('reports a failed command by its exit and the end of what it printed', async () => {
    const result = await commandRunner()(
      `"${node}" -e "console.error('expected 3, got 4');process.exit(2)"`,
      {
        cwd: process.cwd(),
        timeoutMs: 30_000,
      },
    )
    expect(result).toMatchObject({ exit: 2, tail: 'expected 3, got 4', timedOut: false })
  })

  it.skipIf(!posix)(
    'ends the command when the grading is stopped, and gives no answer for it',
    async () => {
      const controller = new AbortController()
      const done = commandRunner(controller.signal)(`"${node}" -e "setInterval(() => {}, 1000)"`, {
        cwd: process.cwd(),
        timeoutMs: 30_000,
      })
      setTimeout(() => controller.abort(), 100)
      await expect(done).rejects.toThrow('Stopped.')
    },
  )

  it('runs nothing for a grading already stopped', async () => {
    const controller = new AbortController()
    controller.abort()
    const dir = mkdtempSync(join(tmpdir(), 'st-run-'))
    try {
      await expect(
        commandRunner(controller.signal)(`"${node}" -e "require('fs').writeFileSync('ran', '')"`, {
          cwd: dir,
          timeoutMs: 30_000,
        }),
      ).rejects.toThrow('Stopped.')
      expect(existsSync(join(dir, 'ran'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('cmdLine', () => {
  // What cmd.exe leaves of a line after reading it twice, once to start the script and once inside it.
  const afterCmd = (line: string): string => {
    const once = (text: string) => text.replace(/\^(.)/g, '$1')
    return once(once(line))
  }

  it('leaves no character for cmd.exe to act on, in any argument', () => {
    for (const hostile of [
      'Read" & calc & "',
      '%USERPROFILE%',
      '!PATH!',
      'a|b>c<d',
      'x && del /q *',
      '(a) [b] ^c `d` e;f,g?',
      'ends with a backslash\\',
      'quote after backslash \\"',
    ]) {
      const [, arg] = cmdLine('C:\\npm\\claude.cmd', [hostile]).split(/ (.*)/s)
      // Every one of cmd.exe's characters has its carets, so none is read as its own.
      expect(arg.replace(/\^\^\^[()\][%!^"`<>&|;, *?]/g, '')).not.toMatch(/[()\][%!^"`<>&|;, *?]/)
      // And the program gets the argument in quotes, its own quotes escaped.
      expect(afterCmd(arg).startsWith('"')).toBe(true)
      expect(afterCmd(arg).endsWith('"')).toBe(true)
    }
  })

  it('quotes an argument as the program reads it back', () => {
    expect(afterCmd(cmdLine('claude.cmd', ['a "b" c']))).toBe('claude.cmd "a \\"b\\" c"')
    expect(afterCmd(cmdLine('claude.cmd', ['dir\\']))).toBe('claude.cmd "dir\\\\"')
    expect(afterCmd(cmdLine('claude.cmd', ['']))).toBe('claude.cmd ""')
  })

  it('escapes the script path too', () => {
    expect(cmdLine('C:\\Program Files\\x & y\\claude.cmd', [])).toBe(
      'C:\\Program^ Files\\x^ ^&^ y\\claude.cmd',
    )
  })

  it('refuses an argument with a line break, which a cmd.exe line cannot carry', () => {
    expect(() => cmdLine('cursor-agent.cmd', ['-p', 'line one\nline two'])).toThrow(/line break/)
    expect(() => cmdLine('cursor-agent.cmd', ['one\rtwo'])).toThrow(/line break/)
  })
})

describe('resolveCommand', () => {
  let bin: string
  beforeEach(() => {
    bin = mkdtempSync(join(tmpdir(), 'st-bin-'))
  })
  afterEach(() => rmSync(bin, { recursive: true, force: true }))

  // A Windows temp path holds a drive's colon, which a POSIX PATH would split; the PATHEXT test below covers Windows.
  it.skipIf(process.platform === 'win32')(
    'finds a command in a PATH folder and gives its full path',
    () => {
      const tool = join(bin, 'st-tool')
      writeFileSync(tool, '#!/bin/sh\n')
      chmodSync(tool, 0o755)
      expect(resolveCommand('st-tool', { PATH: `/nowhere:${bin}` }, 'linux')).toBe(tool)
    },
  )

  it('finds nothing for a name no folder holds, or with no PATH at all', () => {
    expect(resolveCommand('st-tool', { PATH: bin }, 'linux')).toBeNull()
    expect(resolveCommand('st-tool', {}, 'linux')).toBeNull()
  })

  it('skips a file that cannot be run, and a folder of that name', () => {
    writeFileSync(join(bin, 'st-plain'), 'text')
    chmodSync(join(bin, 'st-plain'), 0o644)
    mkdirSync(join(bin, 'st-dir'))
    const env = { PATH: bin }
    if (process.platform !== 'win32') expect(resolveCommand('st-plain', env, 'linux')).toBeNull()
    expect(resolveCommand('st-dir', env, 'linux')).toBeNull()
  })

  it.skipIf(process.platform === 'win32')('checks a name with a folder in it as given', () => {
    const tool = join(bin, 'st-tool')
    writeFileSync(tool, '#!/bin/sh\n')
    chmodSync(tool, 0o755)
    expect(resolveCommand(tool, { PATH: '' }, 'linux')).toBe(tool)
    expect(resolveCommand(join(bin, 'missing'), { PATH: '' }, 'linux')).toBeNull()
  })

  it('tries each PATHEXT extension on Windows, so an npm-installed CLI is found as its .CMD', () => {
    writeFileSync(join(bin, 'claude.CMD'), '@echo off\n')
    const env = { PATH: `C:\\nowhere;${bin}`, PATHEXT: '.COM;.EXE;.BAT;.CMD' }
    expect(resolveCommand('claude', env, 'win32')).toBe(join(bin, 'claude.CMD'))
    // A name that already carries an extension stands for itself.
    expect(resolveCommand('claude.CMD', env, 'win32')).toBe(join(bin, 'claude.CMD'))
    expect(resolveCommand('claude.EXE', env, 'win32')).toBeNull()
  })

  it('reads PATH and PATHEXT on Windows however their names are spelled', () => {
    writeFileSync(join(bin, 'claude.CMD'), '@echo off\n')
    const env = { Path: bin, PathExt: '.CMD' }
    expect(resolveCommand('claude', env, 'win32')).toBe(join(bin, 'claude.CMD'))
    // Elsewhere a name is its exact spelling.
    expect(resolveCommand('claude.CMD', env, 'linux')).toBeNull()
  })

  it('falls back to the usual extensions when PATHEXT is not set', () => {
    writeFileSync(join(bin, 'codex.EXE'), '')
    expect(resolveCommand('codex', { PATH: bin }, 'win32')).toBe(join(bin, 'codex.EXE'))
  })
})
