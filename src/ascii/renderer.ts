/*
  Draws any number of ASCII solids onto one canvas.

  Two passes per solid: it is ray-marched into a small texture, then a glyph
  pass over its box on screen reads that texture at the centre of every cell
  of a grid fixed to the screen — so the glyphs stay put while the shape moves
  under them, the way a terminal would draw it. Morphing is a blend of two
  distance fields with a moment of noise in the middle.

  A solid that carries a `trail` also leaves dust: a texture with one texel
  per cell of the screen's glyph grid remembers how recently each cell was
  marked. One pass ages every cell and marks a sparse subset of those in a
  disc round the solid — the same subset for a couple of seconds, so passing
  over a cell twice does not thicken it — and another draws the marked cells
  as the lightest glyphs, fading, under the solid. The wake is a scatter
  that thins as it goes, nothing to do with the solid's shape.
*/
import type { Atlas } from './atlas'
import { dpr, fit, framebuffer, program, ready, texture, uniforms, type GL } from './gl'
import { SHAPES_GLSL } from './shapes'

export type RGB = [number, number, number]

export interface Item {
  /** Centre and size on screen, CSS px. */
  x: number
  y: number
  size: number
  /** Shape indices and the blend between them, 0 is all `a`. */
  a: number
  b: number
  morph: number
  accent: RGB
  /** Rotation about the vertical axis, radians, and the tilt towards the viewer. */
  angle: number
  tilt: number
  alpha: number
  /** Cell height, CSS px. */
  cell: number
  /** 0 to 1: how much dust the solid raises this frame. Only while it travels, so a still solid leaves none. */
  trail?: number
}

export interface Renderer {
  /** `dt` is the frame's length in seconds; the dust fades by it. */
  draw(items: Item[], t: number, dt?: number): void
  /**
   * Seconds a mote of dust takes to fade, its opacity ceiling, and the cell
   * of the dust's grid — fixed, whatever cell the solid is drawn at, because
   * a grid that changed with the solid would be remade, and wiped, every
   * time the cell did.
   */
  trail: { life: number; alpha: number; cell: number }
}

const OBJ_N = 128

export const OBJ_FRAG = `#version 300 es
precision highp float;
uniform float u_n;
uniform float u_t;
uniform float u_morph;
uniform int u_a;
uniform int u_b;
uniform float u_spin;
uniform float u_tilt;
out vec4 o;
${SHAPES_GLSL}

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

float map(vec3 p) {
  p.yz *= rot(u_tilt);
  p.xz *= rot(u_spin);
  float d = shape(p, u_a);
  if (u_a != u_b) d = mix(d, shape(p, u_b), u_morph);
  // Mid-morph the surface breaks up and settles again.
  float k = sin(3.14159 * u_morph);
  if (k > 0.001) d += (noise3(p * 3.0 + u_t * 0.7) - 0.5) * 0.2 * k;
  return d;
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.004, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_n - 0.5;
  vec3 ro = vec3(0.0, 0.0, 3.7);
  vec3 rd = normalize(vec3(uv * 0.78, -1.0));
  float t = 0.0;
  float hit = 0.0;
  vec3 p = ro;
  for (int i = 0; i < 110; i++) {
    p = ro + rd * t;
    float d = map(p);
    if (d < 0.003) { hit = 1.0; break; }
    t += d * 0.8;
    if (t > 7.0) break;
  }
  if (hit < 0.5) { o = vec4(0.0); return; }
  vec3 n = normalAt(p);
  // A key light up and to the left, a little fill from the viewer, and a
  // rim that draws the silhouette: the range is what the glyphs read.
  vec3 l = normalize(vec3(-0.6, 0.8, 0.7));
  float lam = max(dot(n, l), 0.0);
  float fill = max(dot(n, -rd), 0.0);
  float rim = pow(1.0 - fill, 2.5);
  float shade = clamp(0.08 + 0.75 * lam + 0.15 * fill + 0.45 * rim, 0.0, 1.0);
  o = vec4(shade, 1.0, clamp((t - 2.4) / 2.6, 0.0, 1.0), 1.0);
}`

