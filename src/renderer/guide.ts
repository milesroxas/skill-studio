/** The guide's sections, read from its Markdown: the Guide screen links to them, and so does the help. */
import { slug } from '@domain/text.ts'

export interface GuideSection {
  id: string
  title: string
}

/** Longer than any heading the guide has, so an id is the whole heading. */
const ID_MAX = 96

/** One section per `##` heading, in order, each with the id its heading gets on the page. */
export const guideSections = (text: string): GuideSection[] =>
  [...text.matchAll(/^## (.+)$/gm)].map((m) => {
    const title = m[1].replace(/`/g, '')
    return { id: slug(title, ID_MAX), title }
  })
