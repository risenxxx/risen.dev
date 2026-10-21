/**
 * The site's one piece of code: `/s/*`, the page counter's own address
 * (src/analytics.ts), forwarded to Rybbit.
 *
 * Everything else is static files, and this never runs for them:
 * `run_worker_first` in wrangler.jsonc names `/s/*` alone, so the page, the
 * fonts and `/_astro/*` are served by the assets layer without waking it and
 * without counting against the account's Workers requests.
 */
import { ANALYTICS_PREFIX, RYBBIT_UPSTREAM } from '../src/analytics.ts'

/** Workers add `cf` to `fetch`; the DOM types do not know it. */
type EdgeFetch = (
  input: string,
  init: RequestInit & { cf?: { cacheEverything: boolean; cacheTtl: number } },
) => Promise<Response>

/** Connection headers, which by definition are never forwarded. */
const HOP_BY_HOP = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']

/**
 * What may be forwarded, and for how long the edge keeps the answer (Rybbit's
 * own guidance: the script an hour, the site's config five minutes, events
 * never). The list is closed on purpose: session replay, `identify` and the
 * feature flags are not on it, so the proxy is not a general way into Rybbit's
 * API under this domain's name.
 */
function routeOf(path: string): { method: 'GET' | 'POST'; ttl: number } | null {
  if (path === 'script.js') return { method: 'GET', ttl: 3600 }
  if (path === 'track') return { method: 'POST', ttl: 0 }
  if (/^site\/tracking-config\/[\w-]{1,64}$/.test(path)) return { method: 'GET', ttl: 300 }
  return null
}

/** The only query keys that reach Rybbit: the channel is read from these and the referrer's host. */
const MARKS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']

/**
 * An event before it leaves: the query string cut down to `utm_*`, the
 * referrer to its origin.
 *
 * The script sends `location.search` whole, and with it the click ids —
 * LinkedIn's `trk`, `fbclid`, `gclid` — each the number of one particular
 * click by which a platform knows its user; in the dashboard it would sit as a
 * raw string forever. A referrer such as `l.facebook.com/l.php?u=…&h=…`
 * carries the same kind of token in its path, and Rybbit reads the channel
 * from the host alone.
 *
 * A body that does not parse as an object goes on untouched: Rybbit rejects it
 * itself, and a second validator here would be invention.
 */
function scrub(body: string): string {
  let event: unknown
  try {
    event = JSON.parse(body)
  } catch {
    return body
  }
  if (typeof event !== 'object' || event === null || Array.isArray(event)) return body
  const fields = event as Record<string, unknown>
  if (typeof fields.querystring === 'string') {
    const kept = new URLSearchParams()
    for (const [key, value] of new URLSearchParams(fields.querystring)) {
      if (MARKS.includes(key.toLowerCase())) kept.append(key, value)
    }
    const query = kept.toString()
    fields.querystring = query === '' ? '' : `?${query}`
  }
  if (typeof fields.referrer === 'string' && fields.referrer !== '') {
    try {
      fields.referrer = `${new URL(fields.referrer).origin}/`
    } catch {
      fields.referrer = ''
    }
  }
  return JSON.stringify(fields)
}

/**
 * `/s/*` → Rybbit.
 *
 * The visitor's address travels as `X-Forwarded-For` — without it every
 * visitor is one visitor in the worker's datacenter, since Rybbit counts
 * sessions by address and browser rather than by a cookie — and the site's
 * settings in Rybbit must have **First-Party Proxy** on, or it believes the
 * network's topology over the header. The rest of the browser's headers go as
 * they came: bot filtering reads them. Cookies do not: there are none of ours
 * on this domain, and the edge's own are nothing the counter needs.
 */
async function counter(request: Request, path: string): Promise<Response> {
  const route = routeOf(path)
  if (route === null) return new Response('not found', { status: 404 })
  if (request.method !== route.method) {
    return new Response('method not allowed', { status: 405, headers: { allow: route.method } })
  }

  const headers = new Headers(request.headers)
  // The length goes too: `scrub` rewrites the body, and the old one would lie.
  for (const name of [...HOP_BY_HOP, 'host', 'cookie', 'content-length']) headers.delete(name)
  const visitor = request.headers.get('cf-connecting-ip')
  if (visitor !== null) headers.set('x-forwarded-for', visitor)

  const url = new URL(request.url)
  const upstream = await (fetch as EdgeFetch)(`${RYBBIT_UPSTREAM}/${path}${url.search}`, {
    method: request.method,
    headers,
    body: route.method === 'POST' ? scrub(await request.text()) : null,
    ...(route.ttl > 0 ? { cf: { cacheEverything: true, cacheTtl: route.ttl } } : {}),
  })

  const response = new Response(upstream.body, upstream)
  /* Their edge's headers stay theirs: network reports would be sent to their
     collector under our name, `alt-svc` would advertise their protocols for our
     domain, and CORS has nothing to allow on a same-origin request. */
  for (const name of ['report-to', 'nel', 'alt-svc', 'access-control-allow-origin', 'set-cookie']) {
    response.headers.delete(name)
  }
  response.headers.set('cache-control', route.ttl > 0 ? `public, max-age=${route.ttl}` : 'no-store')
  return response
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith(ANALYTICS_PREFIX)) return counter(request, url.pathname.slice(ANALYTICS_PREFIX.length))
    // Not reachable while `run_worker_first` names `/s/*` alone; a guard, not a route.
    return new Response('not found', { status: 404 })
  },
}
