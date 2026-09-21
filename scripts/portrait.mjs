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
import { mkdir, readdir, rm } from 'node:fs/promises'
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
