/*
  Where the content actually is.

  A block's own box is the wrong thing to keep clear of: a heading's block runs
  the full column while the words stop halfway. A Range over the block's
  contents gives the boxes of the text runs and inline elements inside it —
  the ink — which is what an object floating beside the content has to avoid.
*/
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Document-space boxes of the ink inside every element the selector matches. */
export function inkBoxes(selector: string): Box[] {
  const out: Box[] = []
  const range = document.createRange()
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    const outer = el.getBoundingClientRect()
    if (outer.width < 2 || outer.height < 2) continue
    range.selectNodeContents(el)
    for (const r of range.getClientRects()) {
      const x1 = Math.max(r.left, outer.left)
      const y1 = Math.max(r.top, outer.top)
      const x2 = Math.min(r.right, outer.right)
      const y2 = Math.min(r.bottom, outer.bottom)
      if (x2 - x1 < 2 || y2 - y1 < 2) continue
      out.push({ x: x1 + scrollX, y: y1 + scrollY, w: x2 - x1, h: y2 - y1 })
    }
  }
  return out
}

/** Document-space box of one element. */
export function box(el: Element): Box {
  const r = el.getBoundingClientRect()
  return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }
}

/** The share of `a` that `boxes` cover, 0 to 1. Overlaps between boxes are counted twice; close enough to choose by. */
export function covered(a: Box, boxes: Box[]): number {
  let sum = 0
  for (const b of boxes) {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
    if (w > 0 && h > 0) sum += w * h
  }
  return Math.min(1, sum / (a.w * a.h))
}
