/*
  A heading that is decoded rather than faded in.

  The heading's own text never moves. It stays in the flow, laid out exactly
  as it will be once the effect is over, and is only made transparent for the
  duration. What animates is a layer on top of it: one box per character,
  pinned to the rectangle that character occupies in the real layout (measured
  with a Range, so kerning, letter-spacing, `text-wrap: balance` and the line
  breaks are all the page's own). A box cycles through random glyphs until it
  locks, then shows its character in the heading's colour. Once every box has
  locked the layer comes out and the heading is the plain text it always was.

  The characters are not wrapped in place on purpose: a run of inline boxes
  is a run of line-break opportunities, which lets a word wrap inside itself
  while the effect runs and jump back when it ends.

  The pins are in pixels, so a heading that changes size mid-way (a resize, a
  font arriving late) ends its decode at once rather than animating over a
  layout that has moved from under it.
*/
const GLYPHS = '<>-_/\\|[]{}=+*^~:;'

export interface DecodeOptions {
  duration?: number
}

interface Cell {
  el: HTMLSpanElement
  ch: string
  lock: number
}

export function decode(el: HTMLElement, opts: DecodeOptions = {}): () => void {
  const duration = opts.duration ?? 900
  if (el.dataset.decoded) return () => {}
  el.dataset.decoded = '1'

  const base = el.getBoundingClientRect()
  const ox = base.left + el.clientLeft
  const oy = base.top + el.clientTop
  const layer = document.createElement('span')
  layer.className = 'ascii-dc-layer'
  layer.setAttribute('aria-hidden', 'true')
  const cells: Cell[] = []
  const range = document.createRange()
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const node = n as Text
    let at = 0
    for (const ch of node.data) {
      const from = at
      at += ch.length
      if (/\s/.test(ch)) continue
      range.setStart(node, from)
      range.setEnd(node, at)
      // A character has one rectangle; a browser may add an empty one at a
      // line's end, so the widest is the real one.
      let r: DOMRect | undefined
      for (const c of range.getClientRects()) if (!r || c.width > r.width) r = c
      if (!r || r.width <= 0) continue
      const s = document.createElement('span')
      s.className = 'ascii-dc ascii-dc-rnd'
      s.textContent = ch
      s.style.cssText =
        `left:${r.left - ox}px;top:${r.top - oy}px;` +
        `width:${r.width}px;height:${r.height}px;line-height:${r.height}px`
      layer.append(s)
      cells.push({ el: s, ch, lock: 0 })
    }
  }
  if (cells.length === 0) return () => {}

  // Left to right with a little jitter.
  cells.forEach((c, i) => {
    c.lock = duration * (0.3 + (0.7 * i) / Math.max(1, cells.length - 1)) * (0.7 + 0.3 * Math.random())
  })

  const style = getComputedStyle(el)
  const was = { position: el.style.position, color: el.style.color }
  layer.style.color = style.color
  if (style.position === 'static') el.style.position = 'relative'
  el.style.color = 'transparent'
  el.append(layer)

  let raf = 0
  let ro: ResizeObserver | undefined
  const finish = (): void => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    ro?.disconnect()
    layer.remove()
    el.style.position = was.position
    el.style.color = was.color
  }

  if (typeof ResizeObserver === 'function') {
    const w0 = el.clientWidth
    const h0 = el.clientHeight
    ro = new ResizeObserver(() => {
      if (el.clientWidth !== w0 || el.clientHeight !== h0) finish()
    })
    ro.observe(el)
  }

  const start = performance.now()
  let tick = 0
  const frame = (now: number): void => {
    raf = 0
    const t = now - start
    let pending = 0
    const roll = Math.floor(t / 45) !== tick
    tick = Math.floor(t / 45)
    for (const c of cells) {
      if (t >= c.lock) {
        if (c.el.classList.contains('ascii-dc-rnd')) {
          c.el.textContent = c.ch
          c.el.classList.remove('ascii-dc-rnd')
        }
        continue
      }
      pending++
      if (roll) c.el.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)] ?? c.ch
    }
    if (pending > 0) raf = requestAnimationFrame(frame)
    else finish()
  }
  raf = requestAnimationFrame(frame)

  return finish
}

/**
 * Decodes each matching heading the first time it comes into view. Waits for
 * the page's fonts first: the pins are measured from the type as it is.
 */
export function decodeOnView(selector: string, opts: DecodeOptions = {}): () => void {
  let io: IntersectionObserver | undefined
  let off = false
  const ready = 'fonts' in document ? document.fonts.ready : Promise.resolve()
  void ready.then(() => {
    if (off) return
    io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          io?.unobserve(e.target)
          decode(e.target as HTMLElement, opts)
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    )
    for (const el of document.querySelectorAll<HTMLElement>(selector)) io.observe(el)
  })
  return () => {
    off = true
    io?.disconnect()
  }
}
