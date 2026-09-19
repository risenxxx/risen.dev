# risen.dev

One static page: five solo products, the engineering behind them, and the path
from a plan to running infrastructure. Astro, no framework runtime, deployed to
Cloudflare by GitHub Actions on every push to `master`.

## Running it

```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # static output in dist/
npm run typecheck  # astro check
```

## How it is put together

| Path | What lives there |
| --- | --- |
| `src/pages/index.astro` | The page, section by section |
| `src/components/` | One component per section |
| `src/components/mocks/` | The five product previews, rebuilt in HTML and CSS |
| `src/components/IconSprite.astro` | Every brand mark, inlined once |
| `src/scripts/motion.ts` | The whole motion system, about a hundred lines |
| `src/styles/` | Tokens, then the primitives more than one section uses |

**Product previews are drawn, not captured.** Each one is rebuilt from that
product's own source — Frame Player's control glyphs are the paths out of
`Controls.svelte`, DeskVolt's rows are the geometry in `render.rs`, Gift Fight's
wheel is its real sector arithmetic. A screenshot would go stale and would say
nothing about how the page itself is built.

**Motion never touches the scroll.** `[data-reveal]` fades a block in when it
first crosses into view; `[data-scene]` animates a custom property from 0 to 1
once while a preview is on screen, and the preview's CSS decides what that
means. Nothing reads `scrollY`, so the page scrolls at its normal speed and the
reader is never held inside a section. Without JavaScript, or under
`prefers-reduced-motion`, everything renders in its finished state.

**Brand marks** are the single paths from [simple-icons](https://simple-icons.org)
(MIT), inlined as one sprite: no icon font, no request per logo.

**Non-breaking spaces are the character, not `&nbsp;`.** Some copy is rendered
as a text node and some through `set:html`; an entity is only decoded in the
second, so a single convention avoids a literal `&nbsp;` appearing on the page.

**The link preview** is `src/og/card.html`, rendered to `public/og.png` by
`npm run og` and committed. It is a standalone document rather than a route, so
there is no page whose only purpose is to be screenshotted; the script inlines
the fonts as data URIs because a `file://` page drops a font fetched from a
sibling path. Needs a Chrome on the machine — set `CHROME_PATH` if it is
somewhere unusual.

**Fonts** are latin-only and self-hosted. Three of them — Sora, Manrope and DM
Mono — set the first screen and are preloaded. The fourth, Rubik, exists only
because Frame Player and Gift Fight are really drawn in it; it is checked in as
a subset of printable ASCII over the 400–700 weights those previews use, 12.7 KB
instead of 35. Rebuild it with `scripts/subset-rubik.sh` after editing a
preview's copy.

## Deploying

`.github/workflows/deploy.yml` builds, type-checks, enforces the JavaScript
budget and then runs `wrangler deploy`. A pull request builds the same way,
uploads a preview version and comments the address on the PR.

### Repository secrets

`Settings → Secrets and variables → Actions → New repository secret`:

| Secret | Where it comes from |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | My Profile → API Tokens → Create Token → **Edit Cloudflare Workers** template |
| `CLOUDFLARE_ACCOUNT_ID` | Workers & Pages → Account details, or the id in any dashboard URL |

The *Edit Cloudflare Workers* template already carries everything the deploy
needs: `Account · Workers Scripts: Edit` to upload, and `Zone · Workers Routes:
Edit` plus `Zone · Zone: Read` for the custom domain. Scope it to this account
and to the `risen.dev` zone.

### On the Cloudflare side

1. `risen.dev` is an active zone on the same account (nameservers pointing at
   Cloudflare).
2. Any DNS record already answering for the apex — the old deployment's `A` or
   `CNAME` — is removed. `"custom_domain": true` makes wrangler create the
   record itself on the first deploy, and it will not fight an existing one.
3. The account has a workers.dev subdomain (Workers & Pages → Subdomain). The
   site is never served from it — `workers_dev` is `false` — but per-version
   preview URLs live under it, and those are what a pull request links to.
4. `www`, if wanted: a proxied placeholder record for `www` plus a redirect rule
   `www.risen.dev/*` → `https://risen.dev/$1` (301). Deliberately not a second
   route here, so there is only ever one address serving the page.

Nothing else needs turning on. The Worker is created by the first successful
deploy; there is no dashboard setup to do beforehand.

To deploy by hand: `wrangler login`, then `npm run deploy`.

## Licence

`LICENSE-website`.
