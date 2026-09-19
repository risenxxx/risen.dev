/*
  Renders src/og/card.html into public/og.png.

  The result is committed, not built in CI: the card changes a few times a year,
  and a deploy should not depend on a browser being installable on the runner.
  Run this after editing the card, then commit the PNG.

  The fonts are inlined as data URIs before rendering. The card is loaded over
  file://, where a font fetched from a sibling path counts as cross-origin and
  is dropped — the card would render in Times and look like nothing on the site.
  Inlining sidesteps it without standing up a server for one screenshot.

  Usage:  node scripts/og.mjs
  Needs a Chrome or Chromium. Set CHROME_PATH if it lives somewhere unusual.
*/
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const WIDTH = 1200
const HEIGHT = 630

const FONTS = [
  {
    family: 'Sora Variable',
    file: 'node_modules/@fontsource-variable/sora/files/sora-latin-wght-normal.woff2',
    weight: '100 800',
  },
  {
    family: 'Public Sans Variable',
    file: 'node_modules/@fontsource-variable/public-sans/files/public-sans-latin-wght-normal.woff2',
    weight: '100 900',
  },
  {
    family: 'DM Mono',
    file: 'node_modules/@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff2',
    weight: '400',
  },
]

/** Where a Chrome tends to be, in the order worth trying. */
const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)

function findChrome() {
  for (const path of CANDIDATES) {
    if (existsSync(path)) return path
  }
  // Playwright keeps one around, and its exact build number moves.
  const cache = join(process.env.HOME ?? '', 'Library/Caches/ms-playwright')
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache).sort().reverse()) {
      for (const tail of [
        'chrome-headless-shell-mac-arm64/chrome-headless-shell',
        'chrome-headless-shell-mac-x64/chrome-headless-shell',
        'chrome-linux/chrome',
      ]) {
        const path = join(cache, dir, tail)
        if (existsSync(path)) return path
      }
    }
  }
  throw new Error('No Chrome found. Install one, or set CHROME_PATH to its binary.')
}

const faces = FONTS.map(({ family, file, weight }) => {
  const data = readFileSync(file).toString('base64')
  const format = weight.includes(' ') ? 'woff2-variations' : 'woff2'
  return `@font-face{font-family:"${family}";src:url(data:font/woff2;base64,${data}) format("${format}");font-weight:${weight};font-style:normal;font-display:block}`
}).join('\n')

const html = readFileSync('src/og/card.html', 'utf8').replace('/*FONTS*/', faces)

const work = mkdtempSync(join(tmpdir(), 'og-'))
const page = join(work, 'card.html')
writeFileSync(page, html)

try {
  execFileSync(
    findChrome(),
    [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${WIDTH},${HEIGHT}`,
      // The fonts are inlined, so the only thing left to wait for is layout.
      '--virtual-time-budget=4000',
      '--screenshot=public/og.png',
      `file://${page}`,
    ],
    { stdio: 'pipe' },
  )
} finally {
  rmSync(work, { recursive: true, force: true })
}

const bytes = readFileSync('public/og.png').byteLength
console.log(`public/og.png — ${WIDTH}×${HEIGHT}, ${(bytes / 1024).toFixed(1)} KB`)
