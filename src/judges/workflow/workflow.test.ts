import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { mergeConfig } from '@domain/config.ts'
import type { ScoreSubject } from '@domain/pack.ts'
import type { Case, TranscriptEvent } from '@domain/schemas.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Jev } from '../jev.ts'
import { MissingAnswerError } from '../shared/questions.ts'
import type { JudgeContext, JudgeInput } from '../types.ts'
import { summarize, workflowPack } from './index.ts'
import { type WorkflowMetrics, workflowScoring } from './score.ts'

const config = mergeConfig({ packs: ['workflow'] }, [workflowScoring])
const ctx: JudgeContext = { jev: new Jev(), useJev: false, config, skillDir: '/s', log: () => {} }
const subject: ScoreSubject = {
  case: null,
  primary: { file: 'outputs/note.md', kind: 'markdown' },
  artifacts: [],
  words: 40,
  range: null,
}

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'st-workflow-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

let step = 0
const ev = (kind: TranscriptEvent['kind'], extra: Partial<TranscriptEvent> = {}) => ({
  step: ++step,
  at: step * 1000,
  kind,
  ...extra,
})
/** A tool call; `call` is the hash of its whole input, which a transcript from an earlier release lacks. */
const tool = (name: string, args: string, call?: string) => ev('tool', { tool: name, args, call })

const inputOf = (events: TranscriptEvent[], settings = {}, sampleDir = dir): JudgeInput => ({
  text: '',
  units: [],
  case: {
    prompt: 'Write the note.',
    settings: { maxTurns: null, timeoutSeconds: null, ...settings },
    bench: {},
  } as unknown as Case,
  images: [],
  rules: [],
  artifacts: [{ file: 'outputs/note.md', kind: 'markdown' }],
  primary: null,
  others: [],
  notes: null,
  transcript: events,
  dir: sampleDir,
  renders: [],
})

const metrics = async (
  events: TranscriptEvent[],
  settings = {},
  sampleDir = dir,
): Promise<WorkflowMetrics> => {
  const raw = await workflowPack.judge(inputOf(events, settings, sampleDir), ctx)
  if (!raw) throw new Error('no raw')
  return raw.metrics
}

