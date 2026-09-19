/*
  The footer claims a JavaScript budget. This is what keeps that claim true.

  Counting files is not enough: Astro inlines a script this small straight into
  the document, so a `find dist -name '*.js'` gate would pass on a page that
  ships a megabyte of inline module. Both are counted here, raw rather than
  gzipped — raw bytes are what the parser has to get through.
*/
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

const LIMIT = Number(process.env.JS_BUDGET ?? 4096)
const DIST = 'dist'

async function* walk(dir) {
  for (const entry of await readdir(dir)) {
    const path = join(dir, entry)
    if ((await stat(path)).isDirectory()) yield* walk(path)
    else yield path
  }
}

let total = 0
const parts = []

/*
  sw.js is not part of the page: it exists to unregister the old blog's service
  worker and never runs in the document, so it is not spent against the budget
  the footer claims.
*/
const EXEMPT = new Set(['dist/sw.js'])

for await (const path of walk(DIST)) {
  if (path.endsWith('.js') && !EXEMPT.has(path)) {
    const bytes = (await readFile(path)).byteLength
    total += bytes
    parts.push([path, bytes])
    continue
  }

  if (!path.endsWith('.html')) continue

  const html = await readFile(path, 'utf8')
  let bytes = 0
  for (const [, body] of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    // Structured data is content, not behaviour.
    if (body.includes('"@context"')) continue
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
console.log(`${String(total).padStart(7)}  total (limit ${LIMIT})`)

if (total > LIMIT) {
  console.error(`::error::JavaScript budget exceeded: ${total} > ${LIMIT} bytes`)
  process.exit(1)
}
