/*
  A strip of glyphs sorted by how much ink they carry, drawn in the page's own
  monospace so the ASCII is set in the same face as every caption.

  The ramp is measured, not typed in: every printable ASCII character is drawn
  once, its coverage is summed, and the strip is the N characters whose
  coverage is closest to N evenly spaced levels. A shader then turns a
  brightness straight into a column of the strip.
*/
export interface Atlas {
  canvas: HTMLCanvasElement
  /** Glyphs in the strip, darkest first. */
  count: number
  chars: string
  /** Cell width over cell height. DM Mono advances 0.6 em. */
  aspect: number
}

const FACE = '"DM Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace'

/**
 * @param weight extra stroke around every glyph as a share of the cell height:
 * 0 is the face as drawn; 0.04 reads as a medium weight once the cell is ten
 * pixels, where a hairline of DM Mono would carry almost no ink.
 */
export async function buildAtlas(count = 24, cellH = 64, aspect = 0.6, weight = 0): Promise<Atlas> {
  try {
    await document.fonts.load(`${cellH}px "DM Mono"`)
  } catch {
    /* the fallback mono will do: the ramp is measured, whatever face draws it */
  }

  const cw = Math.round(cellH * aspect)
  const font = `${Math.round(cellH * 0.9)}px ${FACE}`

  const draw = (ctx: CanvasRenderingContext2D, ch: string, x: number): void => {
    ctx.font = font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#fff'
    ctx.fillText(ch, x + cw / 2, cellH / 2 + cellH * 0.04)
    if (weight > 0) {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = cellH * weight
      ctx.lineJoin = 'round'
      ctx.strokeText(ch, x + cw / 2, cellH / 2 + cellH * 0.04)
    }
  }

  const probe = document.createElement('canvas')
  probe.width = cw
  probe.height = cellH
  const pc = probe.getContext('2d', { willReadFrequently: true })
  if (!pc) throw new Error('2d context unavailable')

  const all: { ch: string; cov: number }[] = []
  for (let code = 32; code < 127; code++) {
    const ch = String.fromCharCode(code)
    pc.clearRect(0, 0, cw, cellH)
    draw(pc, ch, 0)
    const data = pc.getImageData(0, 0, cw, cellH).data
    let sum = 0
    for (let i = 3; i < data.length; i += 4) sum += data[i] ?? 0
    all.push({ ch, cov: sum / (255 * cw * cellH) })
  }
  all.sort((a, b) => a.cov - b.cov)
  const max = all[all.length - 1]?.cov ?? 1

  const picked: { ch: string; cov: number }[] = []
  for (let i = 0; i < count; i++) {
    const target = (i / (count - 1)) * max
    let best = all[0]
    let dist = Infinity
    for (const c of all) {
      const d = Math.abs(c.cov - target)
      if (d < dist) {
        dist = d
        best = c
      }
    }
    if (best && picked[picked.length - 1] !== best) picked.push(best)
  }

  const canvas = document.createElement('canvas')
  canvas.width = cw * picked.length
  canvas.height = cellH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  picked.forEach((g, i) => draw(ctx, g.ch, i * cw))

  return { canvas, count: picked.length, chars: picked.map((g) => g.ch).join(''), aspect }
}
