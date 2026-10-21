/**
 * The page counter: Rybbit, reached through this domain's own address.
 *
 * The script takes its event endpoint from its own `src`, cutting at
 * `/script.js`, so one prefix here is all both sides need to agree on: the
 * page loads `/s/script.js`, the script posts to `/s/track`, and the worker
 * (`worker/index.ts`) forwards them to Rybbit. A blocker's host list then has
 * no third party to match, and the browser opens no second connection.
 *
 * The prefix is not `/api/`: blocklists carry generic path rules for Rybbit
 * (`/api/site/tracking-config/*`, `/api/track|`) that match on any host.
 *
 * The site id is in every page's markup anyway, so it lives here rather than
 * in the build environment.
 */
export const RYBBIT_SITE_ID = '36c0eb8196cd'

/** Where Rybbit itself answers. The worker's only upstream. */
export const RYBBIT_UPSTREAM = 'https://app.rybbit.io/api'

/** Our own prefix for it. `run_worker_first` in wrangler.jsonc names it too. */
export const ANALYTICS_PREFIX = '/s/'

export const ANALYTICS_SRC = `${ANALYTICS_PREFIX}script.js?siteId=${RYBBIT_SITE_ID}`