const HASH = `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}`

const GLYPH_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_obj;
uniform sampler2D u_atlas;
uniform vec2 u_res;
uniform float u_glyphs;
uniform vec2 u_cell;
uniform vec4 u_box;
uniform vec3 u_accent;
uniform float u_alpha;
uniform float u_t;
uniform float u_scatter;
out vec4 o;
${HASH}

void main() {
  vec2 px = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  vec2 cell = floor(px / u_cell);
  vec2 cuv = fract(px / u_cell);
  vec2 c = (cell + 0.5) * u_cell;
  vec2 uv = (c - u_box.xy) / u_box.zw;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) { o = vec4(0.0); return; }
  vec3 s = texture(u_obj, vec2(uv.x, 1.0 - uv.y)).rgb;
  if (s.g < 0.5) { o = vec4(0.0); return; }
  float shade = s.r;
  float g = floor(pow(shade, 0.75) * (u_glyphs - 1.0) + 0.5);
  // While the shape is between two shapes, some cells show the wrong glyph.
  float r = hash12(cell + floor(u_t * 10.0) * 0.31);
  if (r < u_scatter) g = floor(hash12(cell * 1.7 + floor(u_t * 10.0)) * (u_glyphs - 1.0));
  float a = texture(u_atlas, vec2((g + cuv.x) / u_glyphs, cuv.y)).r;
  vec3 col = mix(u_accent * 0.55, mix(u_accent, vec3(1.0), 0.7), shade);
  float alpha = a * u_alpha;
  o = vec4(col * alpha, alpha);
}`

/* Texel (i, j) is screen cell (i, j) from the top-left: r is how recently the
   cell was marked, g the seed that picks its glyph. */
const AGE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_prev;
uniform vec2 u_grid;
uniform vec2 u_cell;
uniform vec4 u_box;
uniform float u_strength;
uniform float u_decay;
uniform float u_t;
out vec4 o;
${HASH}

void main() {
  vec2 cell = floor(gl_FragCoord.xy);
  vec4 prev = texture(u_prev, (cell + 0.5) / u_grid);
  float age = max(prev.r - u_decay, 0.0);
  float g = prev.g;
  if (u_strength > 0.0) {
    vec2 c = (cell + 0.5) * u_cell;
    vec2 centre = u_box.xy + u_box.zw * 0.5;
    float r = length((c - centre) / (u_box.zw * 0.5));
    float keep = hash12(cell * 0.73 + floor(u_t * 0.4) * 11.0);
    if (r < 1.1 && keep < 0.3) {
      float h2 = hash12(cell * 1.9 + 5.0);
      float mark = u_strength * (0.55 + 0.45 * h2) * smoothstep(1.1, 0.45, r);
      if (mark > age) {
        age = mark;
        g = h2;
      }
    }
  }
  o = vec4(age, g, 0.0, 1.0);
}`

const DUST_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_age;
uniform sampler2D u_atlas;
uniform vec2 u_res;
uniform vec2 u_cell;
uniform vec2 u_grid;
uniform float u_glyphs;
uniform vec3 u_accent;
uniform float u_alpha;
out vec4 o;

