/*
  One ASCII object on the dark page.

  A solid, drawn by the renderer, that lives in each section at a place
  calibrated for it (`sections.ts`) and scrolls with the page. A new section
  flies it, in document space, to its new place over 1.2 s. In a pinned
  section, or inside a column the copy wraps round, it follows the scroll
  between two bounds. If the layout has put text under the calibrated place
  it slides to the nearest clear one within reach, and failing that shrinks
  and dims; a section whose cards are in front never needs either.

  The section it answers to is read with the direction of travel: it
  advances once a point three quarters of the way down the viewport (a
  quarter, going up) is well inside the next section, and never goes back
  while the page keeps moving the same way, so a boundary is crossed once.
  A mark meant to be seen face on sways instead of turning, and the turn
  into a mark takes the short way round.
*/
import { buildAtlas } from './atlas'
import { getGL, REDUCED } from './gl'
import { box, covered, inkBoxes, type Box } from './layout'
import { createRenderer, type Item, type RGB } from './renderer'
import { hexToRgb, sectionByKey, type Section } from './sections'
import { SHAPES, shapeIndex } from './shapes'

export interface ObjectOptions {
  /** Base cell height, CSS px, for a plain solid at the usual size; a shape's detail and the object's size scale it. */
  cell?: number
  alpha?: number
  /** Size as a share of the viewport height, before a section's own factor. */
  size?: number
  /** Turns per second, before the scroll adds to it. */
  spin?: number
}

export interface AsciiObject {
  set(opts: ObjectOptions): void
  destroy(): void
}

/**
 * Where the object's tablet profile begins. The page stacks its project rows
 * at 1180 on its own; for the object they stack from here, because a row
 * below a full desktop width cannot hold the mock, the object and the copy,
 * and the hero's lede and the object collide. Between the two the page's
 * own layout is still the desktop one, and a profile's `wide` part applies.
 */
const TABLET = 1400
const PAGE_TABLET = 1180


const DEFAULTS: Required<ObjectOptions> = { cell: 6, alpha: 1, size: 0.4, spin: 0.08 }

/** The reference size a shape's glyph cell is tuned at, px. */
const USUAL = 260

type Glide = Section['glide']

const ease = (u: number): number => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2)
const wrap = (r: number): number => Math.atan2(Math.sin(r), Math.cos(r))
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k

