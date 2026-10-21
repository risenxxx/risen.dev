/*
  The page keeps a JavaScript budget. This is what keeps it kept.

  Counting files is not enough: Astro inlines a script this small straight into
  the document, so a `find dist -name '*.js'` gate would pass on a page that
  ships a megabyte of inline module. Both are counted here, raw rather than
  gzipped — raw bytes are what the parser has to get through.

  Two budgets. The page's own script — the reveals, the scenes, the figure's
  pan, the loader for what follows — is what every visitor parses before the
  page is interactive, and it stays small. The ASCII layer is one deferred
  module, fetched after the page has painted and only where WebGL2 is there
  and motion is not reduced; it has a budget of its own, so that it can
  neither hide inside the first one nor grow without anyone noticing.

  The analytics loader is a third line. It is the page's own bytes, but it
  does nothing for the page: it runs once the page has loaded and fetches
  Rybbit's script in idle time. Counted with the page's script it would eat
  the room kept for the reveals; counted nowhere it could grow into more than
  a loader. Rybbit's own script is a third party's and is not in `dist`.
*/
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'

const LIMIT = Number(process.env.JS_BUDGET ?? 6144)
const ASCII_LIMIT = Number(process.env.ASCII_BUDGET ?? 49152)
const ANALYTICS_LIMIT = Number(process.env.ANALYTICS_BUDGET ?? 512)
const DIST = 'dist'

/** The deferred module: the chunk Vite names after src/ascii/ascii.ts. */
const isAscii = (path) => basename(path).startsWith('ascii.') && path.endsWith('.js')

async function* walk(dir) {
  for (const entry of await readdir(dir)) {
    const path = join(dir, entry)
    if ((await stat(path)).isDirectory()) yield* walk(path)
    else yield path
  }
}

let total = 0
let ascii = 0
let analytics = 0
const parts = []

/*
  sw.js is not part of the page: it exists to unregister the old blog's service
  worker and never runs in the document, so it is not spent against the budget.
*/
const EXEMPT = new Set(['dist/sw.js'])

for await (const path of walk(DIST)) {
  if (path.endsWith('.js') && !EXEMPT.has(path)) {
    const bytes = (await readFile(path)).byteLength
    if (isAscii(path)) ascii += bytes
    else total += bytes
    parts.push([path, bytes])
    continue
  }

  if (!path.endsWith('.html')) continue

  const html = await readFile(path, 'utf8')
  let bytes = 0
  for (const [, attrs, body] of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
    // Structured data is content, not behaviour.
    if (body.includes('"@context"')) continue
    if (/\bdata-analytics\b/.test(attrs)) {
      analytics += Buffer.byteLength(body)
      parts.push([`${path} (analytics)`, Buffer.byteLength(body)])
      continue
    }
    bytes += Buffer.byteLength(body)
  }
  if (bytes > 0) {
    total += bytes
    parts.push([`${path} (inline)`, bytes])
  }
}

for (const [name, bytes] of parts.sort((a, b) => b[1] - a[1])) {
  console.log(`${String(bytes).padStart(7)}  ${name}`)
}
console.log(`${String(total).padStart(7)}  the page's own (limit ${LIMIT})`)
console.log(`${String(ascii).padStart(7)}  the ASCII layer, deferred (limit ${ASCII_LIMIT})`)
console.log(`${String(analytics).padStart(7)}  the analytics loader, after load (limit ${ANALYTICS_LIMIT})`)

let failed = false
if (total > LIMIT) {
  console.error(`::error::JavaScript budget exceeded: ${total} > ${LIMIT} bytes`)
  failed = true
}
if (ascii > ASCII_LIMIT) {
  console.error(`::error::ASCII module budget exceeded: ${ascii} > ${ASCII_LIMIT} bytes`)
  failed = true
}
if (analytics > ANALYTICS_LIMIT) {
  console.error(`::error::Analytics loader budget exceeded: ${analytics} > ${ANALYTICS_LIMIT} bytes`)
  failed = true
}
if (failed) process.exit(1)
