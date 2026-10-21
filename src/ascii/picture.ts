/*
  A photograph that materialises out of coloured ASCII.

  The canvas sits over the real <picture>, so without JavaScript, or when the
  effect is switched off, the page still shows the photograph. Every cell of
  the finest grid keeps its own time, read off a smooth field with a little
  chance on top and a lean towards the face; along that time its cell halves
  step by step — random coloured glyphs, then the picture as a mosaic of
  glyphs, then fine glyphs — and, for the `photo` ending, carries on halving
  past glyph size until the cell is a pixel of the photograph itself. So the
  picture arrives in soft-edged, speckled patches by the one mechanism, and
  the canvas fades out once every cell has got there.

  The `ascii` ending stops at the fine glyphs and lets the pointer uncover
  the photograph underneath; with `trigger: 'none'` it never animates at all,
  which is how the pictures inside the product previews are drawn.
*/
import { buildAtlas } from './atlas'
import { dpr, fit, getGL, program, ready, REDUCED, texture, uniforms } from './gl'

/** The most one frame may advance the run's clock, ms: a stall pauses the run, it does not fast-forward it. */
const STEP = 50

export interface AsciiOptions {
  /** Finest glyph cell height, CSS px. */
  cell?: number
  /** Halvings from the coarsest grid down to `cell`: 1 means the glyphs start twice as big; 0 means they start fine. */
  levels?: number
  /** The schedule's field is this many finest cells across, so patches are a few cells wide. */
  group?: number
  /** How many more halvings past the finest glyph it takes to reach the photograph. */
  extra?: number
  duration?: number
  delay?: number
  end?: 'photo' | 'ascii'
  /** What colours the unresolved glyphs: the photograph under them, so the face is there in colour before it is there in shape, or a random palette. */
  noise?: 'photo' | 'rainbow'
  /** Where the materialisation leans towards, as a fraction of the picture. */
  focus?: [number, number]
  /** Reveal the photograph under the pointer once resolved. */
  hover?: boolean
  /** `none` draws the finished ASCII at once and never animates; the pointer still reveals the photo. */
  trigger?: 'load' | 'view' | 'none'
  /** The surface behind the glyphs. */
  bg?: [number, number, number]
}

export interface AsciiImage {
  replay(): void
  set(opts: AsciiOptions): void
  destroy(): void
}

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_img;
uniform sampler2D u_atlas;
uniform vec2 u_res;
uniform float u_glyphs;
uniform float u_aspect;
uniform float u_min;
uniform float u_levels;
uniform float u_group;
uniform float u_extra;
uniform float u_p;
uniform float u_t;
uniform vec2 u_focus;
uniform int u_noise;
uniform vec2 u_mouse;
uniform vec3 u_bg;
uniform vec2 u_fit;
out vec4 o;

