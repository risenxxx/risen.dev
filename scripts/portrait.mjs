/*
  The portrait in the hero, encoded from `src/portrait/source.jpg`.

  Unlike the pictures inside the previews — which arrive already encoded from
  Frame Player's own site — this one starts as a square photograph, so the crop
  and the ladder are decided here and the result is committed. Run it again
  after replacing the source:

      npm run portrait

  CROP takes the largest 4:5 rectangle the square source holds. The hero draws
  the portrait at 300 px, so 512 is the top of the ladder and also the most
  detail this source has: nothing is ever scaled up, and a 2× screen is served
  the 512 rather than a blurred enlargement of it.
*/
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const SRC = fileURLToPath(new URL('../src/portrait/source.jpg', import.meta.url))
const OUT = fileURLToPath(new URL('../public/assets/img/', import.meta.url))

const CROP = { left: 64, top: 0, width: 512, height: 640 }
const WIDTHS = [300, 380, 512]

await mkdir(OUT, { recursive: true })

const base = sharp(SRC).extract(CROP)
const { width, height } = await sharp(SRC).metadata()
if (width !== height) {
  throw new Error(`source is ${width}×${height}; the crop above assumes a square`)
}

for (const w of WIDTHS) {
  const resized = () => base.clone().resize({ width: w })
  await Promise.all([
    resized().avif({ quality: 62 }).toFile(`${OUT}portrait-${w}.avif`),
    resized().webp({ quality: 78 }).toFile(`${OUT}portrait-${w}.webp`),
    resized().jpeg({ quality: 82, mozjpeg: true }).toFile(`${OUT}portrait-${w}.jpg`),
  ])
  console.log(`portrait-${w}: avif, webp, jpg`)
}
