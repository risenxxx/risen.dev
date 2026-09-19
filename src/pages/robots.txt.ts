import type { APIRoute } from 'astro'

/** A preview build asks to be left out; the production page wants the opposite. */
export const GET: APIRoute = ({ site }) => {
  const preview = import.meta.env.SITE_PREVIEW === '1'
  const body = preview
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap.xml', site)}\n`

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
