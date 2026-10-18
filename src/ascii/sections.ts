/*
  What each section of the page hands the object: an accent, a shape, and
  where it lives there. Sections carry their key in `data-object`.
*/
import type { ShapeId } from './shapes'

export type RGB = [number, number, number]

/**
 * Where the object lives in a section. `y` is a share of the section's
 * height, or `pin`: it follows the viewport's ride point, held between
 * `top` and `bottom` (offsets from the section's edges, so it stops where
 * the content's padding stops) or from a named element's top. `x` is a
 * share of the viewport width. `size` is the factor on the base size.
 */
export interface Place {
  y: number | 'pin'
  size: number
  x?: number
  top?: number
  bottom?: number
  /** For a pinned place: the element whose top is the upper bound, instead of `top` px from the section's top. */
  topFrom?: string
  /** The section's own cards or figure are opaque and in front, so the object never shrinks or dims for them and may sit partly behind them. */
  front?: boolean
  /**
   * The object sits in a float the copy wraps round, put in by object.ts
   * at the top of the copy. With `limit` the float is a column reaching
   * that element's edge, and the object follows the scroll inside it,
   * stopping at its ends.
   */
  column?: { sel: string; edge: 'top' | 'bottom' }
  /**
   * Where in the viewport the object rides while it follows the scroll
   * inside a column or a pinned section, as a share of the height; 0.5 is
   * the middle. Lower keeps it near the top of the screen for longer.
   */
  at?: number
  /** How far above the copy's top the column starts, px. */
  lift?: number
  /** An element the object hangs just under, at the common vertical. */
  under?: string
  /** An element the object's centre is measured from: `dy` px below its top. Holds across widths where a share of the section's height would not. */
  from?: { sel: string; dy: number }
  /** A ceiling on the object's size in px, for a column that is only so wide. */
  maxPx?: number
}

export interface Section {
  key: string
  /** The accent as CSS. */
  hex: string
  shape: ShapeId
  /**
   * The place, with what changes at the tablet breakpoint (1400 px and
   * below, where the rows stack for the object): merged over the rest, so
   * a field set to undefined there switches that part off. `wide` is
   * merged over that again between 1181 and 1400 px, where the page's own
   * layout is still the desktop one and there is more room.
   */
  glide: Place & { tablet?: Partial<Place> & { wide?: Partial<Place> } }
}

const ROUTE = '#969ec8'
const GREEN = '#5bd8a6'

/* On a tablet every project row stacks and the object rides a column down
   the right of the copy, from the top of the mock to the row's bottom
   padding; the desktop's floats and hangers are switched off. */
const ROW_TABLET: Partial<Place> = {
  y: 'pin',
  size: 0.68,
  maxPx: 216,
  x: 0.86,
  topFrom: '.shot',
  bottom: 40,
  at: 0.4,
  column: undefined,
  lift: undefined,
  under: undefined,
  front: false,
}

/* The three card sections keep two thirds of the width on a tablet and the
   object rides the right third, from the heading's top down. */
const CARDS_TABLET = (size: number, maxPx: number): Partial<Place> => ({
  y: 'pin',
  size,
  maxPx,
  x: 0.86,
  topFrom: 'h2',
  bottom: 60,
  at: 0.4,
  front: false,
})

export const SECTIONS: readonly Section[] = [
  {
    key: 'top',
    hex: ROUTE,
    shape: 'layers',
    glide: { y: 0.5, size: 1, tablet: { y: 0.24, size: 0.62, maxPx: 192, x: 0.86, wide: { y: 0.5, size: 0.82, maxPx: 260, x: 0.87 } } },
  },
  {
    key: 'now',
    hex: GREEN,
    shape: 'puzzle',
    glide: { y: 'pin', size: 0.9, top: 69, bottom: 68, tablet: { size: 0.8, maxPx: 248, x: 0.86, at: 0.4 } },
  },
  {
    key: 'arch',
    hex: ROUTE,
    shape: 'lattice',
    glide: { y: 0.19, size: 0.72, front: true, from: { sel: 'h2', dy: 68 }, tablet: { x: 0.86, from: { sel: 'h2', dy: 90 } } },
  },
  {
    key: 'tuned',
    hex: '#7c8cff',
    shape: 'tunedlogo',
    glide: { y: 0.3, size: 0.72, column: { sel: '.stack', edge: 'top' }, at: 0.36, lift: 24, tablet: ROW_TABLET },
  },
  {
    key: 'frame',
    hex: '#818cf8',
    shape: 'fplogo',
    glide: { y: 0.755, size: 0.72, under: '.shot', tablet: ROW_TABLET },
  },
  {
    key: 'gift',
    hex: '#a8ff35',
    shape: 'dice',
    glide: { y: 0.3, size: 0.72, column: { sel: '.metrics', edge: 'bottom' }, at: 0.36, lift: 24, tablet: ROW_TABLET },
  },
  {
    key: 'dub',
    hex: '#a855f7',
    shape: 'sync',
    glide: { y: 0.777, size: 0.74, under: '.shot', tablet: ROW_TABLET },
  },
  {
    key: 'approach',
    hex: ROUTE,
    shape: 'stairs',
    glide: { y: 0.245, size: 0.42, tablet: CARDS_TABLET(0.62, 200) },
  },
  {
    key: 'stack',
    hex: ROUTE,
    shape: 'wrench',
    glide: { y: 0.29, size: 0.72, front: true, tablet: CARDS_TABLET(0.72, 224) },
  },
  {
    key: 'oss',
    hex: ROUTE,
    shape: 'star',
    glide: { y: 0.345, size: 0.7, front: true, tablet: CARDS_TABLET(0.76, 236) },
  },
  {
    key: 'contact',
    hex: GREEN,
    shape: 'globe',
    glide: { y: 0.5, size: 0.9, tablet: { size: 0.72, x: 0.86 } },
  },
]

export const sectionByKey = (key: string): Section | undefined => SECTIONS.find((s) => s.key === key)

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
