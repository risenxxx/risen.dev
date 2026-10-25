/*
  What the page says to someone who opens the console.

  Whoever opens devtools on a portfolio is, more often than not, the person
  it was written for: an engineer checking the work, or a recruiter checking
  the engineer. So the console gets a short manual page — who, what, how to
  reach the author — and a handful of commands for a reader who wants to poke at it.

  It is a module of its own, imported after `load` in idle time
  (layouts/Page.astro), with a budget line of its own (scripts/budget.mjs):
  nobody reading the page should pay for a greeting to the console.

  Only `console.log`, never `warn` or `error`: a red line in the console
  reads as a broken page, and an audit counts it as one. Colour is used once,
  on the wordmark — the console may be light or dark, and anything that has
  to be read is left in the console's own colour.
*/
import { resumes, site } from '../data/site.ts'

declare global {
  interface Window {
    help: () => void
    hire: (kind?: 'contract') => void
    cv: () => void
    source: () => void
    stack: () => void
  }
}

const WORDMARK = String.raw`
       _
  _ __(_)___  ___ _ __
 | '__| / __|/ _ \ '_ \
 | |  | \__ \  __/ | | |
 |_|  |_|___/\___|_| |_|`

const WIDTH = 56

const header = (left: string, mid: string): string => {
  const gap = WIDTH - 2 * left.length - mid.length
  return left + ' '.repeat(Math.floor(gap / 2)) + mid + ' '.repeat(Math.ceil(gap / 2)) + left
}

const MAN = `${header('RISEN(1)', 'People Manual')}

NAME
     risen — one engineer, every layer

SYNOPSIS
     hire()
     hire('contract')

DESCRIPTION
     Full-stack and platform engineer: the interface, the
     services behind it and the infrastructure they run
     on, for eight years. ${cap(site.availability)}.
     ${site.location}, ${site.timezone}, ${site.hours}.

SEE ALSO
     ${site.email} · t.me/risenx · ${site.call.replace('https://', '')}

Type %chelp()%c to look around.`

const COMMANDS: [string, string][] = [
  ['hire()', 'write to me about a role'],
  ["hire('contract')", 'write to me about a project'],
  ['cv()', 'open the resume'],
  ['source()', 'read how this page was built'],
  ['stack()', 'what this visit cost, measured'],
]

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1)
}

/** A box around lines of text, padded to the longest. Box drawing is in every console font. */
function box(title: string, lines: string[]): string {
  const inner = Math.max(title.length + 2, ...lines.map((l) => l.length)) + 2
  const top = `┌─ ${title} ${'─'.repeat(inner - title.length - 3)}┐`
  const body = lines.map((l) => `│ ${l.padEnd(inner - 2)} │`)
  return [top, ...body, `└${'─'.repeat(inner)}┘`].join('\n')
}

/** The same `Contact` event the page's own links send (src/analytics.ts), from here. */
function contact(via: string): void {
  window.rybbit?.event('Contact', { via, from: 'console' })
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`
}

function row(label: string, value: string): string {
  return `  ${label} ${'.'.repeat(Math.max(2, 18 - label.length))} ${value}`
}

const mono = 'font-family: ui-monospace, Menlo, monospace'

function say(text: string): void {
  console.log(`%c${text}`, mono)
}

export function hello(): void {
  console.log(
    `%c${WORDMARK}\n\n%c${MAN}`,
    `${mono}; color: #f2b63d; font-weight: bold`,
    mono,
    `${mono}; font-weight: bold`,
    mono,
  )

  window.help = () => {
    const width = Math.max(...COMMANDS.map(([c]) => c.length))
    const lines = ['you found the back door.', '', ...COMMANDS.map(([c, d]) => `> ${c.padEnd(width)}  ${d}`)]
    say(box(site.domain, lines))
  }

  window.hire = (kind) => {
    const subject = kind === 'contract' ? 'A project for you' : 'A role for you'
    contact('email')
    location.href = `mailto:${site.email}?subject=${encodeURIComponent(subject)}`
    say(`Opening your mail client. Or write to ${site.email} from wherever you like.`)
  }

  window.cv = () => {
    contact('cv')
    open(resumes[0].href, '_blank', 'noopener')
    const others = resumes.slice(1).map((r) => `  ${r.label}: ${r.href}`)
    say([`Opened the ${resumes[0].label} resume. The same eight years, told differently:`, ...others].join('\n'))
  }

  window.source = () => {
    open(site.repo, '_blank', 'noopener')
    say(`${site.repo} — the comments are written for whoever reads them. Right now, that is you.`)
  }

  window.stack = () => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    // Raw bytes rather than transferred: a cached file costs no transfer, and still has to be parsed.
    const sum = (test: (r: PerformanceResourceTiming) => boolean): number =>
      res.filter(test).reduce((n, r) => n + r.decodedBodySize, 0)
    const inline = [...document.scripts]
      .filter((s) => !s.src && s.type !== 'application/ld+json')
      .reduce((n, s) => n + new Blob([s.text]).size, 0)
    const js = sum((r) => new URL(r.name).pathname.endsWith('.js')) + inline
    const fonts = sum((r) => new URL(r.name).pathname.endsWith('.woff2'))
    const ascii = document.documentElement.classList.contains('ascii') ? 'on, WebGL2' : 'off on this device'

    say(
      [
        'What this visit cost, measured just now:',
        '',
        row('HTML', nav ? kb(nav.decodedBodySize) : 'n/a'),
        row('JavaScript', kb(js)),
        row('Fonts', kb(fonts)),
        row('Interactive', nav ? `${Math.round(nav.domInteractive)} ms` : 'n/a'),
        row('Loaded', nav ? `${Math.round(nav.loadEventEnd)} ms` : 'n/a'),
        '',
        row('Framework', 'Astro, static, no runtime shipped'),
        row('ASCII layer', ascii),
        row('Served by', 'Cloudflare'),
      ].join('\n'),
    )
  }
}
