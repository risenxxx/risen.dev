/*
  The whole motion system, and deliberately small.

  Three behaviours, one loop:

  - `[data-reveal]` gets `.in` when it first crosses into view, and CSS does the
    rest with a transition plus a `--dl` stagger.
  - `[data-scene]` gets `--p`, a number from 0 to 1, animated once over
    `data-dur` milliseconds while the element is on screen. The previews read it
    for every value that moves — a bar width, a rotation, an opacity — so a
    scene is written in CSS and this file never touches a product's markup.
  - `[data-count]` counts a figure up to the value already printed in the HTML.

  Nothing here reads `scrollY`. Progress comes from the element entering view,
  never from the page's position, which is what keeps the page scrolling at its
  normal speed instead of holding the reader inside a section. The rAF loop runs
  only while a scene is mid-flight and stops itself afterwards.
*/

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)')

/** Cubic ease-out: fast to start, settles rather than arrives. */
const easeOut = (t: number): number => 1 - (1 - t) ** 3

type Scene = { el: HTMLElement; start: number; dur: number }

const running: Scene[] = []
let frame = 0

function tick(now: number): void {
  frame = 0
  for (let i = running.length - 1; i >= 0; i--) {
    const scene = running[i]
    if (!scene) continue
    const t = Math.min(1, (now - scene.start) / scene.dur)
    scene.el.style.setProperty('--p', easeOut(t).toFixed(4))
    if (t >= 1) running.splice(i, 1)
  }
  if (running.length > 0) frame = requestAnimationFrame(tick)
}

function play(el: HTMLElement, dur: number): void {
  running.push({ el, start: performance.now(), dur })
  if (frame === 0) frame = requestAnimationFrame(tick)
}

type Counter = { el: HTMLElement; to: number; decimals: number; prefix: string; suffix: string; start: number }

const counting: Counter[] = []
let countFrame = 0

function countTick(now: number): void {
  countFrame = 0
  for (let i = counting.length - 1; i >= 0; i--) {
    const c = counting[i]
    if (!c) continue
    const t = Math.min(1, (now - c.start) / 900)
    const value = easeOut(t) * c.to
    c.el.textContent = `${c.prefix}${value.toFixed(c.decimals)}${c.suffix}`
    if (t >= 1) counting.splice(i, 1)
  }
  if (counting.length > 0) countFrame = requestAnimationFrame(countTick)
}

function count(el: HTMLElement): void {
  const to = Number(el.dataset.count)
  if (!Number.isFinite(to)) return
  const decimals = Number(el.dataset.decimals ?? 0)
  counting.push({
    el,
    to,
    decimals,
    prefix: el.dataset.prefix ?? '',
    suffix: el.dataset.suffix ?? '',
    start: performance.now(),
  })
  if (countFrame === 0) countFrame = requestAnimationFrame(countTick)
}

/*
  The reference figure is panned, not shrunk: below a laptop it would have to
  come down past the width at which its labels stop being letters. Overflow
  already scrolls it — what overflow does not do is admit that it is there. This
  adds the three things that do: fades that follow the scroll position, a thumb
  sized to the slice on screen, and dragging for a mouse, which has no swipe.

  It runs whatever the reduced-motion setting says, because none of it is
  motion — it is the difference between a figure the reader can finish and one
  that appears to be cut off.
*/
function pan(): void {
  for (const scroller of document.querySelectorAll<HTMLElement>('[data-pan]')) {
    const frame = scroller.closest<HTMLElement>('[data-pan-frame]')
    if (!frame) continue
    const thumb = frame.querySelector<HTMLElement>('[data-pan-bar]')

    const update = (): void => {
      const slack = scroller.scrollWidth - scroller.clientWidth
      frame.classList.add('measured')
      frame.classList.toggle('pannable', slack > 1)
      frame.classList.toggle('at-start', scroller.scrollLeft <= 1)
      frame.classList.toggle('at-end', slack - scroller.scrollLeft <= 1)
      if (!thumb) return
      // The thumb is the share of the track that the visible slice is of the
      // figure, and it travels whatever width that leaves.
      const share = scroller.clientWidth / scroller.scrollWidth
      const done = slack > 0 ? scroller.scrollLeft / slack : 0
      thumb.style.setProperty('--w', `${share * 100}%`)
      thumb.style.setProperty('--x', `${done * (1 - share) * 100}%`)
    }

    update()

    scroller.addEventListener(
      'scroll',
      () => {
        // Far enough to be a pan rather than a nudge: the hint has done its job.
        if (scroller.scrollLeft > 8) frame.classList.add('panned')
        update()
      },
      { passive: true },
    )
    addEventListener('resize', update)

    // Touch pans the scroller on its own; a mouse has to be handed the grab.
    let from = -1
    let at = 0

    scroller.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || !frame.classList.contains('pannable')) return
      from = e.clientX
      at = scroller.scrollLeft
      scroller.setPointerCapture(e.pointerId)
      frame.classList.add('dragging')
    })

    scroller.addEventListener('pointermove', (e) => {
      if (from < 0) return
      e.preventDefault()
      scroller.scrollLeft = at - (e.clientX - from)
    })

    const drop = (): void => {
      from = -1
      frame.classList.remove('dragging')
    }

    scroller.addEventListener('pointerup', drop)
    scroller.addEventListener('pointercancel', drop)
  }
}

export function initMotion(): void {
  /*
    First, and outside everything below it: panning is an affordance, not an
    animation, so it survives both reduced motion and a browser without an
    IntersectionObserver. If it throws, the caller drops `html.js` and the page
    renders in its finished state — the figure still scrolls, it just stops
    saying so.
  */
  pan()

  // A scene that never runs must not be left blank, so the reduced-motion and
  // no-IntersectionObserver paths both mean "show the finished state", which is
  // what the CSS default already is once `html.js` is not in force.
  if (REDUCED.matches || typeof IntersectionObserver !== 'function') {
    document.documentElement.classList.remove('js')
    return
  }

  const seen = new WeakSet<Element>()
  let fired = false

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        fired = true
        const el = entry.target as HTMLElement
        if (seen.has(el)) continue
        seen.add(el)
        observer.unobserve(el)

        if (el.hasAttribute('data-reveal')) el.classList.add('in')
        if (el.hasAttribute('data-scene')) play(el, Number(el.dataset.dur ?? 900))
        if (el.hasAttribute('data-count')) count(el)
      }
    },
    // Twelve per cent up from the bottom edge: a section starts moving once it
    // is genuinely being looked at, not the instant its first pixel appears.
    { rootMargin: '0px 0px -12% 0px', threshold: 0 },
  )

  for (const el of document.querySelectorAll('[data-reveal], [data-scene], [data-count]')) {
    observer.observe(el)
  }

  /*
    The failsafe, and the reason it exists: everything on this page starts
    hidden and is revealed by the observer, so an observer that never reports
    would leave a blank page behind a working navigation bar. The hero is above
    the fold, so on any browser that works the first callback lands immediately;
    if nothing has landed after two and a half seconds, something is wrong and
    the page gives up on animating rather than on being readable.
  */
  setTimeout(() => {
    if (!fired) {
      observer.disconnect()
      document.documentElement.classList.remove('js')
    }
  }, 2500)

  // Somebody can turn reduced motion on while the page is open.
  REDUCED.addEventListener('change', () => {
    if (!REDUCED.matches) return
    observer.disconnect()
    running.length = 0
    counting.length = 0
    document.documentElement.classList.remove('js')
  })
}
