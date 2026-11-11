import { describe, expect, it } from 'vitest'
import { drawnArtifact, primaryArtifact } from './primary.ts'
import type { Artifact } from './schemas.ts'

const md = (file: string): Artifact => ({ file: `outputs/${file}`, kind: 'markdown' })
const page = (file: string): Artifact => ({ file: `outputs/${file}`, kind: 'html' })
const code = (file: string): Artifact => ({ file: `outputs/${file}`, kind: 'code' })
const picture = (file: string): Artifact => ({ file: `outputs/${file}`, kind: 'image' })

describe('primaryArtifact', () => {
  it('takes the case’s kind first', () => {
    expect(primaryArtifact([code('app.js'), page('index.html')], 'html')).toEqual(
      page('index.html'),
    )
    expect(primaryArtifact([md('notes.md'), page('index.html')], 'markdown', ['html'])).toEqual(
      md('notes.md'),
    )
  })

  it('takes a page, a picture or code a pack judges over Markdown beside it', () => {
    const files = [md('README.md'), code('app.js'), page('index.html')]
    expect(primaryArtifact(files, undefined, ['markdown', 'html', 'image'])).toEqual(
      page('index.html'),
    )
    expect(primaryArtifact([md('notes.txt'), page('index.html')], undefined, ['html'])).toEqual(
      page('index.html'),
    )
    expect(
      primaryArtifact([md('README.md'), code('main.ts')], undefined, ['markdown', 'code']),
    ).toEqual(code('main.ts'))
  })

  it('does not let the order of the packs decide', () => {
    const files = [code('app.js'), page('index.html')]
    expect(primaryArtifact(files, undefined, ['code', 'html', 'image'])).toEqual(page('index.html'))
    expect(primaryArtifact(files, undefined, ['html', 'image', 'code'])).toEqual(page('index.html'))
  })

  it('takes Markdown when no pack judges the other kinds, then a page, a picture or code', () => {
    expect(primaryArtifact([code('app.js'), md('post.md')], undefined, ['markdown'])).toEqual(
      md('post.md'),
    )
    // A skill graded on its rules alone that made a page: the page is judged, not the script beside it.
    expect(primaryArtifact([code('app.js'), page('index.html')], undefined)).toEqual(
      page('index.html'),
    )
    expect(primaryArtifact([], undefined)).toBeNull()
  })

  it('reads a main page first, and a README or a .txt note last', () => {
    expect(
      primaryArtifact([page('about.html'), page('preview.html')], undefined, ['html']),
    ).toEqual(page('preview.html'))
    expect(primaryArtifact([md('README.md'), md('article.md')], undefined)).toEqual(
      md('article.md'),
    )
    expect(primaryArtifact([md('notes.txt'), md('post.md')], undefined)).toEqual(md('post.md'))
    expect(primaryArtifact([md('a/readme.txt'), md('notes.txt')], undefined)).toEqual(
      md('notes.txt'),
    )
  })
})

describe('drawnArtifact', () => {
  it('takes the primary when it is drawn, else the main page, else a picture', () => {
    expect(drawnArtifact([picture('hero.png')], picture('hero.png'))).toEqual(picture('hero.png'))
    const files = [picture('hero.png'), page('about.html'), page('index.html'), md('post.md')]
    expect(drawnArtifact(files, md('post.md'))).toEqual(page('index.html'))
    expect(drawnArtifact([picture('hero.png'), md('post.md')], md('post.md'))).toEqual(
      picture('hero.png'),
    )
    expect(drawnArtifact([md('post.md')], md('post.md'))).toBeNull()
  })
})
