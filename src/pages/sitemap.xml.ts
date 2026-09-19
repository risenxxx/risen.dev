import type { APIRoute } from 'astro'

/** One page, so the sitemap is written by hand rather than by an integration. */
export const GET: APIRoute = ({ site }) => {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${new URL('/', site)}</loc>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`

  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}
