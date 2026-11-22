/**
 * Each stored output changed to miss rules it may have met, so a reading is
 * counted on misses as well as meets: the stored runs hold few misses. Shared
 * by `sorted.ts` and `src/interfaces/cli/exact-key.test.ts`.
 */
import type { ExactSubject } from '@domain/exact.ts'

const MUTATIONS: ReadonlyArray<[string, (output: { subject: ExactSubject }) => string | null]> = [
  [
    'a sentence with a banned word, a number and users',
    ({ subject: s }) => {
      const words = 'We are thrilled that 500 users joined.'
      return s.kind === 'html'
        ? s.output.replace(/<\/body>/i, `<p>${words}</p></body>`)
        : `${s.output.trimEnd()}\n\n${words}\n`
    },
  ],
  [
    'a second link',
    ({ subject: s }) =>
      s.kind === 'html'
        ? s.output.replace(/<\/main>/i, '<a href="https://ferry.example/help">Help</a></main>')
        : s.output.replace(/\n\n/, '\n\nhttps://ferry.example/help\n\n'),
  ],
  [
    'the headline reworded',
    ({ subject: s }) => {
      const headline = /^Headline: (.+)$/m.exec(s.files['brief.md'] ?? '')?.[1]
      return headline && s.output.includes(headline)
        ? s.output.replaceAll(headline, 'News from the team.')
        : null
    },
  ],
  [
    'Markdown, a script and a colour off the brief',
    ({ subject: s }) =>
      s.kind === 'html'
        ? s.output.replace(/<\/style>/i, 'p { color: #123456 }</style><script>1</script>')
        : s.output.replace(/\n\n/, '\n\n- **New**\n\n'),
  ],
  [
    'the closing lines and the footer moved',
    ({ subject: s }) => {
      if (s.kind === 'html') return s.output.replace(/<footer[\s\S]*?<\/footer>/i, '')
      const lines = s.output.trimEnd().split('\n')
      return [...lines.slice(0, -3), lines.at(-1), ...lines.slice(-3, -1)].join('\n')
    },
  ],
  [
    'every feature and the price left out',
    ({ subject: s }) => {
      const brief = s.files['brief.md'] ?? ''
      const names = [...brief.matchAll(/^- ([^:]+):/gm)].map((m) => m[1])
      let out = s.output.replaceAll('12 USD', 'twelve dollars')
      for (const name of names) out = out.replaceAll(name, 'it')
      return out === s.output ? null : out
    },
  ],
  [
    'a change left out whose name starts a longer one',
    ({ subject: s }) => {
      // "Faster calendar sync" left out while "Faster calendar sync, part 2" stays: the shorter is not found inside the longer.
      const titles = [...(s.files['changes.md'] ?? '').matchAll(/^## \d+\. (.+)$/gm)].map((m) =>
        m[1].trim(),
      )
      const title = titles.find((t) => titles.some((u) => u !== t && u.startsWith(`${t}, `)))
      if (!title || s.kind !== 'html') return null
      const heading = new RegExp(
        `<h2\\b[^>]*>(?:(?!</h2>)[\\s\\S])*?${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*</h2>`,
        'i',
      )
      return heading.test(s.output) ? s.output.replace(heading, '') : null
    },
  ],
]

/** Each output once per change that alters it, named for the change. */
export function mutated<T extends { sample: string; subject: ExactSubject }>(
  list: readonly T[],
): T[] {
  return list.flatMap((output) =>
    MUTATIONS.flatMap(([name, change]) => {
      const changed = change(output)
      return changed === null || changed === output.subject.output
        ? []
        : [
            {
              ...output,
              sample: `${output.sample} (${name})`,
              subject: { ...output.subject, output: changed },
            },
          ]
    }),
  )
}
