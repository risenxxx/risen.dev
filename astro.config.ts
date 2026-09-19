import { writeFile } from 'node:fs/promises'
import type { AstroIntegration } from 'astro'
import { defineConfig } from 'astro/config'

/*
  One page, static output, no framework runtime. `SITE_ORIGIN` lets a preview
  build (a pull request) advertise its own address in canonical links and in
  the sitemap instead of the production one.
*/
const site = new URL(process.env.SITE_ORIGIN ?? 'https://risen.dev')

/** A preview build asks search engines to stay away: the production page is the canonical one. */
const preview = process.env.SITE_PREVIEW === '1'

/**
 * `_headers` is written after the build rather than kept in `public/`: the
 * noindex header belongs to preview builds only, and one file serving both
 * modes would have to be remembered by hand.
 */
function pagesHeaders(): AstroIntegration {
  return {
    name: 'risen-headers-and-redirects',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        const lines = [
          '/*',
          '  X-Content-Type-Options: nosniff',
          '  Referrer-Policy: strict-origin-when-cross-origin',
          '  X-Frame-Options: DENY',
          ...(preview ? ['  X-Robots-Tag: noindex, nofollow'] : []),
          '/_astro/*',
          '  Cache-Control: public, max-age=31536000, immutable',
          '/cv/*',
          '  Cache-Control: public, max-age=3600',
          /*
            The old blog's service worker only goes away if the browser can
            fetch a newer script at this path, so it must never be answered
            from a cache. See public/sw.js for what it is and why it stays.
          */
          '/sw.js',
          '  Cache-Control: no-cache',
        ]
        await writeFile(new URL('_headers', dir), `${lines.join('\n')}\n`)

        /*
          The blog this domain used to carry is gone. Its posts lived under
          /posts/<slug>/ with a Russian mirror under /ru/, and those addresses
          are in other people's links and in search results — a 301 to the
          landing is worth more than five 404s.
        */
        const redirects = ['/posts/* / 301', '/ru/posts/* / 301', '/ru / 301', '/ru/* / 301']
        await writeFile(new URL('_redirects', dir), `${redirects.join('\n')}\n`)
      },
    },
  }
}

export default defineConfig({
  output: 'static',
  site: site.origin,
  integrations: [pagesHeaders()],
  // The whole stylesheet is one page's worth and compresses to a few kilobytes;
  // a separate request for it only delays the first paint.
  build: { inlineStylesheets: 'always', format: 'preserve' },
  // Scoped styles through :where() add no specificity, so a component overrides
  // a shared primitive by source order rather than by an extra attribute in the
  // selector silently outranking its neighbours.
  scopedStyleStrategy: 'where',
  vite: {
    define: {
      'import.meta.env.SITE_PREVIEW': JSON.stringify(preview ? '1' : ''),
    },
  },
})
