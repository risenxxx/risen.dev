/*
  The ASCII layer, loaded after the page's own motion has started and only
  where it can run: WebGL2, no reduced-motion preference. The layout signs
  it off before first paint with `html.ascii` (and `html.ascii-object` from
  1000 px up), so the styles that make room for it apply from the start and
  nothing reflows when it arrives.

  Four things, in the order they are started: the headings decode as they
  come into view; the hero portrait materialises out of coloured glyphs; the
  object takes its place beside the content and follows the page down; the
  photographs inside the product previews are set as ASCII the pointer
  uncovers. The headings go first because they are the cheapest effect and
  the nearest the eye; the object goes last, once the thread is idle,
  because it is the most work and replaces nothing.

  The layer may be late. The page has been painted without it, and whatever
  the reader has already been looking at is not taken back and redone: a
  heading on screen past the first moments stays as it is, and a photograph
  the style has let through (ascii.css gives it a moment, then shows it)
  stays a photograph. What is still to come into view gets the layer in full.
*/
import { decodeOnView } from './decode'
import { mountObject } from './object'
import { mountAsciiImage } from './picture'

/** Past this long after first paint the page counts as read: what is on screen already stays. ms */
const LATE = 900

const idle = (fn: () => void): void => {
  if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout: 800 })
  else setTimeout(fn, 1)
}

/** Whether the page has let a picture's photograph show: the style's own fallback has run, or is running. */
const shown = (picture: Element): boolean => {
  const img = picture.querySelector('img')
  return !img || getComputedStyle(img).opacity !== '0'
}

/**
 * Takes a picture on, unless the page has shown it already. `ascii-pending`
 * tells the style the layer has it from here: the fallback that would let
 * the photograph through stands down, and the image stays out of sight
 * until the canvas is over it — however long it takes to load. If the
 * canvas cannot be made after all, the image is let through at once.
 */
const take = (picture: HTMLElement, opts: Parameters<typeof mountAsciiImage>[1]): void => {
  if (shown(picture)) return
  picture.classList.add('ascii-pending')
  void mountAsciiImage(picture, opts).then((made) => {
    if (!made) picture.classList.add('ascii-covered')
  })
}

export function mount(): void {
  const html = document.documentElement
  const paint = performance.getEntriesByName('first-contentful-paint')[0]?.startTime
  const late = paint !== undefined && performance.now() - paint > LATE

  decodeOnView('h1, .h-section, .project h3', { skipVisible: late })

  const portrait = document.querySelector<HTMLElement>('figure.me picture')
  if (portrait) take(portrait, {})

  idle(() => {
    if (html.classList.contains('ascii-object')) {
      void mountObject().then((object) => {
        // No context after all: the room made for it is given back.
        if (!object) html.classList.remove('ascii-object')
      })
    }
    for (const pic of document.querySelectorAll<HTMLElement>('.stage picture')) {
      take(pic, { end: 'ascii', trigger: 'none', cell: 5, levels: 0, bg: [0.03, 0.03, 0.04] })
    }
  })
}
