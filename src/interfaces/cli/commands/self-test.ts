import { gradeAnchors, selfTest } from '@application/grade.ts'
import type { Command } from './command.ts'
import { GRADING, shared } from './flags.ts'
import { noteNoKey, pad, padEnd, printReport, skillOf } from './shared.ts'

export const selfTestCommand: Command = {
  name: 'self-test',
  help: [
    '  self-test                   Grade evals/anchors and check bad anchors lose to good ones.',
  ],
  flags: shared(...GRADING),
  agents: false,
  async run(context) {
    noteNoKey(context)
    const { skill } = skillOf(context.args)
    const report = await gradeAnchors(skill, context.jev)
    printReport(report)
    const { lines, failures } = selfTest(report)
    console.log(
      '\nSelf-test: each bad anchor must score below every good anchor of its case on what it tests.',
    )
    for (const l of lines)
      console.log(
        `  ${l.ok ? 'ok  ' : 'FAIL'} ${padEnd(l.bad, 40)} ${padEnd(l.layer, 12)} good ${pad(l.good, 4)}  bad ${pad(l.badScore, 4)}  ${l.against ? `against ${l.against}` : 'no good anchor of its case'}`,
      )
    // With no bad anchor at all, nothing was checked.
    if (!lines.length) {
      console.log('\nNothing was checked: there is no bad anchor.')
      return 1
    }
    console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.')
    return failures ? 1 : 0
  },
}