describe('workflow metrics', () => {
  beforeEach(() => {
    step = 0
  })

  it('counts steps, tool calls, errors and exact repeats', async () => {
    const m = await metrics([
      ev('system', { text: 'claude' }),
      tool('Read', `${dir}/.agents/skills/x/SKILL.md`),
      ev('result', { tool: 'Read' }),
      tool('Bash', 'ls'),
      ev('result', { tool: 'Bash', error: true }),
      tool('Bash', 'ls'),
      ev('text', { text: 'done' }),
      ev('error', { text: 'boom' }),
    ])
    expect(m).toMatchObject({ steps: 4, toolCalls: 3, errors: 2, retries: 1, seconds: 8 })
  })

  it('tells one call from another by its whole input, not by the line that sums it up', async () => {
    const edits = await metrics([
      tool('Write', 'outputs/app.js (40 chars)', 'w1'),
      tool('Edit', 'outputs/app.js (edit)', 'e1'),
      tool('Edit', 'outputs/app.js (edit)', 'e2'),
      tool('Edit', 'outputs/app.js (edit)', 'e3'),
    ])
    expect(edits.retries).toBe(0)
    // A long file read in three parts, then one part read again.
    const reads = await metrics([
      tool('Read', 'input.md', 'r1'),
      tool('Read', 'input.md', 'r2'),
      tool('Read', 'input.md', 'r3'),
      tool('Read', 'input.md', 'r2'),
    ])
    expect(reads.retries).toBe(1)
    // The same edit made again is a repeat, though an edit is a write.
    const stuck = await metrics([
      tool('Edit', 'outputs/app.js (edit)', 'e1'),
      tool('Edit', 'outputs/app.js (edit)', 'e1'),
      tool('Edit', 'outputs/app.js (edit)', 'e1'),
    ])
    expect(stuck.retries).toBe(2)
  })

  it('does not count a call made again after something was written', async () => {
    const fixing = await metrics([
      tool('Bash', 'npm test', 't'),
      tool('Edit', 'outputs/app.js (edit)', 'e1'),
      tool('Bash', 'npm test', 't'),
      tool('Bash', 'echo "export {}" >> outputs/app.js', 'e2'),
      tool('Bash', 'npm test', 't'),
    ])
    expect(fixing.retries).toBe(0)
    const idle = await metrics([
      tool('Bash', 'npm test', 't'),
      tool('Bash', 'npm test 2>&1', 't2'),
      tool('Bash', 'npm test', 't'),
      tool('Bash', 'npm test', 't'),
    ])
    expect(idle.retries).toBe(2)
  })

  it('counts a repeat in a transcript with no hashes only for a shell command kept whole', async () => {
    const m = await metrics([
      tool('Edit', 'outputs/app.js (edit)'),
      tool('Edit', 'outputs/app.js (edit)'),
      tool('Read', 'input.md'),
      tool('Read', 'input.md'),
      tool('Grep', 'outputs'),
      tool('Grep', 'outputs'),
      // Cut at 200 characters: what came after the cut may differ.
      tool('Bash', `node -e "${'x'.repeat(190)}…`),
      tool('Bash', `node -e "${'x'.repeat(190)}…`),
    ])
    expect(m.retries).toBe(0)
    expect((await metrics([tool('Bash', 'ls -la'), tool('Bash', 'ls -la')])).retries).toBe(1)
  })

  it('finds when SKILL.md was read and when writing began', async () => {
    const m = await metrics([
      tool('Bash', `echo hi > ${dir}/outputs/note.md`),
      tool('Read', 'SKILL.md'),
      tool('Write', 'outputs/note.md (4 chars)'),
    ])
    expect(m).toMatchObject({ firstWriteAt: 1, skillReadAt: 2 })
  })

  it('reads a shell command as a write only when it makes a file or sends output to one', async () => {
    const writes = async (line: string) =>
      (await metrics([tool('Bash', line)])).firstWriteAt !== null
    for (const line of [
      'ls -la 2>/dev/null',
      'npm test 2>&1',
      'npm test > /dev/null 2>&1',
      'echo failed >&2',
      'echo "a > b"',
      "grep -c '>' notes.md",
      'node -e "console.log(1 > 0)"',
      'sort < input.md',
      // A heredoc that is only printed, whatever its text holds.
      "cat <<'EOF' <p>a > b</p> cp mv EOF",
      'git log --oneline | grep cp',
      'find . -name "cp"',
    ])
      expect([line, await writes(line)]).toEqual([line, false])
    for (const line of [
      'mkdir -p outputs',
      'touch outputs/a.md',
      'cp input.md outputs/a.md',
      'sudo mv a.md outputs/a.md',
      'find . -name "*.md" -exec cp {} outputs/ \\;',
      'ls *.md | xargs -I{} cp {} outputs/',
      'ls | tee outputs/list.txt',
      'echo hi > outputs/a.md',
      'echo hi >> outputs/a.md',
      'echo hi >outputs/a.md',
      "cat > outputs/a.md <<'EOF' hi EOF",
      "cat <<'EOF' > outputs/a.md hi EOF",
      'npm test &> outputs/log.txt',
      'npm test 2> errors.log',
      'npm test >& outputs/log.txt',
    ])
      expect([line, await writes(line)]).toEqual([line, true])
  })

  it('does not take a stream sent elsewhere before the skill is read for a write', async () => {
    const m = await metrics([
      tool('Bash', 'ls -la 2>/dev/null'),
      tool('Read', '.agents/skills/x/SKILL.md'),
      tool('Write', 'outputs/note.md (4 chars)'),
    ])
    expect(m).toMatchObject({ skillReadAt: 2, firstWriteAt: 3 })
  })

  it('reads no path in a heredoc’s text, a message or a word a program only prints', async () => {
    const page =
      '<!doctype html><html><head><title>Acme</title></head><body><a href="/pricing">Pricing</a></body></html>'
    const m = await metrics([
      tool('Bash', `cat > outputs/index.html <<'EOF' ${page} EOF`),
      // Cut before its closing word: the text runs to the end of the line.
      tool('Bash', `cat > outputs/app.js <<EOF fetch('/api/users').then((r) => r.json()) …`),
      tool('Bash', `python3 - <<'PY' open('/Users/someone/notes.md') PY`),
      tool('Bash', 'git commit -m "/fix typo"'),
      tool('Bash', 'git commit -am "/fix typo" && git tag --message="/v2 is out" v2'),
      tool('Bash', 'echo "/api/users is the route" && printf \'/done\\n\''),
      tool('Bash', 'grep users <<< "/api/users /api/teams"'),
      tool('Bash', 'ls outputs 2>&1; ls outputs 2>/dev/null >&2'),
    ])
    expect(m.outside).toEqual([])
  })

  it('reads a count a search is given as a count, and the pattern after it as the pattern', async () => {
    const m = await metrics([
      tool('Bash', 'grep -m 5 "/api/users" outputs/notes.md'),
      tool('Bash', 'rg -A 2 --max-count=3 "/api/teams" outputs'),
    ])
    expect(m.outside).toEqual([])
  })

  it('takes the word after -m for a message only from a program that takes one', async () => {
    const m = await metrics([
      tool('Bash', 'wc -m /Users/someone/secret.txt'),
      tool('Bash', 'sort -m /Users/someone/a.txt outputs/b.txt'),
    ])
    expect(m.outside).toEqual(['/Users/someone/secret.txt', '/Users/someone/a.txt'])
  })

  it('reads a command in backticks as a command, whatever program it is given to', async () => {
    const m = await metrics([
      tool('Bash', 'echo `cat /Users/someone/secret.txt`'),
      tool('Bash', 'printf "%s" `cat ../../other/notes.md` && echo "/just/words"'),
    ])
    expect(m.outside).toEqual(['/Users/someone/secret.txt', '../../other/notes.md'])
  })

  it('still reads the file a heredoc is written to, and the commands after its text', async () => {
    const m = await metrics([
      tool('Bash', `cat > /srv/site/index.html <<'EOF' <a href="/pricing">Pricing</a> EOF`),
      tool('Bash', `cat <<-EOF >> /srv/site/log.txt 2>&1 done EOF`),
      tool('Bash', `cat > outputs/a.md <<EOF hi EOF cat /Users/someone/secret.md`),
      tool('Bash', 'echo hi > /srv/out.txt; echo hi 2> /srv/err.txt'),
      tool('Bash', 'mkdir -m 755 /srv/made'),
      // A backslash at a line's end joined two lines: the next word is still the program's.
      tool('Bash', 'cat outputs/a.md \\ /Users/someone/b.md'),
    ])
    expect(m.outside).toEqual([
      '/srv/site/index.html',
      '/srv/site/log.txt',
      '/Users/someone/secret.md',
      '/srv/out.txt',
      '/srv/err.txt',
      '/srv/made',
      '/Users/someone/b.md',
    ])
  })

  it('lists absolute paths outside the sample, ignoring system dirs', async () => {
    const m = await metrics([
      tool('Read', `${dir}/outputs/a.md`),
      tool('Read', '/Users/someone/.ssh/config'),
      tool('Bash', 'cat /usr/share/dict/words /tmp/scratch'),
    ])
    expect(m.outside).toEqual(['/Users/someone/.ssh/config'])
  })

  it('reads a pattern as text to find, not a place the agent went', async () => {
    const m = await metrics([
      tool('Grep', '/api/users'),
      tool('Bash', 'sed -n "/start/,/end/p" notes.md'),
      tool('Bash', 'grep -rn "/users" . | sort'),
      tool('Bash', "awk '/total/ {print $2}' outputs/a.csv"),
    ])
    expect(m.outside).toEqual([])
  })

  it('finds a path that reaches out with `..` or `~`, and the file a pattern program reads', async () => {
    const m = await metrics([
      tool('Bash', 'cat ../../../../../../../../etc2/secret ~/.ssh/id_rsa'),
      tool('Bash', 'grep -c token /Users/someone/.netrc && echo done > /srv/out.txt'),
      tool('Write', '/Users/someone/notes.md (120 chars)'),
      tool('Read', '../sibling-s2/outputs/a.md'),
      // Inside the sample, by whichever way it is written.
      tool('Bash', `cat ./outputs/a.md outputs/../outputs/a.md --out=${dir}/outputs/b.md`),
    ])
    expect(m.outside).toEqual([
      '../../../../../../../../etc2/secret',
      '~/.ssh/id_rsa',
      '/Users/someone/.netrc',
      '/srv/out.txt',
      '/Users/someone/notes.md',
      '../sibling-s2/outputs/a.md',
    ])
  })

  it('counts a climb out of the sample even when it lands in a system folder', async () => {
    const m = await metrics(
      [tool('Read', '../s2/outputs/a.md'), tool('Bash', 'cat /tmp/scratch/notes.md')],
      {},
      '/tmp/st-run/s1',
    )
    expect(m.outside).toEqual(['../s2/outputs/a.md'])
  })

  it('reads the file a pattern program is given after a quoted pattern as a place', async () => {
    const m = await metrics([
      tool('Bash', 'grep -rn "TODO" /Users/x/other'),
      tool('Bash', "awk '{print $1}' /Users/x/secret.csv"),
      tool('Bash', "sed 's/a/b/' /Users/x/f"),
      tool('Bash', 'grep -n "foo" "/Users/x/quoted file.md"'),
      // An option's value after `=` is no pattern: the pattern is the word after it.
      tool('Bash', 'grep --include=*.md /api/users /Users/x/g'),
      // `-e` gives the pattern and `-f` a file of them, so every word after is a file.
      tool('Bash', 'grep -e "/api/v1" -f /Users/x/patterns.txt notes.md'),
      // `tr` reads no file: both of its sets are text, and what it reads comes in on stdin.
      tool('Bash', 'cat outputs/a.md | tr /- /_'),
      tool('Bash', 'tr a-z A-Z < /Users/x/in.txt'),
    ])
    expect(m.outside).toEqual([
      '/Users/x/other',
      '/Users/x/secret.csv',
      '/Users/x/f',
      '/Users/x/quoted file.md',
      '/Users/x/g',
      '/Users/x/patterns.txt',
      '/Users/x/in.txt',
    ])
  })

  it('reads `..` from the folder a `cd` went to, within one command and from one to the next', async () => {
    const m = await metrics([
      tool('Bash', 'cd outputs && ls && cd ..'),
      tool('Bash', 'cd outputs'),
      tool('Bash', 'cat ../input.md'),
      tool('Bash', 'cd .. && cat ../sibling-s2/outputs/a.md'),
      // A subshell's `cd` ends with it, and so does a `pushd` at its `popd`.
      tool('Bash', '(cd outputs && cat ../input.md) && cat ../up.md'),
      tool('Bash', 'pushd outputs && cat ../input.md && popd && cat ../up2.md'),
      tool('Bash', 'cd outputs; cd -; cat ../up3.md'),
      // A `cd` to a folder code cannot read leaves `..` after it unread.
      tool('Bash', 'cd "$OUT" && cat ../unknown.md'),
      tool('Bash', `cd ${dir} && cat outputs/../input.md`),
    ])
    expect(m.outside).toEqual(['../sibling-s2/outputs/a.md', '../up.md', '../up2.md', '../up3.md'])
  })

  it('reads where a search tool looks as a place, and its pattern as text', async () => {
    const m = await metrics([
      // The transcript keeps the folder a search names, else its pattern: a folder that is there is a place.
      tool('Grep', '~'),
      tool('Grep', '/api/users'),
      tool('Glob', '/Users/someone/**/*.md'),
      tool('Glob', '**/*.md'),
      tool('Glob', `${dir}/outputs/*.md`),
      tool('LS', '/Users/someone'),
      tool('glob', '{"globPattern":"*.ts","targetDirectory":"/Users/someone/src"}'),
      tool('WebSearch', '/usr/local/bin meaning'),
      tool('WebFetch', '/Users/someone/page'),
    ])
    expect(m.outside).toEqual([
      '~',
      '/Users/someone/**/*.md',
      '/Users/someone',
      '/Users/someone/src',
    ])
  })

  it('compares whole path segments, so a sibling sample or system look-alike is outside', async () => {
    // Samples live under the skill's evals/runs/, never under a system dir like /tmp
    // (which is where os.tmpdir() points on Linux), so this path is not on disk.
    const sample = '/work/skill/evals/runs/r1/case-s1'
    const m = await metrics(
      [
        tool('Read', `${sample}0/outputs/a.md`),
        tool('Read', `${sample}/../elsewhere/b.md`),
        tool('Read', '/etc2/passwd'),
        tool('Read', '/tmp-cache/x'),
        tool('Read', `${sample}/outputs/./c.md`),
      ],
      {},
      sample,
    )
    expect(m.outside).toEqual([
      `${sample}0/outputs/a.md`,
      `${sample}/../elsewhere/b.md`,
      '/etc2/passwd',
      '/tmp-cache/x',
    ])
  })

  it('takes a path that names the sample at another address for the sample', async () => {
    // The skill was moved, copied or cloned since the run: the transcript holds the old address.
    const was = '/old/skill/evals/runs/r1/case-s1'
    const m = await metrics(
      [
        tool('Read', `${was}/.agents/skills/x/SKILL.md`),
        tool('Write', `${was}/outputs/a.md (40 chars)`),
        tool('Bash', `cd ${was}/outputs && cat ../input.md`),
        // Cut inside the old address: a prefix of what the agent typed.
        tool('Bash', `ls ${'-a '.repeat(50)}/old/skill/evals/ru…`),
        tool('Read', '/old/skill/evals/runs/r1/case-s2/outputs/a.md'),
        tool('Read', '/old/skill/evals/runs/r2/case-s1/outputs/a.md'),
        tool('Read', `${was}/../case-s2/outputs/b.md`),
        tool('Read', '/old/skill/SKILL.md'),
      ],
      {},
      '/new/home/skill/evals/runs/r1/case-s1',
    )
    expect(m.outside).toEqual([
      '/old/skill/evals/runs/r1/case-s2/outputs/a.md',
      '/old/skill/evals/runs/r2/case-s1/outputs/a.md',
      `${was}/../case-s2/outputs/b.md`,
      '/old/skill/SKILL.md',
    ])
  })

  it('reads a run kept in the repository as it was graded where it was made', async () => {
    const sample = resolve(
      import.meta.dirname,
      '../../../fixtures/design-skill/evals/runs/2026-10-30-skill-v0-claude-haiku/landing-s1',
    )
    const events = readFileSync(join(sample, 'transcript.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as TranscriptEvent)
    // The transcript was written on another machine, so every path in it has another root.
    expect(events[1].args).not.toContain(sample)
    expect(await metrics(events, {}, sample)).toMatchObject({
      outside: [],
      retries: 0,
      skillReadAt: 2,
      firstWriteAt: 6,
    })
  })

  it('reads time and cost from timing.json and the skill from .agents/skills', async () => {
    writeFileSync(join(dir, 'timing.json'), JSON.stringify({ durationMs: 41_600, costUsd: 0.02 }))
    mkdirSync(join(dir, '.agents/skills'), { recursive: true })
    const m = await metrics([tool('Read', 'x')], { maxTurns: 5 })
    expect(m).toMatchObject({ seconds: 42, costUsd: 0.02, skillPresent: true, maxTurns: 5 })
  })

  it('returns null without a transcript', async () => {
    const input = { transcript: [], dir } as unknown as JudgeInput
    expect(await workflowPack.judge(input, ctx)).toBeNull()
  })

  it('stores no answer to the question after an error that Jev left out, and keeps the counts', async () => {
    const ask = vi.fn(async (_state: unknown, _questions: Record<string, unknown>) => ({
      followed_task: { noul: 0.9 },
    }))
    const asking = { ...ctx, jev: { ask } as unknown as Jev, useJev: true }
    const events = [tool('Bash', 'ls'), ev('result', { tool: 'Bash', error: true })]
    const raw = await workflowPack.judge(inputOf(events), asking)
    expect(Object.keys(ask.mock.calls[0][1])).toEqual(['followed_task', 'recovered'])
    expect(raw?.jev).toEqual({ followedTask: 0.9, recovered: null })
    expect(raw?.metrics.errors).toBe(1)
    // The question every run is asked still needs its answer.
    ask.mockResolvedValueOnce({} as never)
    await expect(workflowPack.judge(inputOf(events), asking)).rejects.toThrow(MissingAnswerError)
  })

  it('asks nothing about a task when the output has no case', async () => {
    const ask = vi.fn(async (_state: unknown, _questions: Record<string, unknown>) => ({
      recovered: { noul: 0.8 },
    }))
    const asking = { ...ctx, jev: { ask } as unknown as Jev, useJev: true }
    const tidy = { ...inputOf([tool('Bash', 'ls')]), case: null }
    expect((await workflowPack.judge(tidy, asking))?.jev).toBeNull()
    expect(ask).not.toHaveBeenCalled()
    // What the agent did after an error needs no task to be judged.
    const failed = [tool('Bash', 'ls'), ev('result', { tool: 'Bash', error: true })]
    const raw = await workflowPack.judge({ ...inputOf(failed), case: null }, asking)
    expect(Object.keys(ask.mock.calls[0][0] as object)).toEqual(['transcript'])
    expect(Object.keys(ask.mock.calls[0][1])).toEqual(['recovered'])
    expect(raw?.jev).toEqual({ followedTask: null, recovered: 0.8 })
  })
})

describe('workflow scoring', () => {
  const base: WorkflowMetrics = {
    steps: 4,
    toolCalls: 3,
    errors: 0,
    retries: 0,
    seconds: 10,
    costUsd: null,
    outside: [],
    skillReadAt: 1,
    firstWriteAt: 2,
    skillPresent: true,
    wroteOutput: true,
    maxTurns: null,
    timeoutSeconds: null,
  }
  const score = (over: Partial<WorkflowMetrics>) =>
    workflowScoring.score({ metrics: { ...base, ...over }, jev: null }, subject, config)

  it('gives a clean run full efficiency and scope, process left to Jev', () => {
    const scored = score({})
    expect(scored).toMatchObject({ layers: { efficiency: 1, scope: 1, process: null }, flags: [] })
    expect(scored.verdicts.map((v) => [v.text, v.met, v.layer])).toEqual([
      ['No step repeated more than allowed', true, 'efficiency'],
      ['Stayed inside its own folder', true, 'scope'],
      // Without Jev there is no process layer for it to count in.
      ['Read the skill before writing', true, null],
    ])
  })

  it('counts process from Jev’s answers, with the reader’s own over them', () => {
    const raw = { metrics: base, jev: { followedTask: 0.2, recovered: null } }
    const jev = workflowScoring.score(raw, subject, config)
    // followed the task: no. Read the skill first: yes.
    expect(jev.layers.process).toBe(1 / 2)
    expect(jev.flags).toEqual(['transcript does not show the task being done as asked'])
    const own = workflowScoring.score(raw, subject, config, { 'other:followed task': true })
    expect(own.layers.process).toBe(1)
    expect(own.flags).toEqual([])
    expect(own.verdicts.filter((v) => v.corrected).map((v) => v.id)).toEqual([
      'other:followed task',
    ])
  })

  it('counts process from the answers there are, and leaves it out when there is none', () => {
    const only = { metrics: base, jev: { followedTask: null, recovered: 0.2 } }
    const scored = workflowScoring.score(only, subject, config)
    // Changed course after an error: no. Read the skill first: yes.
    expect(scored.layers.process).toBe(1 / 2)
    expect(scored.flags).toEqual(['after an error the agent repeated itself'])
    expect(scored.verdicts.map((v) => v.id)).toEqual([
      'other:retries',
      'other:scope',
      'other:read first',
      'other:recovered',
    ])
    const none = { metrics: base, jev: { followedTask: null, recovered: null } }
    const unasked = workflowScoring.score(none, subject, config)
    expect(unasked.layers).toEqual({ efficiency: 1, scope: 1, process: null })
    expect(unasked.verdicts.find((v) => v.id === 'other:read first')?.layer).toBeNull()
  })

  it('loses efficiency checks for repeats and the case limits', () => {
    const { layers, flags } = score({ retries: 2, maxTurns: 2, timeoutSeconds: 20 })
    expect(layers.efficiency).toBe(1 / 3)
    expect(flags).toEqual(['2 repeated tool call(s)', '3 tool calls, case allows 2'])
  })

  it('takes nothing off for an error: a check that fails before the fix is the work going right', () => {
    const scored = score({ errors: 3 })
    expect(scored.layers.efficiency).toBe(1)
    expect(scored.flags).toEqual([])
  })

  it('zeroes scope for a path outside and flags a write before the skill read', () => {
    const { layers, flags } = score({ outside: ['/etc2/x'], skillReadAt: 3, wroteOutput: false })
    expect(layers.scope).toBe(0)
    expect(flags).toEqual([
      'nothing written to outputs/',
      'reached outside the sample: /etc2/x',
      'skill not read before writing',
    ])
  })

  it('scores a run that wrote nothing 0 on every layer, however tidy its transcript', () => {
    const raw = { metrics: base, jev: { followedTask: 0.9, recovered: null } }
    expect(workflowScoring.score(raw, subject, config).layers).toEqual({
      efficiency: 1,
      scope: 1,
      process: 1,
    })
    const zero = { efficiency: 0, scope: 0, process: 0 }
    // Nothing under outputs/.
    const none = { metrics: { ...base, wroteOutput: false }, jev: raw.jev }
    expect(workflowScoring.score(none, subject, config).layers).toEqual(zero)
    // No file to judge, and a file that says nothing.
    expect(workflowScoring.score(raw, { ...subject, primary: null }, config).layers).toEqual(zero)
    expect(
      workflowScoring.score(raw, { ...subject, words: 0, blank: true }, config).layers,
    ).toEqual(zero)
    // A file with no word in it, such as `{}`, is still an output.
    expect(
      workflowScoring.score(raw, { ...subject, words: 0, blank: false }, config).layers,
    ).toEqual({ efficiency: 1, scope: 1, process: 1 })
    // A layer that was not scored stays out, it does not turn into a 0.
    expect(workflowScoring.score({ ...none, jev: null }, subject, config).layers.process).toBeNull()
  })
})

describe('the summary Jev reads', () => {
  const events = Array.from({ length: 10 }, (_, i) => ({
    step: i + 1,
    at: i,
    kind: 'text' as const,
    text: `line ${i + 1}`,
  }))

  it('keeps the head and the tail and says how many steps were left out', () => {
    expect(summarize(events, 4).split('\n')).toEqual([
      '1. text line 1',
      '2. text line 2',
      '… 6 steps left out …',
      '9. text line 9',
      '10. text line 10',
    ])
  })

  it('never sends the whole transcript for a length of 0 or less', () => {
    for (const lines of [0, -3, Number.NaN])
      expect(summarize(events, lines).split('\n')).toEqual([
        '1. text line 1',
        '… 8 steps left out …',
        '10. text line 10',
      ])
  })
})
