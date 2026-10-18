/*
  The ASCII layer, loaded after the page's own motion has started and only
  where it can run: WebGL2, no reduced-motion preference. The layout signs
  it off before first paint with `html.ascii` (and `html.ascii-object` from
  1000 px up), so the styles that make room for it apply from the start and
  nothing reflows when it arrives.

  Four things, in the order they are seen: the hero portrait materialises
  out of coloured glyphs; the object takes its place beside the content and
  follows the page down; the headings decode as they come into view; the
  photographs inside the product previews are set as ASCII the pointer
  uncovers.
*/
import { decodeOnView } from './decode'
import { mountObject } from './object'
import { mountAsciiImage } from './picture'

export async function mount(): Promise<void> {
  const html = document.documentElement
  const portrait = document.querySelector<HTMLElement>('figure.me picture')
  const first = portrait ? mountAsciiImage(portrait, {}) : Promise.resolve(null)

  if (html.classList.contains('ascii-object')) {
    const object = await mountObject()
    // No context after all: the room made for it is given back.
    if (!object) html.classList.remove('ascii-object')
  }

  decodeOnView('h1, .h-section, .project h3')
  for (const pic of document.querySelectorAll<HTMLElement>('.stage picture')) {
    void mountAsciiImage(pic, { end: 'ascii', trigger: 'none', cell: 5, levels: 0, bg: [0.03, 0.03, 0.04] })
  }
  if (!(await first)) html.classList.remove('ascii')
}
