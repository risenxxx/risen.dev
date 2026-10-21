/*
  Builds the site's icons from src/favicon/ into public/:

    favicon.svg           the tab icon, as drawn
    favicon.ico           the same at 16 and 32 px, for browsers that take no SVG
    apple-touch-icon.png  180 px, opaque, for a home screen

  The PNGs are rasterised by Chrome itself: a page draws each SVG into a
  canvas at the size wanted and writes the result into its own DOM, and
  `--dump-dom` hands the DOM back. No image library, and the pixels are the
  ones a browser makes of the SVG. Like og.png, the results are committed.

  Usage:  node scripts/favicon.mjs
  Needs a Chrome or Chromium. Set CHROME_PATH if it lives somewhere unusual.
*/
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)

const chrome = CANDIDATES.find((p) => existsSync(p))
if (!chrome) throw new Error('No Chrome found. Install one, or set CHROME_PATH to its binary.')

const svgUri = (file) => `data:image/svg+xml;base64,${readFileSync(file).toString('base64')}`

/** Each job: the SVG, the size, and an id to find the PNG by in the dump. */
const jobs = [
  { id: 'ico16', src: 'src/favicon/favicon.svg', size: 16 },
  { id: 'ico32', src: 'src/favicon/favicon.svg', size: 32 },
  { id: 'touch', src: 'src/favicon/touch.svg', size: 180 },
]

const html = `<!doctype html><body><script>
const jobs = ${JSON.stringify(jobs.map((j) => ({ id: j.id, size: j.size, uri: svgUri(j.src) })))}
Promise.all(jobs.map((j) => new Promise((done) => {
  const img = new Image(j.size, j.size)
  img.onload = () => {
    const c = document.createElement('canvas')
    c.width = c.height = j.size
    c.getContext('2d').drawImage(img, 0, 0, j.size, j.size)
    const out = document.createElement('pre')
    out.id = j.id
    out.textContent = c.toDataURL('image/png')
    document.body.append(out)
    done()
  }
  img.src = j.uri
})))
</script></body>`

const work = mkdtempSync(join(tmpdir(), 'favicon-'))
const page = join(work, 'raster.html')
writeFileSync(page, html)

let dom
try {
  dom = execFileSync(chrome, ['--headless', '--disable-gpu', '--virtual-time-budget=4000', '--dump-dom', `file://${page}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
} finally {
  rmSync(work, { recursive: true, force: true })
}

const png = (id) => {
  const m = dom.match(new RegExp(`<pre id="${id}">data:image/png;base64,([^<]+)</pre>`))
  if (!m) throw new Error(`Chrome did not rasterise ${id}`)
  return Buffer.from(m[1], 'base64')
}

/*
  An ICO is a 6-byte header, a 16-byte entry per image, then the images.
  Every browser that reads an ICO at all reads PNG entries inside it.
*/
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length)
  head.writeUInt16LE(0, 0)
  head.writeUInt16LE(1, 2)
  head.writeUInt16LE(images.length, 4)
  let offset = head.length
  images.forEach(({ size, data }, i) => {
    const at = 6 + 16 * i
    head.writeUInt8(size % 256, at)
    head.writeUInt8(size % 256, at + 1)
    head.writeUInt8(0, at + 2)
    head.writeUInt8(0, at + 3)
    head.writeUInt16LE(1, at + 4)
    head.writeUInt16LE(32, at + 6)
    head.writeUInt32LE(data.length, at + 8)
    head.writeUInt32LE(offset, at + 12)
    offset += data.length
  })
  return Buffer.concat([head, ...images.map((i) => i.data)])
}

copyFileSync('src/favicon/favicon.svg', 'public/favicon.svg')
writeFileSync('public/favicon.ico', ico([{ size: 16, data: png('ico16') }, { size: 32, data: png('ico32') }]))
writeFileSync('public/apple-touch-icon.png', png('touch'))

for (const f of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png']) {
  console.log(`public/${f} — ${(readFileSync(`public/${f}`).byteLength / 1024).toFixed(1)} KB`)
}
