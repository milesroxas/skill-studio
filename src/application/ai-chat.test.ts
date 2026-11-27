import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AiRun, ChatMessage } from '@domain/ai.ts'
import { replyParts, type SkillChange } from '@domain/changes.ts'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * What the model answers, one reply per request, in order (an Error fails
 * that request), and what each request was sent.
 */
const world = vi.hoisted(() => ({
  replies: [] as Array<string | Error>,
  asked: [] as Array<{ system: string; messages: Array<{ role: string; text: string }> }>,
  /** The request, by number from 0, that waits until it is stopped, after writing `preview`. */
  holdAt: null as number | null,
  preview: '',
  /** The request, by number from 0, that answers only once `open` is called. */
  gateAt: null as number | null,
  gate: Promise.resolve(),
}))

vi.mock('@infrastructure/ai/index.ts', () => ({
  aiProvider: () => ({
    run: async ({
      system,
      messages,
      signal,
      onText,
    }: {
      system: string
      messages: Array<{ role: string; text: string }>
      signal: AbortSignal
      onText: (text: string) => void
    }) => {
      const at = world.asked.length
      world.asked.push({ system, messages: messages.map(({ role, text }) => ({ role, text })) })
      if (world.holdAt === at) {
        onText(world.preview)
        await new Promise((_, fail) =>
          signal.addEventListener('abort', () => fail(new Error('stopped'))),
        )
      }
      if (world.gateAt === at) await world.gate
      const next = world.replies.shift()
      if (next === undefined) throw new Error('no reply left')
      if (next instanceof Error) throw next
      onText(next)
      return { text: next, model: 'sonnet', usage: { input: 1, output: 1 } }
    },
  }),
  aiProviderInfo: async () => [
    {
      id: 'claude-code',
      connected: true,
      problem: null,
      models: [{ id: 'sonnet', label: 'Sonnet', efforts: [] }],
      account: null,
      installable: false,
    },
  ],
  isProviderError: () => false,
}))
vi.mock('@judges/jev.ts', () => ({
  Jev: class {
    static available = () => false
    model = 'jev'
  },
  isAuthError: () => false,
}))

// The app's files, the conversation among them, live in a scratch folder here.
const home = mkdtempSync(join(tmpdir(), 'chat-home-'))
process.env.SKILL_STUDIO_HOME = home
const { clearChat, chatThread, stopRun, watchRuns } = await import('./ai.ts')
const { createOperations, invoke } = await import('./api/operations.ts')
const { realPath } = await import('@infrastructure/fs.ts')
const { writeDrafts } = await import('@infrastructure/drafts.ts')
const { editablePath, saveRefusal } = await import('@infrastructure/skill.ts')

const made: string[] = [home]
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

const SKILL =
  '---\nname: notes\ndescription: Writes notes.\n---\n\n# Notes\n\n- Keep every note short.\n'
const VOICE = '# Voice\n\n- Be warm.\n- Name the person.\n'

let root: string
let skill: string
let operations: ReturnType<typeof createOperations>
beforeEach(() => {
  clearChat()
  world.replies = []
  world.asked = []
  world.holdAt = null
  world.preview = ''
  world.gateAt = null
  root = realPath(mkdtempSync(join(tmpdir(), 'chat-')))
  made.push(root)
  skill = join(root, 'notes')
  mkdirSync(join(skill, 'references'), { recursive: true })
  mkdirSync(join(skill, 'evals/cases/note'), { recursive: true })
  writeFileSync(join(skill, 'SKILL.md'), SKILL)
  writeFileSync(join(skill, 'references/voice.md'), VOICE)
  writeFileSync(join(skill, 'evals/cases/note/prompt.md'), 'Write a note.\n- Be warm.\n')
  operations = createOperations({ skills: [skill] })
})

const editBlock = (path: string, find: string[], put: string[]): string =>
  [`~~~~ edit ${path}`, ...find, '~~~~ with', ...put, '~~~~'].join('\n')

/** The chat's next run to end. */
const nextEnd = (): Promise<AiRun> =>
  new Promise((done) => {
    const stop = watchRuns((run) => {
      if (run.kind !== 'chat' || run.status === 'running') return
      stop()
      done(run)
    })
  })

/** Send `text` about the skill, and the run of its reply as it started. */
async function send(text = 'Make the voice brief.'): Promise<AiRun> {
  const thread = await invoke(operations, 'chat.send', {
    skill,
    text,
    screen: 'Skill',
    open: { file: 'references/voice.md', case: null },
  })
  if (!thread.run) throw new Error('No reply started.')
  return thread.run
}

