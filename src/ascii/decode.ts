/*
  A heading that is decoded rather than faded in.

  Every character is wrapped in a span fixed to its own width, so the random
  glyphs it cycles through before locking never move the line. The width is
  kept in em, because the headings are sized from the viewport and a width
  in pixels would hold while the letters shrank or grew under it. Characters
  lock left to right with a little jitter; the ones still cycling are tinted.
  Once every one has locked the spans come out again and the heading is the
  plain text it was: nothing about it is left for a resize to break.
*/
const GLYPHS = '<>-_/\\|[]{}=+*^~:;'

export interface DecodeOptions {
  duration?: number
}

export function decode(el: HTMLElement, opts: DecodeOptions = {}): () => void {
  const duration = opts.duration ?? 900
  if (el.dataset.decoded) return () => {}
  el.dataset.decoded = '1'

  const original = el.textContent ?? ''
  el.setAttribute('aria-label', original.replace(/\s+/g, ' ').trim())

  const spans: { el: HTMLSpanElement; ch: string; lock: number }[] = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text)

  for (const node of nodes) {
    const frag = document.createDocumentFragment()
    for (const ch of node.data) {
      if (/\s/.test(ch)) {
        frag.append(ch)
        continue
      }
      const s = document.createElement('span')
      s.className = 'ascii-dc'
      s.textContent = ch
      frag.append(s)
      spans.push({ el: s, ch, lock: 0 })
    }
    node.replaceWith(frag)
  }

  // One layout pass for every width, then every span is pinned to it — in
  // em, so the pins scale with the type if the window changes meanwhile.
  const widths = spans.map((s) => s.el.getBoundingClientRect().width)
  const fontSize = parseFloat(getComputedStyle(el).fontSize) || 16
  spans.forEach((s, i) => {
    s.el.style.width = `${((widths[i] ?? 0) / fontSize).toFixed(4)}em`
    s.el.classList.add('ascii-dc-rnd')
    s.lock = duration * (0.3 + (0.7 * i) / Math.max(1, spans.length - 1)) * (0.7 + 0.3 * Math.random())
  })

  // The heading as it was: the spans replaced by their characters, the text
  // nodes merged back together.
  const unwrap = (): void => {
    for (const s of spans) s.el.replaceWith(document.createTextNode(s.ch))
    el.normalize()
    el.removeAttribute('aria-label')
  }

  const start = performance.now()
  let tick = 0
  let raf = 0
  const frame = (now: number): void => {
    raf = 0
    const t = now - start
    let pending = 0
    const roll = Math.floor(t / 45) !== tick
    tick = Math.floor(t / 45)
    for (const s of spans) {
      if (t >= s.lock) {
        if (s.el.classList.contains('ascii-dc-rnd')) {
          s.el.textContent = s.ch
          s.el.classList.remove('ascii-dc-rnd')
        }
        continue
      }
      pending++
      if (roll) s.el.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)] ?? s.ch
    }
    if (pending > 0) raf = requestAnimationFrame(frame)
    else unwrap()
  }
  raf = requestAnimationFrame(frame)

  return () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    if (el.contains(spans[0]?.el ?? null)) unwrap()
  }
}

/** Decodes each matching heading the first time it comes into view. */
export function decodeOnView(selector: string, opts: DecodeOptions = {}): () => void {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        io.unobserve(e.target)
        decode(e.target as HTMLElement, opts)
      }
    },
    { rootMargin: '0px 0px -12% 0px' },
  )
  for (const el of document.querySelectorAll<HTMLElement>(selector)) io.observe(el)
  return () => io.disconnect()
}
