/*
  The object as text, for the link preview.

  Not part of the page: nothing imports this. In `astro dev`, from the
  console of any page, `const m = await import('/src/ascii/export.ts')`,
  then `m.cellsToHtml(await m.sampleShape('puzzle', 89, 53, 0.25, 0.25),
  [0.59, 0.62, 0.78])` is the block pasted into src/og/card.html. The solid
  is ray-marched once into a texture, read back, and set in the atlas's
  glyphs as a block of text — the same cell, glyph ramp and shading as the
  page draws, but as characters a document can carry, so the card stays a
  page of text rendered by a browser rather than a picture of a picture.
*/
import { buildAtlas } from './atlas'
import { framebuffer, getGL, program, uniforms } from './gl'
import { OBJ_FRAG } from './renderer'
import { shapeIndex, type ShapeId } from './shapes'

export interface Cell {
  ch: string
  /** 0..1; 0 is empty. */
  shade: number
}

const N = 512

/** The solid, sampled at the centre of every cell of a `cols` × `rows` grid. */
export async function sampleShape(id: ShapeId, cols: number, rows: number, angle: number, tilt: number): Promise<Cell[][]> {
  const atlas = await buildAtlas(20, 64, 0.6, 0.035)
  const canvas = document.createElement('canvas')
  canvas.width = N
  canvas.height = N
  const gl = getGL(canvas)
  if (!gl) throw new Error('no webgl2')
  const prog = program(gl, OBJ_FRAG)
  const u = uniforms(gl, prog, ['u_n', 'u_t', 'u_morph', 'u_a', 'u_b', 'u_spin', 'u_tilt'] as const)
  const fb = framebuffer(gl, N, N)
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb.fbo)
  gl.viewport(0, 0, N, N)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.useProgram(prog)
  const i = shapeIndex(id)
  gl.uniform1f(u.u_n, N)
  gl.uniform1f(u.u_t, 1.7)
  gl.uniform1f(u.u_morph, 1)
  gl.uniform1i(u.u_a, i)
  gl.uniform1i(u.u_b, i)
  gl.uniform1f(u.u_spin, angle)
  gl.uniform1f(u.u_tilt, tilt)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
  const px = new Uint8Array(N * N * 4)
  gl.readPixels(0, 0, N, N, gl.RGBA, gl.UNSIGNED_BYTE, px)

  const out: Cell[][] = []
  for (let r = 0; r < rows; r++) {
    const row: Cell[] = []
    for (let c = 0; c < cols; c++) {
      // The glyph pass reads the texture at (u, 1 - v); readPixels hands the
      // rows back bottom-up, so a cell at v from the top is texel row (1 - v).
      const tx = Math.min(N - 1, Math.floor(((c + 0.5) / cols) * N))
      const ty = Math.min(N - 1, Math.floor((1 - (r + 0.5) / rows) * N))
      const k = (ty * N + tx) * 4
      const hit = (px[k + 1] ?? 0) > 127
      const shade = (px[k] ?? 0) / 255
      if (!hit) {
        row.push({ ch: ' ', shade: 0 })
        continue
      }
      const g = Math.round(Math.pow(shade, 0.75) * (atlas.count - 1))
      row.push({ ch: atlas.chars[g] ?? ' ', shade })
    }
    out.push(row)
  }
  return out
}

const hex = (v: number): string =>
  Math.round(Math.min(1, Math.max(0, v)) * 255)
    .toString(16)
    .padStart(2, '0')

/**
 * The cells as HTML for a <pre>: runs of one colour share a span. Coloured
 * the way the page colours the object — the accent, lifted towards white
 * with the shade — quantised to a few levels so the runs are long.
 */
export function cellsToHtml(cells: Cell[][], accent: [number, number, number], levels = 10): string {
  const esc = (ch: string): string => (ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '&' ? '&amp;' : ch)
  const colour = (cell: Cell): string => {
    const q = Math.round(cell.shade * (levels - 1)) / (levels - 1)
    const c = accent.map((v) => v * 0.55 + (v + (1 - v) * 0.7 - v * 0.55) * q)
    return `#${hex(c[0] ?? 0)}${hex(c[1] ?? 0)}${hex(c[2] ?? 0)}`
  }
  const lines: string[] = []
  for (const row of cells) {
    let line = ''
    let run = ''
    let runColour = ''
    const flush = (): void => {
      if (!run) return
      line += runColour ? `<i style="color:${runColour}">${run}</i>` : run
      run = ''
    }
    for (const cell of row) {
      const col = cell.ch === ' ' ? '' : colour(cell)
      if (col !== runColour) {
        flush()
        runColour = col
      }
      run += esc(cell.ch)
    }
    flush()
    lines.push(line.replace(/\s+$/, ''))
  }
  return lines.join('\n')
}