export async function mountObject(opts: ObjectOptions = {}): Promise<AsciiObject | null> {
  if (REDUCED.matches) return null
  const o: Required<ObjectOptions> = { ...DEFAULTS, ...opts }

  /** The section's place, with the tablet profile merged in where it applies. */
  const glideOf = (section: Section): Glide => {
    if (innerWidth > TABLET || !section.glide.tablet) return section.glide
    const { wide, ...t } = section.glide.tablet
    return { ...section.glide, ...t, ...(innerWidth > PAGE_TABLET ? wide : undefined) }
  }

  const atlas = await buildAtlas(20, 64, 0.6, 0.035)

  const canvas = document.createElement('canvas')
  canvas.className = 'ascii-bg'
  canvas.setAttribute('aria-hidden', 'true')
  document.body.prepend(canvas)

  const gl = getGL(canvas)
  if (!gl) {
    canvas.remove()
    return null
  }
  const renderer = createRenderer(gl, canvas, atlas)
  renderer.trail = { life: 0.6, alpha: 0.6, cell: o.cell }

  // The sections the object answers to, and the ink it keeps away from.
  let stops: { el: HTMLElement; box: Box; section: Section }[] = []
  let ink: Box[] = []
  const measure = (): void => {
    stops = []
    for (const el of document.querySelectorAll<HTMLElement>('[data-object]')) {
      const section = sectionByKey(el.dataset.object ?? '')
      if (section) stops.push({ el, box: box(el), section })
    }
    ink = inkBoxes('main :is(h1, h2, h3, h4, p, li, dd, dt, figcaption, .btn, .pill, picture, .stage .inner > *, figure, [data-pan-frame])')
  }

  // Where a section's copy has to make room for the object, a float goes in
  // at the top of the copy and the text wraps round it; the object then
  // takes the float's box as its place. The float is a column down to the
  // limit element's edge, measured with the float first made very tall so
  // everything above the limit is already wrapped beside it.
  for (const el of document.querySelectorAll<HTMLElement>('[data-object]')) {
    const section = sectionByKey(el.dataset.object ?? '')
    const g = section ? glideOf(section) : undefined
    const copy = el.querySelector<HTMLElement>('.copy')
    if (!g?.column || !copy || copy.querySelector('.ascii-float')) continue
    // The row gives the copy more room (the mock narrows a little).
    el.classList.add('ascii-wide')
    const f = document.createElement('span')
    f.className = 'ascii-float'
    f.setAttribute('aria-hidden', 'true')
    const w = Math.round(innerHeight * o.size * g.size)
    f.style.width = `${w}px`
    f.style.height = '4000px'
    // The column may start above the copy, so the object's first place is
    // a little higher than the heading.
    if (g.lift) f.style.marginTop = `${-g.lift}px`
    copy.prepend(f)
    // Centred on the same vertical as everywhere else, whatever the copy's
    // right edge is: the float may lean a few pixels into the gutter.
    const right = copy.getBoundingClientRect().right
    f.style.marginRight = `${Math.round(right - innerWidth * 0.875 - w / 2)}px`
    const lim = el.querySelector<HTMLElement>(g.column.sel)
    const top = f.getBoundingClientRect().top
    const edge = lim ? (g.column.edge === 'bottom' ? lim.getBoundingClientRect().bottom : lim.getBoundingClientRect().top - 16) : top
    f.style.height = `${Math.max(w, Math.round(edge - top))}px`
  }
  measure()
  const remeasure = setInterval(measure, 1500)
  addEventListener('resize', measure)

  /** The index of the section a point of the document is well inside, or -1. */
  const MARGIN = 110
  const deepAt = (docY: number): number =>
    stops.findIndex((s) => {
      const m = Math.min(MARGIN, s.box.h / 3)
      return docY >= s.box.y + m && docY < s.box.y + s.box.h - m
    })
  /** The index of the section a point is in at all, or the nearer one. */
  const anyAt = (docY: number): number => {
    const inside = stops.findIndex((s) => docY >= s.box.y && docY < s.box.y + s.box.h)
    if (inside >= 0) return inside
    let best = 0
    let dist = Infinity
    stops.forEach((s, i) => {
      const d = docY < s.box.y ? s.box.y - docY : docY - (s.box.y + s.box.h)
      if (d < dist) {
        dist = d
        best = i
      }
    })
    return best
  }

  // The shape: the one it is, the one it is becoming, and how far along.
  let a = 0
  let b = 0
  let morph = 1
  let pendingShape = -1
  // The section, as an index into `stops`, and the way the page is moving.
  let sectionIdx = -1
  let dir = 1
  let accent: RGB = hexToRgb('#969ec8')
  let sizeFactor = 1
  let parked = false
  // The flight into a section: from where it was, in document space, to
  // the section's place, which may itself move with the scroll.
  let placeKey = ''
  let fromX = 0
  let fromY = Number.NaN
  let flightStart = -1e9
  let shift = 0
  let x = innerWidth * 0.875
  let y = innerHeight * 0.5
  let size = innerHeight * o.size
  let alpha = 0
  // The first frame takes its section's size, colour and place outright:
  // easing towards them from the defaults would show the desktop size for
  // half a second on a tablet, shrinking.
  let first = true
  let theta = 0
  let lag = scrollY
  let vel = 0
  // Where the object was last frame: its own travel, as opposed to the
  // page's, is what leaves a trail.
  let lastDocY = Number.NaN
  let lastScreenY = Number.NaN
  let last = performance.now()
  let raf = 0
  let alive = true

  const frame = (now: number): void => {
    raf = 0
    if (!alive) return
    // Clamped below as well as above: a frame's timestamp is the time the
    // frame began, which can come before the moment the loop was started in
    // it, and a negative step would run every easing backwards.
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
    last = now
    const t = now / 1000

    // Scroll: a lagged copy of it gives the speed and the direction.
    const sy = scrollY
    lag += (sy - lag) * (1 - Math.exp(-dt * 5))
    vel += (Math.min(1, Math.abs(sy - lag) / 300) - vel) * (1 - Math.exp(-dt * 6))
    const delta = sy - lag
    if (delta > 1.5) dir = 1
    else if (delta < -1.5) dir = -1

    // The section it answers to, read with a point that leads the scroll,
    // so it sets off for the next section while that one is still coming
    // in; it only changes to a section the point is well inside, and only
    // forward along the direction of travel. A jump — a link in the
    // navigation — can land the point in a margin band far from the
    // section it was in: adjacent sections keep their hysteresis, anything
    // further is simply taken.
    const ref = sy + innerHeight * (dir > 0 ? 0.75 : 0.25)
    if (sectionIdx < 0) sectionIdx = anyAt(sy + innerHeight * 0.5)
    const deep = deepAt(ref)
    if (deep >= 0 && deep !== sectionIdx && (dir > 0 ? deep > sectionIdx : deep < sectionIdx)) sectionIdx = deep
    else if (deep < 0 && Math.abs(anyAt(ref) - sectionIdx) > 1) sectionIdx = anyAt(ref)
    const stop = stops[sectionIdx]
    if (!stop) {
      raf = requestAnimationFrame(frame)
      return
    }
    const g = glideOf(stop.section)
    const S = innerHeight * o.size * sizeFactor

    // A new section: fly there from wherever it is now.
    if (stop.section.key !== placeKey) {
      placeKey = stop.section.key
      fromX = x
      fromY = flightStart < 0 ? Number.NaN : y + sy
      flightStart = now
      shift = 0
    }

    // The place in the document. A share of the section's height, or
    // measured from an element's top (which holds across widths where the
    // share would not), or pinned: the viewport's ride point held between
    // the section's paddings or a named element's top and the bottom
    // padding. An anchor element is the place itself, wherever the layout
    // put it — a tall one is a column the object follows the scroll inside,
    // stopping at either end — and an `under` element is hung from.
    const ride = sy + innerHeight * (g.at ?? 0.5)
    const topEl = g.topFrom ? stop.el.querySelector<HTMLElement>(g.topFrom) : null
    const lo = (topEl ? topEl.getBoundingClientRect().top + sy : stop.box.y + (g.top ?? 70)) + S / 2
    const hi = stop.box.y + stop.box.h - (g.bottom ?? 70) - S / 2
    let placeY = g.y === 'pin' ? Math.min(Math.max(ride, lo), Math.max(lo, hi)) : stop.box.y + g.y * stop.box.h
    let placeX = innerWidth * (g.x ?? 0.875)
    if (g.from) {
      const fromEl = stop.el.querySelector<HTMLElement>(g.from.sel)
      if (fromEl) placeY = fromEl.getBoundingClientRect().top + sy + g.from.dy
    }
    const anchorEl = g.column ? stop.el.querySelector<HTMLElement>('.ascii-float') : null
    const underEl = g.under ? stop.el.querySelector<HTMLElement>(g.under) : null
    if (anchorEl) {
      const r = anchorEl.getBoundingClientRect()
      placeX = r.left + r.width / 2
      placeY =
        r.height > r.width + 1
          ? Math.min(Math.max(ride, r.top + sy + r.width / 2), r.bottom + sy - r.width / 2)
          : r.top + r.height / 2 + sy
    } else if (underEl) {
      // The same breathing room the mock has under the heading's letters.
      placeY = underEl.getBoundingClientRect().bottom + sy + 34 + S / 2
    }

    // Text under the place: keep it while it is clear; otherwise slide to
    // the nearest clear one within a few steps, remembering the shift so it
    // does not hunt from frame to frame; failing that, park. A pinned place
    // parks without sliding; an anchored, hung or `front` place never does.
    const coverAt = (yy: number): number => covered({ x: placeX - S / 2 + scrollX, y: yy - S / 2, w: S, h: S }, ink)
    if (anchorEl || underEl || g.front) parked = false
    else if (g.y === 'pin') parked = coverAt(placeY) > 0.3
    else {
      if (coverAt(placeY + shift) > 0.2) {
        let best = shift
        let bestScore = coverAt(placeY + shift)
        for (let k = -8; k <= 8; k++) {
          const sc = coverAt(placeY + k * 40)
          if (sc < bestScore - 0.05 || (sc < 0.05 && Math.abs(k * 40) < Math.abs(best))) {
            bestScore = sc
            best = k * 40
          }
        }
        shift = best
      }
      placeY += shift
      parked = coverAt(placeY) > 0.3
    }

    if (Number.isNaN(fromY)) {
      fromX = placeX
      fromY = placeY
    }
    const u = ease(Math.min(1, (now - flightStart) / 1200))
    const bob = Math.sin(t * 0.8) * 8
    x = lerp(fromX, placeX, u)
    y = lerp(fromY, placeY, u) - sy + bob

    // Colour and size from the section; eased, except on the first frame.
    // The opacity always eases: the object fades in.
    const target = hexToRgb(stop.section.hex)
    const wantSize = Math.min(g.size, g.maxPx ? g.maxPx / (innerHeight * o.size) : Infinity)
    const k = first ? 1 : 1 - Math.exp(-dt * 3)
    accent = accent.map((v, i) => lerp(v, target[i] ?? v, k)) as RGB
    sizeFactor = lerp(sizeFactor, wantSize, k)
    size = lerp(size, S * (parked ? 0.6 : 1), k)
    alpha = lerp(alpha, o.alpha * (parked ? 0.5 : 1), 1 - Math.exp(-dt * 3))

    // The shape. A change in the middle of a morph waits for it, so nothing jumps.
    const wi = shapeIndex(stop.section.shape)
    if (wi !== b) {
      if (morph >= 1) {
        a = b
        b = wi
        morph = 0
      } else {
        pendingShape = wi
      }
    }
    if (morph >= 1 && pendingShape >= 0 && pendingShape !== b) {
      a = b
      b = pendingShape
      morph = 0
    }
    if (pendingShape === b) pendingShape = -1
    morph = Math.min(1, morph + dt / 1.1)

    // Turning, faster when the page is scrolled; a mark sways instead, and
    // the way from a turn to a sway is the short way round.
    theta += dt * (o.spin + vel * 0.6) * 6.2831853
    const sa = SHAPES[a] ?? SHAPES[0]
    const sb = SHAPES[b] ?? SHAPES[0]
    const angleOf = (s: typeof sa): number => (s.sway ? 0.55 * Math.sin(theta * 0.9) : theta)
    const angle = !sa.sway && !sb.sway ? theta : angleOf(sa) + wrap(angleOf(sb) - angleOf(sa)) * morph
    const tilt = lerp(sa.tilt, sb.tilt, morph) + 0.1 * Math.sin(t * 0.4)

    // The glyph cell: the base, finer for a shape with thin parts, and
    // scaled with the square root of the object's size against the usual,
    // so a small object keeps enough glyphs to read and a large one does
    // not turn into a fine print.
    const detail = lerp(sa.detail, sb.detail, morph)
    const cell = Math.min(14, Math.max(4.5, o.cell * detail * Math.sqrt(size / USUAL)))

    // The trail: strong while the object travels on its own — moving both
    // through the document and across the screen, so neither riding pinned
    // with the scroll nor sliding with the page at a column's end leaves
    // any — and a little while it is between two shapes and shedding glyphs.
    const docY = y + sy
    const own = Number.isNaN(lastDocY) ? 0 : Math.abs(docY - lastDocY) / Math.max(dt, 1e-3)
    const across = Number.isNaN(lastScreenY) ? 0 : Math.abs(y - lastScreenY) / Math.max(dt, 1e-3)
    lastDocY = docY
    lastScreenY = y
    const gate = (v: number): number => Math.min(1, Math.max(0, (v - 40) / 500))
    const trail = Math.max(Math.min(gate(own), gate(across)), Math.sin(Math.PI * morph) * 0.35)

    if (first) {
      // Everything above was worked out before the section was known. Now
      // that it is, forget the flight and the trail's memory and run the
      // frame again: the first frame drawn is the right one.
      first = false
      size = innerHeight * o.size * sizeFactor * (parked ? 0.6 : 1)
      placeKey = ''
      flightStart = -1e9
      lastDocY = Number.NaN
      lastScreenY = Number.NaN
      frame(now)
      return
    }

    const item: Item = { x, y, size, a, b, morph, accent, angle, tilt, alpha, cell, trail }
    renderer.draw([item], t, dt)
    raf = requestAnimationFrame(frame)
  }

  const onVisible = (): void => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    } else if (!raf) {
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
  }
  document.addEventListener('visibilitychange', onVisible)
  raf = requestAnimationFrame(frame)

  return {
    set(next) {
      Object.assign(o, next)
      renderer.trail.cell = o.cell
      measure()
    },
    destroy() {
      alive = false
      if (raf) cancelAnimationFrame(raf)
      clearInterval(remeasure)
      removeEventListener('resize', measure)
      document.removeEventListener('visibilitychange', onVisible)
      canvas.remove()
    },
  }
}
