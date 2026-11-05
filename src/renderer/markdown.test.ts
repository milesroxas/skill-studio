import { describe, expect, it } from 'vitest'
import { markdownHtml } from './markdown.ts'

describe('markdownHtml images', () => {
  const images = { 'images/loop.svg': '/assets/loop-abc.svg' }

  it('shows a listed picture that stands alone in its paragraph', () => {
    const html = markdownHtml('Before.\n\n![The "loop"](images/loop.svg)\n\nAfter.', { images })
    expect(html).toBe(
      '<p>Before.</p>' +
        '<figure data-type="svg"><img src="/assets/loop-abc.svg" alt="The &quot;loop&quot;" decoding="async"></figure>' +
        '<p>After.</p>',
    )
  })

  it('keeps a picture that is not listed as text, so a document cannot make the app fetch one', () => {
    const html = markdownHtml('![x](https://example.com/x.png)', { images })
    expect(html).not.toContain('<img')
    expect(html).toContain('class="aside"')
  })

  it('shows no pictures when none are listed', () => {
    expect(markdownHtml('![x](images/loop.svg)')).not.toContain('<img')
  })
})