void main() {
  vec2 px = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  vec2 cell = floor(px / u_cell);
  vec2 cuv = fract(px / u_cell);
  vec4 st = texture(u_age, (cell + 0.5) / u_grid);
  if (st.r <= 0.004) { o = vec4(0.0); return; }
  // One of the three lightest glyphs, fading straight out.
  float g = 1.0 + floor(st.g * 2.999);
  float a = texture(u_atlas, vec2((g + cuv.x) / u_glyphs, cuv.y)).r;
  vec3 col = mix(u_accent, vec3(1.0), 0.3);
  float alpha = a * st.r * u_alpha;
  o = vec4(col * alpha, alpha);
}`

export function createRenderer(gl: GL, canvas: HTMLCanvasElement, atlas: Atlas): Renderer {
  const objProg = program(gl, OBJ_FRAG)
  const glyphProg = program(gl, GLYPH_FRAG)
  const ageProg = program(gl, AGE_FRAG)
  const dustProg = program(gl, DUST_FRAG)
  const locate = () => ({
    ou: uniforms(gl, objProg, ['u_n', 'u_t', 'u_morph', 'u_a', 'u_b', 'u_spin', 'u_tilt'] as const),
    gu: uniforms(gl, glyphProg, ['u_obj', 'u_atlas', 'u_res', 'u_glyphs', 'u_cell', 'u_box', 'u_accent', 'u_alpha', 'u_t', 'u_scatter'] as const),
    au: uniforms(gl, ageProg, ['u_prev', 'u_grid', 'u_cell', 'u_box', 'u_strength', 'u_decay', 'u_t'] as const),
    du: uniforms(gl, dustProg, ['u_age', 'u_atlas', 'u_res', 'u_cell', 'u_grid', 'u_glyphs', 'u_accent', 'u_alpha'] as const),
  })
  // The locations are looked up once every program has linked (gl.ts); a
  // frame before that draws nothing, and a program that fails to link leaves
  // the canvas blank for good rather than throwing from inside a frame.
  let locs: ReturnType<typeof locate> | null = null
  let dead = false
  const linked = (): ReturnType<typeof locate> | null => {
    if (locs || dead) return locs
    try {
      for (const p of [objProg, glyphProg, ageProg, dustProg]) if (!ready(gl, p)) return null
    } catch {
      dead = true
      return null
    }
    locs = locate()
    return locs
  }
  const tAtlas = texture(gl, atlas.canvas, { mipmap: true })
  const obj = framebuffer(gl, OBJ_N, OBJ_N)

  // Two age textures, read one and write the other, remade when the grid changes.
  let ages: { fbo: WebGLFramebuffer; tex: WebGLTexture }[] = []
  let cols = 0
  let rows = 0
  let cur = 0
  const grid = (c: number, r: number): void => {
    if (c === cols && r === rows && ages.length === 2) return
    cols = c
    rows = r
    ages = [framebuffer(gl, c, r), framebuffer(gl, c, r)]
    for (const a of ages) {
      gl.bindTexture(gl.TEXTURE_2D, a.tex)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  const bind = (unit: number, tex: WebGLTexture | null): void => {
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, tex)
  }

  const renderer: Renderer = {
    trail: { life: 0.6, alpha: 0.6, cell: 10 },
    draw(items, t, dt = 1 / 60) {
      const l = linked()
      if (!l) return
      const { ou, gu, au, du } = l
      const ratio = dpr()
      fit(canvas, { width: innerWidth, height: innerHeight }, ratio)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)

      // The dust, for the first item that carries any: every cell is aged
      // and the ones round the item marked, then the marked cells are drawn
      // under everything.
      const dusty = items.find((it) => it.trail !== undefined)
      if (dusty && renderer.trail.life > 0) {
        const cw = renderer.trail.cell * atlas.aspect * ratio
        const ch = renderer.trail.cell * ratio
        grid(Math.ceil(canvas.width / cw), Math.ceil(canvas.height / ch))
        const prev = ages[cur]
        const next = ages[1 - cur]
        if (prev && next) {
          const visible = dusty.alpha > 0.005 && dusty.size >= 4
          gl.bindFramebuffer(gl.FRAMEBUFFER, next.fbo)
          gl.viewport(0, 0, cols, rows)
          gl.disable(gl.BLEND)
          gl.useProgram(ageProg)
          bind(0, prev.tex)
          gl.uniform1i(au.u_prev, 0)
          gl.uniform2f(au.u_grid, cols, rows)
          gl.uniform2f(au.u_cell, cw, ch)
          gl.uniform4f(au.u_box, (dusty.x - dusty.size / 2) * ratio, (dusty.y - dusty.size / 2) * ratio, dusty.size * ratio, dusty.size * ratio)
          gl.uniform1f(au.u_strength, visible ? (dusty.trail ?? 0) : 0)
          gl.uniform1f(au.u_decay, Math.min(1, dt / renderer.trail.life))
          gl.uniform1f(au.u_t, t)
          gl.drawArrays(gl.TRIANGLES, 0, 3)
          cur = 1 - cur
          bind(0, null)

          gl.bindFramebuffer(gl.FRAMEBUFFER, null)
          gl.viewport(0, 0, canvas.width, canvas.height)
          gl.enable(gl.BLEND)
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
          gl.useProgram(dustProg)
          bind(0, next.tex)
          bind(1, tAtlas)
          gl.uniform1i(du.u_age, 0)
          gl.uniform1i(du.u_atlas, 1)
          gl.uniform2f(du.u_res, canvas.width, canvas.height)
          gl.uniform2f(du.u_cell, cw, ch)
          gl.uniform2f(du.u_grid, cols, rows)
          gl.uniform1f(du.u_glyphs, atlas.count)
          gl.uniform3f(du.u_accent, dusty.accent[0], dusty.accent[1], dusty.accent[2])
          gl.uniform1f(du.u_alpha, renderer.trail.alpha)
          gl.drawArrays(gl.TRIANGLES, 0, 3)
          bind(0, null)
        }
      }

      for (const it of items) {
        if (it.alpha <= 0.005 || it.size < 4) continue

        // Pass one: the solid, into its own small texture.
        gl.bindFramebuffer(gl.FRAMEBUFFER, obj.fbo)
        gl.viewport(0, 0, OBJ_N, OBJ_N)
        gl.disable(gl.BLEND)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.useProgram(objProg)
        gl.uniform1f(ou.u_n, OBJ_N)
        gl.uniform1f(ou.u_t, t)
        gl.uniform1f(ou.u_morph, it.morph)
        gl.uniform1i(ou.u_a, it.a)
        gl.uniform1i(ou.u_b, it.b)
        gl.uniform1f(ou.u_spin, it.angle)
        gl.uniform1f(ou.u_tilt, it.tilt)
        gl.drawArrays(gl.TRIANGLES, 0, 3)

        // Pass two: glyphs, only over the solid's box.
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
        const cw = it.cell * atlas.aspect * ratio
        const ch = it.cell * ratio
        const bx = (it.x - it.size / 2) * ratio
        const by = (it.y - it.size / 2) * ratio
        const bs = it.size * ratio
        const vx = Math.max(0, Math.floor(bx - cw))
        const vy = Math.max(0, Math.floor(by - ch))
        const vw = Math.min(canvas.width - vx, Math.ceil(bs + 2 * cw))
        const vh = Math.min(canvas.height - vy, Math.ceil(bs + 2 * ch))
        if (vw <= 0 || vh <= 0) continue
        gl.viewport(vx, canvas.height - (vy + vh), vw, vh)
        gl.useProgram(glyphProg)
        bind(0, obj.tex)
        bind(1, tAtlas)
        gl.uniform1i(gu.u_obj, 0)
        gl.uniform1i(gu.u_atlas, 1)
        gl.uniform2f(gu.u_res, canvas.width, canvas.height)
        gl.uniform1f(gu.u_glyphs, atlas.count)
        gl.uniform2f(gu.u_cell, cw, ch)
        gl.uniform4f(gu.u_box, bx, by, bs, bs)
        gl.uniform3f(gu.u_accent, it.accent[0], it.accent[1], it.accent[2])
        gl.uniform1f(gu.u_alpha, it.alpha)
        gl.uniform1f(gu.u_t, t)
        gl.uniform1f(gu.u_scatter, Math.sin(Math.PI * it.morph) * 0.5)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
        // The texture must not stay bound while it is drawn into next time.
        bind(0, null)
      }
    },
  }
  return renderer
}