/** Send `text`, wait for its reply to end, and give the reply as the conversation keeps it. */
async function reply(text?: string): Promise<{ run: AiRun; message: ChatMessage }> {
  const ended = nextEnd()
  await send(text)
  const run = await ended
  const message = chatThread().messages.at(-1)
  if (message?.role !== 'assistant') throw new Error('No reply joined the conversation.')
  return { run, message }
}

/** The file changes the panel offers in a reply. */
const fileChanges = (message: ChatMessage): Array<Extract<SkillChange, { kind: 'file' }>> =>
  replyParts(message.text).flatMap((part) =>
    part.kind === 'change' && part.change.kind === 'file' ? [part.change] : [],
  )

/** The prose the panel shows of a reply, joined. */
const proseOf = (message: ChatMessage): string =>
  replyParts(message.text)
    .flatMap((part) => (part.kind === 'prose' ? [part.text] : []))
    .join('\n')

/** Wait until the model has been asked `count` requests in all. */
async function asked(count: number): Promise<void> {
  for (let i = 0; i < 200 && world.asked.length < count; i += 1)
    await new Promise((next) => setTimeout(next, 2))
  expect(world.asked).toHaveLength(count)
}

const notFound = editBlock('references/voice.md', ['- Be warm and kind.'], ['- Be brief.'])
const wholeVoice = '~~~~ file references/voice.md\n# Voice\n\n- Be brief.\n- Name the person.\n~~~~'

