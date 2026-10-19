/*
  The portrait in the hero, encoded from `src/portrait/source.jpg`.

  Unlike the pictures inside the previews — which arrive already encoded from
  Frame Player's own site — this one starts as a full photograph, so the crop
  and the ladder are decided here and the result is committed. Run it again
  after replacing the source:

      npm run portrait

  The source is already 4:5, but framed loose: a fifth of it is empty sky above
  the hair. CROP takes a tighter 4:5 around the head, so the face carries the
  picture at the 300 px the hero draws it at, and leaves 980 px of width — more
  than the top of the ladder, so nothing is ever scaled up.

  The ladder follows `sizes` in Portrait.astro: 300 and 340 at 1×, 600 and 680
  at 2×. A 3× phone gets the 680 rather than an enlargement.

  AVIF is set by size against the WebP beside it rather than by the number:
  at a matching quality it has to come out smaller, or a browser that prefers
  it is served the heavier file of the two.
*/
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const SRC = fileURLToPath(new URL('../src/portrait/source.jpg', import.meta.url))
const OUT = fileURLToPath(new URL('../public/assets/img/', import.meta.url))

const SOURCE = { width: 1086, height: 1357 }
const CROP = { left: 70, top: 123, width: 980, height: 1225 }
const WIDTHS = [300, 380, 600, 680]

const { width, height } = await sharp(SRC).metadata()
if (width !== SOURCE.width || height !== SOURCE.height) {
  throw new Error(`source is ${width}×${height}; the crop above assumes ${SOURCE.width}×${SOURCE.height}`)
}

await mkdir(OUT, { recursive: true })

// A rung that is no longer on the ladder would otherwise sit in public/ forever.
for (const file of await readdir(OUT)) {
  const w = Number(/^portrait-(\d+)\./.exec(file)?.[1])
  if (w && !WIDTHS.includes(w)) await rm(`${OUT}${file}`)
}

const base = sharp(SRC).extract(CROP)

for (const w of WIDTHS) {
  const resized = () => base.clone().resize({ width: w })
  await Promise.all([
    resized().avif({ quality: 50, effort: 9 }).toFile(`${OUT}portrait-${w}.avif`),
    resized().webp({ quality: 78 }).toFile(`${OUT}portrait-${w}.webp`),
    resized().jpeg({ quality: 82, mozjpeg: true }).toFile(`${OUT}portrait-${w}.jpg`),
  ])
  console.log(`portrait-${w}: avif, webp, jpg`)
}

/*
  What the page carries in its own markup while the ASCII layer is on its way:
  the portrait as the glyph field the run opens with, so the box is never empty
  and the first frame the canvas draws continues what the style already shows.

  Two files, from the same 42 × 31 grid — the shader's cell at the start of
  the run (12 px tall, 0.6 as wide) over the 300 px the hero draws the
  portrait at; the style scales the grid to the box, whatever its width:

    glyphs.txt   one character per cell, drawn by chance — the run opens
                 on random glyphs, and the photograph is in their colour;
    mosaic.png   the photograph at one pixel per cell, which the style puts
                 behind the glyphs and clips to their ink — the colour of each
                 glyph is the colour of its cell, as the shader colours them.

  The grid is not square: a cell is 7.1 × 12.1 px, so the resize ignores the
  aspect and maps one pixel onto one cell. A palette PNG: about 2 KB as a
  data URI; the glyphs are 1.3 KB of text.
*/
const COLS = 42
const ROWS = 31
const cells = base.clone().resize({ width: COLS, height: ROWS, fit: 'fill' })
await cells
  .clone()
  .png({ palette: true, colours: 64, compressionLevel: 9 })
  .toFile(fileURLToPath(new URL('../src/portrait/mosaic.png', import.meta.url)))

// The glyphs the run opens with are random — the photograph is in their
// colour, not their shape — so these are drawn by chance from the denser
// half of DM Mono, the way the shader's first frame looks.
const GLYPHS = '=+^~<>/()[]{}7]|kzoTUKSO0W#&@GMNeUz'
let seed = 11
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const lines = []
for (let y = 0; y < ROWS; y++) {
  let line = ''
  for (let x = 0; x < COLS; x++) line += GLYPHS[Math.floor(rnd() * GLYPHS.length)]
  lines.push(line)
}
await writeFile(fileURLToPath(new URL('../src/portrait/glyphs.txt', import.meta.url)), lines.join('\n'))
console.log(`placeholder: ${COLS} × ${ROWS} glyphs and mosaic`)