// The part of the texture the <img> shows under object-fit: cover.
vec2 cover(vec2 uv) {
  return (uv - 0.5) * u_fit + 0.5;
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 pal(float t) {
  return 0.55 + 0.45 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec3 boost(vec3 c, float l) {
  vec3 s = mix(vec3(l), c, 1.35);
  return clamp(s * 1.5 + 0.05, 0.0, 1.0);
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  vec2 uv = px / u_res;
  float ar = u_res.x / u_res.y;

  // Every finest cell keeps its own time, read off a smooth field — so
  // neighbours are close and the picture arrives in soft-edged patches —
  // with some chance of its own on top, so the edges are speckled, and a
  // lean towards the face so it tends to come first. Nothing larger than
  // one cell is ever on the same clock.
  vec2 c0 = vec2(u_min * u_aspect, u_min) * exp2(u_levels);
  vec2 cFine = c0 / exp2(u_levels);
  vec2 fcell = floor(px / cFine);
  vec2 fc = (fcell + 0.5) * cFine / u_res;
  float dist = length((fc - u_focus) * vec2(ar, 1.0));
  float field = 0.75 * vnoise(fcell * vec2(0.6, 1.0) / (u_group * 2.5) + 11.0) + 0.25 * hash12(fcell * 1.7 + 2.0);
  float order = clamp(0.4 * dist / 0.7 + 0.6 * field, 0.0, 1.0) * 0.75;
  float pl = clamp(1.75 * u_p - order, 0.0, 1.0);

  // Each step of local progress halves the cell, on past the finest glyph
  // when the photograph is the end.
  float lvlMax = u_levels + u_extra;
  float lvl = min(floor(pl * (lvlMax + 0.999)), lvlMax);
  vec2 cs = c0 / exp2(lvl);
  vec2 cell = floor(px / cs);
  vec2 cuv = fract(px / cs);
  vec2 suv = (cell + 0.5) * cs / u_res;

  // Sample the mip whose texel is about a cell, so a coarse cell is the
  // average of its area rather than one pixel out of it.
  float texel = cs.y * float(textureSize(u_img, 0).y) / u_res.y;
  float lod = max(log2(texel) - 0.7, 0.0);
  vec3 img = textureLod(u_img, cover(suv), lod).rgb;
  float lum = dot(img, vec3(0.299, 0.587, 0.114));

  // The noise leaves well before the grid is fine, so the coarse grids
  // already show the picture — as a mosaic that then sharpens — rather than
  // confetti right up to the last step.
  float nz = 1.0 - smoothstep(0.0, 0.4, pl);
  float tick = floor(u_t * 12.0);
  float r1 = hash12(cell * 1.3 + lvl * 7.0 + tick * 0.173);
  float r2 = hash12(cell * 2.7 + lvl * 3.0 + tick * 0.311 + 9.0);
  float gi = floor(clamp(pow(lum, 0.75) * 1.1, 0.0, 1.0) * (u_glyphs - 1.0) + 0.5);
  float gr = floor((0.25 + 0.75 * r2) * (u_glyphs - 1.0));
  float noisy = step(r1, nz);
  float g = mix(gi, gr, noisy);
  float a = texture(u_atlas, vec2((g + cuv.x) / u_glyphs, cuv.y)).r;
  vec3 ic = boost(img, lum);

  // Past glyph size a cell is a dot, then a pixel: the ink fills the cell
  // and the lift comes off, so it ends as the photograph itself.
  float tiny = smoothstep(7.0, 2.5, cs.y) * step(0.5, u_extra);
  a = mix(a, 1.0, tiny);
  ic = mix(ic, img, tiny);

  // The unresolved glyphs' colour: a random palette pulled a little towards
  // what the picture has there, or the picture's own colour, lifted and
  // flickering, so the face is there in colour before it is there in shape.
  vec3 nc = u_noise == 1
    ? clamp(ic * (0.75 + 0.6 * r2), 0.0, 1.0)
    : mix(pal(hash12(cell * 0.5 + tick * 0.07 + 3.0)), ic, 0.3) * (0.55 + 0.45 * r2);
  vec3 rgb = mix(u_bg, mix(ic, nc, noisy), a);

  if (u_mouse.x > -5.0) {
    float m = length((uv - u_mouse) * vec2(ar, 1.0));
    rgb = mix(rgb, texture(u_img, cover(uv)).rgb, 1.0 - smoothstep(0.23, 0.42, m));
  }
  o = vec4(rgb, 1.0);
}`

const DEFAULTS: Required<AsciiOptions> = {
  cell: 6,
  levels: 1,
  group: 2,
  extra: 2,
  duration: 1800,
  delay: 150,
  end: 'photo',
  noise: 'photo',
  focus: [0.5, 0.42],
  hover: true,
  trigger: 'load',
  bg: [0.075, 0.075, 0.09],
}

export async function mountAsciiImage(picture: HTMLElement, opts: AsciiOptions = {}): Promise<AsciiImage | null> {
  if (REDUCED.matches) return null
  const img = picture.querySelector('img')
  if (!img) return null

  const o: Required<AsciiOptions> = { ...DEFAULTS, ...opts }

  if (!img.complete) await new Promise<void>((r) => img.addEventListener('load', () => r(), { once: true }))
  try {
    await img.decode()
  } catch {
    /* a decode error still leaves a usable bitmap for texImage2D in practice */
  }
  if (!img.naturalWidth) return null

  const atlas = await buildAtlas(24, 64, 0.6)

  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  const cs = getComputedStyle(img)
  canvas.style.borderRadius = cs.borderRadius
  canvas.style.border = cs.border

  /*
    Two ways to sit on the image. A <picture> drawn as a block (the hero) takes
    the canvas as a child filling it. An inline <picture> has no box: the image
    inside it is positioned by its own rules, so the canvas goes in beside it
    wearing the same classes — and the scoping attribute that makes them apply.
  */
  const hostBox = picture.getBoundingClientRect()
  if (hostBox.width > 1 && hostBox.height > 1) {
    canvas.className = 'ascii-picture'
    picture.classList.add('ascii-host')
    picture.appendChild(canvas)
  } else {
    canvas.className = `${img.className} ascii-picture`
    for (const a of img.attributes) if (a.name.startsWith('data-astro-cid')) canvas.setAttribute(a.name, a.value)
    img.after(canvas)
  }
  // The canvas is over the image from here on: the style may let the image show.
  picture.classList.add('ascii-covered')

  const gl = getGL(canvas)
  if (!gl) {
    canvas.remove()
    return null
  }
  const prog = program(gl, FRAG)
  const NAMES = [
    'u_img',
    'u_atlas',
    'u_res',
    'u_glyphs',
    'u_aspect',
    'u_min',
    'u_levels',
    'u_group',
    'u_extra',
    'u_p',
    'u_t',
    'u_focus',
    'u_noise',
    'u_mouse',
    'u_bg',
    'u_fit',
  ] as const
  type Uniforms = Record<(typeof NAMES)[number], WebGLUniformLocation | null>
  // Looked up once the program has linked (gl.ts): asking earlier would wait for it.
  let locs: Uniforms | null = null
  const tImg = texture(gl, img, { mipmap: true })
  const tAtlas = texture(gl, atlas.canvas, { mipmap: true })

  // The run's clock: milliseconds of frames actually drawn, so a stall
  // pauses the run where it is instead of its skipping ahead afterwards.
  let elapsed = 0
  let last = -1
  let p = 0
  let raf = 0
  // Only a run moves `p`; a static mount sits at 1 and must not be reset
  // by a frame drawn for the pointer or a resize.
  let running = false
  let done = false
  let mouse: [number, number] = [-10, -10]
  let alive = true

  const draw = (now: number, u: Uniforms): void => {
    const ratio = dpr()
    const box = img.getBoundingClientRect()
    fit(canvas, box, ratio)
    // object-fit: cover — the box keeps the wider of the two aspects.
    const ia = img.naturalWidth / img.naturalHeight
    const ba = box.width / Math.max(1, box.height)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.useProgram(prog)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tImg)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, tAtlas)
    gl.uniform1i(u.u_img, 0)
    gl.uniform1i(u.u_atlas, 1)
    gl.uniform2f(u.u_res, canvas.width, canvas.height)
    gl.uniform1f(u.u_glyphs, atlas.count)
    gl.uniform1f(u.u_aspect, atlas.aspect)
    gl.uniform1f(u.u_min, o.cell * ratio)
    gl.uniform1f(u.u_levels, o.levels)
    gl.uniform1f(u.u_group, Math.max(1, o.group))
    gl.uniform1f(u.u_extra, o.end === 'photo' ? o.extra : 0)
    gl.uniform1f(u.u_p, p)
    gl.uniform1f(u.u_t, now / 1000)
    gl.uniform2f(u.u_focus, o.focus[0], o.focus[1])
    gl.uniform1i(u.u_noise, o.noise === 'photo' ? 1 : 0)
    const hovering = o.hover && o.end === 'ascii' && done
    gl.uniform2f(u.u_mouse, hovering ? mouse[0] : -10, hovering ? mouse[1] : -10)
    gl.uniform3f(u.u_bg, o.bg[0], o.bg[1], o.bg[2])
    gl.uniform2f(u.u_fit, ba > ia ? 1 : ba / ia, ba > ia ? ia / ba : 1)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  const frame = (now: number): void => {
    raf = 0
    if (!alive) return
    // Not before the program has linked; the run's clock starts with the
    // first frame that is drawn. A program that cannot link takes the canvas
    // down, and the photograph shows.
    try {
      if (!ready(gl, prog)) {
        raf = requestAnimationFrame(frame)
        return
      }
    } catch {
      destroy()
      return
    }
    if (!locs) locs = uniforms(gl, prog, NAMES)
    if (running && last >= 0) {
      elapsed += Math.min(STEP, Math.max(0, now - last))
      p = Math.min(1, Math.max(0, (elapsed - o.delay) / o.duration))
    }
    last = now
    if (p >= 1 && !done) {
      done = true
      // Every cell is showing the photograph by now: hand over to the real image.
      if (o.end === 'photo') canvas.classList.add('ascii-out')
    }
    draw(now, locs)
    // Keep drawing while something still moves: the run, or the pointer
    // uncovering the photograph. A finished ASCII frame is static.
    if (!done || (o.hover && o.end === 'ascii' && mouse[0] > -5)) raf = requestAnimationFrame(frame)
  }

  const kick = (): void => {
    if (raf === 0) raf = requestAnimationFrame(frame)
  }

  const begin = (): void => {
    elapsed = 0
    last = -1
    p = 0
    running = true
    done = false
    canvas.classList.remove('ascii-out')
    kick()
  }

  if (o.trigger === 'none') {
    // Finished at once: the ASCII as it ends up, and only the pointer moves it.
    p = 1
    done = true
    kick()
  } else if (o.trigger === 'view') {
    // The unresolved state is on screen before the run starts, so a picture
    // waiting for the viewport shows noise rather than the photograph.
    kick()
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        begin()
      },
      { threshold: 0.25 },
    )
    io.observe(picture)
  } else {
    begin()
  }

  const onMove = (e: MouseEvent): void => {
    const r = canvas.getBoundingClientRect()
    mouse = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]
    kick()
  }
  // A finger has no hover: a tap uncovers the photograph where it lands and
  // leaves it uncovered until the next tap, since lifting the finger is not
  // leaving. `click` rather than `pointerdown`, which also fires at the start
  // of a scroll that merely began on the picture.
  const onLeave = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return
    mouse = [-10, -10]
    kick()
  }
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('click', onMove)

  const ro = new ResizeObserver(() => kick())
  ro.observe(img)

  // The picture keeps `ascii-covered`: the style hides the image until the
  // canvas is over it, and a canvas that has gone must not hide it again.
  const destroy = (): void => {
    alive = false
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    ro.disconnect()
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerleave', onLeave)
    canvas.removeEventListener('click', onMove)
    picture.classList.remove('ascii-host')
    canvas.remove()
  }

  return {
    replay: begin,
    set(next) {
      Object.assign(o, next)
      kick()
    },
    destroy,
  }
}