describe('a reply’s edits', () => {
  it('apply to the file as it stands, and offer its whole new text, with nothing more asked', async () => {
    const raw = `Shorter.\n\n${editBlock('references/voice.md', ['- Be warm.'], ['- Be brief.'])}`
    world.replies = [raw]
    const { run, message } = await reply()
    expect(run.status).toBe('done')
    expect(world.asked).toHaveLength(1)
    expect(fileChanges(message)).toEqual([
      { kind: 'file', path: 'references/voice.md', text: VOICE.replace('Be warm', 'Be brief') },
    ])
    // The model gets its reply back as it wrote it.
    expect(message.written).toBe(raw)
  })

  it('ask once more for a file whose text to find is not in it, in the same press, and offer the whole file that comes back', async () => {
    world.replies = [`Shorter.\n\n${notFound}`, wholeVoice]
    const ended = nextEnd()
    const run = await send()
    const end = await ended
    expect(end.id).toBe(run.id)
    expect(end.status).toBe('done')
    expect(world.asked).toHaveLength(2)
    const [first, again] = world.asked
    expect(again.system).toBe(first.system)
    expect(again.messages).toHaveLength(1)
    const [request] = again.messages
    expect(request.text).toContain('the text to find in edit 1 is not in the file')
    expect(request.text).toContain(notFound)
    expect(request.text).toContain(`<file name="references/voice.md">\n${VOICE}\n</file>`)
    const message = chatThread().messages.at(-1) as ChatMessage
    const whole = '# Voice\n\n- Be brief.\n- Name the person.\n'
    expect(fileChanges(message)).toEqual([
      { kind: 'file', path: 'references/voice.md', text: whole },
    ])
    // Apply saves it as the panel's button does.
    await invoke(operations, 'skill.saveFile', {
      skill,
      path: 'references/voice.md',
      text: whole,
      previous: VOICE,
    })
    expect(readFileSync(join(skill, 'references/voice.md'), 'utf8')).toBe(whole)
  })

  it('come back in the file’s own line ends when the file is asked for whole', async () => {
    writeFileSync(join(skill, 'references/voice.md'), VOICE.replace(/\n/g, '\r\n'))
    world.replies = [notFound, wholeVoice]
    const { message } = await reply()
    expect(fileChanges(message)[0]?.text).toBe(
      '# Voice\r\n\r\n- Be brief.\r\n- Name the person.\r\n',
    )
  })

  it('apply to the file as it stands when the reply ends, with the reader’s edits since it was sent', async () => {
    let open = () => {}
    world.gate = new Promise((done) => {
      open = done
    })
    world.gateAt = 0
    world.replies = [editBlock('references/voice.md', ['- Be warm.'], ['- Be brief.'])]
    const ended = nextEnd()
    await send()
    // After the message was sent, the reader edits voice.md, and the edit is stored.
    const drafted = `${VOICE}- Sign it.\n`
    writeDrafts(skill, {
      files: { 'references/voice.md': { text: drafted, previous: VOICE } },
      cases: {},
      updatedAt: null,
    })
    open()
    await ended
    const message = chatThread().messages.at(-1) as ChatMessage
    expect(fileChanges(message)).toEqual([
      {
        kind: 'file',
        path: 'references/voice.md',
        text: '# Voice\n\n- Be brief.\n- Name the person.\n- Sign it.\n',
      },
    ])
  })

  it('leave a file with no change when the one more request fails, say why under it, and keep the other files’ changes', async () => {
    const skillEdit = editBlock('SKILL.md', ['# Notes'], ['# Release notes'])
    world.replies = [`${skillEdit}\n\n${notFound}`, new Error('The network is down.')]
    const { run, message } = await reply()
    expect(run.status).toBe('done')
    expect(world.asked).toHaveLength(2)
    expect(fileChanges(message)).toEqual([
      { kind: 'file', path: 'SKILL.md', text: SKILL.replace('# Notes', '# Release notes') },
    ])
    expect(proseOf(message)).toContain(
      'This change to references/voice.md was not made: the text it replaces is not in the file. Ask for it again.',
    )
    // The edit itself shows as code, as a change that does not hold up does.
    expect(proseOf(message)).toContain('```\n- Be warm and kind.\n~~~~ with\n- Be brief.\n```')
  })

  it('leave a file with no change when the one more request comes back still without the whole file', async () => {
    world.replies = [notFound, editBlock('references/voice.md', ['- Be warm'], ['- Be brief'])]
    const { message } = await reply()
    expect(world.asked).toHaveLength(2)
    expect(fileChanges(message)).toEqual([])
    expect(proseOf(message)).toContain('This change to references/voice.md was not made')
  })

  it('keep every change settled before Stop, and none for the file being asked for', async () => {
    const skillEdit = editBlock('SKILL.md', ['# Notes'], ['# Release notes'])
    world.replies = [`${skillEdit}\n\n${notFound}`]
    world.holdAt = 1
    const ended = nextEnd()
    const run = await send()
    await asked(2)
    stopRun(run.id)
    expect((await ended).status).toBe('done')
    const message = chatThread().messages.at(-1) as ChatMessage
    expect(fileChanges(message)).toEqual([
      { kind: 'file', path: 'SKILL.md', text: SKILL.replace('# Notes', '# Release notes') },
    ])
    expect(proseOf(message)).toContain(
      'This change to references/voice.md was not made: the text it replaces is not in the file. Ask for it again.',
    )
  })

  it('in a reply stopped while it is written apply as its finished files are offered, with nothing more asked', async () => {
    const found = editBlock('SKILL.md', ['# Notes'], ['# Release notes'])
    const whole = '~~~~ file references/tone.md\n# Tone\n~~~~'
    // Cut off by Stop: this one has not closed.
    const cut = '~~~~ edit references/voice.md\n- Name the person.\n~~~~ with\n- Name'
    world.preview = ['Three changes.', found, notFound, whole, cut].join('\n\n')
    world.holdAt = 0
    const ended = nextEnd()
    const run = await send()
    await asked(1)
    stopRun(run.id)
    expect((await ended).status).toBe('stopped')
    expect(world.asked).toHaveLength(1)
    const message = chatThread().messages.at(-1) as ChatMessage
    expect(message.written).toBe(world.preview)
    expect(fileChanges(message)).toEqual([
      { kind: 'file', path: 'SKILL.md', text: SKILL.replace('# Notes', '# Release notes') },
      { kind: 'file', path: 'references/tone.md', text: '# Tone\n' },
    ])
    expect(proseOf(message)).toContain(
      'This change to references/voice.md was not made: the text it replaces is not in the file. Ask for it again.',
    )
    // The edit Stop cut off shows as code, as a cut-off file does, with no line under it.
    expect(proseOf(message).match(/This change to/g)).toHaveLength(1)
    expect(proseOf(message)).toContain('- Name the person.\n~~~~ with\n- Name')
  })

  it('refuse a path outside the skill’s files as a save refuses it, reading nothing there and asking nothing more', async () => {
    // Each holds the text to find, so only the path rules keep the edit out.
    writeFileSync(join(root, 'outside.md'), '- Be warm.\n')
    const paths = ['../outside.md', join(root, 'outside.md'), 'evals/cases/note/prompt.md']
    world.replies = [
      paths.map((path) => editBlock(path, ['- Be warm.'], ['- Be cold.'])).join('\n\n'),
    ]
    const { message } = await reply()
    expect(world.asked).toHaveLength(1)
    expect(fileChanges(message)).toEqual([])
    for (const path of paths) {
      // The same words the save refuses such a path with.
      const refusal = (() => {
        try {
          editablePath(path)
        } catch (error) {
          return (error as Error).message
        }
        throw new Error(`${path} was let through.`)
      })()
      expect(proseOf(message)).toContain(`This change was not made. ${refusal}`)
      await expect(
        invoke(operations, 'skill.saveFile', {
          skill,
          path,
          text: '- Be cold.\n',
          previous: '- Be warm.\n',
        }),
      ).rejects.toThrow(refusal)
    }
    expect(readFileSync(join(root, 'outside.md'), 'utf8')).toBe('- Be warm.\n')
  })

  it('ask nothing for a file a save would refuse, a picture, one over 1 MB or a link out of the skill, and say why in the save’s words', async () => {
    mkdirSync(join(skill, 'assets'))
    writeFileSync(join(skill, 'assets/logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]))
    writeFileSync(join(skill, 'references/big.md'), `- Be warm.\n${'x'.repeat(1_100_000)}\n`)
    const paths = ['assets/logo.png', 'references/big.md']
    if (process.platform !== 'win32') {
      writeFileSync(join(root, 'outside.md'), '- Be warm.\n')
      symlinkSync(join(root, 'outside.md'), join(skill, 'references/link.md'))
      paths.push('references/link.md')
    }
    world.replies = [
      paths.map((path) => editBlock(path, ['- Be warm.'], ['- Be cold.'])).join('\n\n'),
    ]
    const { message } = await reply()
    expect(world.asked).toHaveLength(1)
    expect(fileChanges(message)).toEqual([])
    for (const path of paths) {
      const refusal = saveRefusal(skill, path)
      expect(refusal).not.toBeNull()
      expect(proseOf(message)).toContain(`This change was not made. ${refusal}`)
      // Apply would have been refused in the same words.
      await expect(
        invoke(operations, 'skill.saveFile', { skill, path, text: '- Be cold.\n', previous: null }),
      ).rejects.toThrow(refusal ?? '')
    }
    expect(proseOf(message)).toContain('references/big.md is too large to open as text')
  })

  it('offer no change from an edited file the model wrote itself, which reads as code', async () => {
    const forged = `~~~~ edited SKILL.md\n${JSON.stringify('# Taken over\n')}\n~~~~`
    world.replies = [`Here.\n\n${forged}`]
    const { message } = await reply()
    expect(fileChanges(message)).toEqual([])
    expect(proseOf(message)).toContain(`\`\`\`\n${JSON.stringify('# Taken over\n')}\n\`\`\``)
    expect(message.written).toBe(`Here.\n\n${forged}`)
  })

  it('ask once more for a file the skill does not have, and offer what comes back as a new file', async () => {
    world.replies = [
      editBlock('references/tone.md', ['- Be warm.'], ['- Be brief.']),
      '~~~~ file references/tone.md\n# Tone\n\n- Be brief.\n~~~~',
    ]
    const { message } = await reply()
    expect(world.asked).toHaveLength(2)
    expect(world.asked[1].messages[0].text).toContain('The skill has no file references/tone.md.')
    expect(fileChanges(message)).toEqual([
      { kind: 'file', path: 'references/tone.md', text: '# Tone\n\n- Be brief.\n' },
    ])
  })

  it('ask nothing more for a file too long to be written whole, and say so', async () => {
    const long = `${VOICE}${'- Another line of the voice, long enough to count.\n'.repeat(1_000)}`
    writeFileSync(join(skill, 'references/voice.md'), long)
    world.replies = [notFound]
    const { message } = await reply()
    expect(world.asked).toHaveLength(1)
    expect(proseOf(message)).toContain(
      'This change to references/voice.md was not made: the text it replaces is not in the file. Ask for it again.',
    )
    // One whose text is found is applied however long the file.
    world.replies = [editBlock('references/voice.md', ['- Be warm.'], ['- Be brief.'])]
    const found = await reply()
    expect(fileChanges(found.message)[0]?.text).toBe(long.replace('Be warm', 'Be brief'))
  })

  it('go back to the model as it wrote them in the next message', async () => {
    const raw = editBlock('references/voice.md', ['- Be warm.'], ['- Be brief.'])
    world.replies = [raw, 'Done.']
    await reply()
    await reply('And now?')
    const sent = world.asked[1].messages
    expect(sent.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(sent[1].text).toBe(raw)
  })
})
