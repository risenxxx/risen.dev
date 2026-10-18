/*
  The few WebGL2 calls everything in here needs, and nothing it does not: a context, a program from one fragment shader over a full-screen
  triangle, a texture from an image or canvas, and a resize that respects the
  device pixel ratio.
*/
export type GL = WebGL2RenderingContext

export function getGL(canvas: HTMLCanvasElement): GL | null {
  return canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    powerPreference: 'low-power',
  })
}

/* One triangle that covers the clip space; no buffers, the vertex id is enough. */
const VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

function compile(gl: GL, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)
  if (!s) throw new Error('createShader failed')
  gl.shaderSource(s, src)
  gl.compileShader(s)
  return s
}

/*
  Linked but not waited for. Asking a program whether it linked makes the
  driver finish compiling it there and then, on the main thread; with
  KHR_parallel_shader_compile the work goes on in the background instead and
  `ready` asks, frame by frame, whether it is done. A failure surfaces there
  too, as a throw, so a caller that draws must be ready to take its canvas
  down. Without the extension `ready` waits once, as a status query always did.
*/
export function program(gl: GL, frag: string): WebGLProgram {
  const p = gl.createProgram()
  if (!p) throw new Error('createProgram failed')
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT))
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag))
  gl.linkProgram(p)
  return p
}

const parallel = new WeakMap<GL, { COMPLETION_STATUS_KHR: number } | null>()

export function ready(gl: GL, prog: WebGLProgram): boolean {
  let ext = parallel.get(gl)
  if (ext === undefined) {
    ext = gl.getExtension('KHR_parallel_shader_compile') as { COMPLETION_STATUS_KHR: number } | null
    parallel.set(gl, ext)
  }
  if (ext && !gl.getProgramParameter(prog, ext.COMPLETION_STATUS_KHR)) return false
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`program failed to link:\n${gl.getProgramInfoLog(prog) ?? ''}`)
  }
  return true
}

export function uniforms<const N extends readonly string[]>(
  gl: GL,
  prog: WebGLProgram,
  names: N,
): Record<N[number], WebGLUniformLocation | null> {
  const out = {} as Record<N[number], WebGLUniformLocation | null>
  for (const n of names) out[n as N[number]] = gl.getUniformLocation(prog, n)
  return out
}

export function texture(gl: GL, src: TexImageSource, opts: { mipmap?: boolean } = {}): WebGLTexture {
  const t = gl.createTexture()
  if (!t) throw new Error('createTexture failed')
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  if (opts.mipmap) {
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  }
  return t
}

/** An off-screen target with one RGBA texture, for a pass that another pass reads. */
export function framebuffer(gl: GL, w: number, h: number): { fbo: WebGLFramebuffer; tex: WebGLTexture } {
  const tex = gl.createTexture()
  const fbo = gl.createFramebuffer()
  if (!tex || !fbo) throw new Error('framebuffer failed')
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return { fbo, tex }
}

/** The device pixel ratio, capped: a 3× phone does not need 9 fragments per CSS pixel of glyph. */
export function dpr(cap = 2): number {
  return Math.min(window.devicePixelRatio || 1, cap)
}

/** Sizes the backing store to the element's on-screen box. Returns true when it changed. */
export function fit(canvas: HTMLCanvasElement, box: { width: number; height: number }, ratio: number): boolean {
  const w = Math.max(1, Math.round(box.width * ratio))
  const h = Math.max(1, Math.round(box.height * ratio))
  if (canvas.width === w && canvas.height === h) return false
  canvas.width = w
  canvas.height = h
  return true
}

export const REDUCED = matchMedia('(prefers-reduced-motion: reduce)')
