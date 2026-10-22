/*
  The ASCII layer saying it has given up, counted.

  The layer degrades in silence on purpose: no WebGL2 context, a shader that
  will not link on some GPU, a module that never arrives — the page simply
  stands without it. That is right for the reader and blind for the author,
  and the counter's own error tracking would not see it either: it is
  switched on only once the counter has loaded, after the layer has started,
  and every one of these is caught where it happens. So the layer says so
  itself.

  The layer, or the page for it, dispatches `ascii-off` on `window` with
  `{ off, detail }`: `off` is `load`, `context`, `link` or `error`, `detail`
  whatever says more (an error message, a shader's info log). Here that
  becomes one `Ascii` event per kind per page view. The counter loads late —
  after `load`, in idle time — so a failure that comes first waits for the
  `rybbit` event its loader sends once it is there (layouts/Page.astro).
  Without a counter, in dev or behind a blocker, it waits for nothing.
*/

export interface AsciiOff {
  off: 'load' | 'context' | 'link' | 'error'
  detail?: string
}

declare global {
  interface Window {
    rybbit?: { event(name: string, props?: Record<string, string>): void }
  }
  interface WindowEventMap {
    'ascii-off': CustomEvent<AsciiOff>
  }
}

/** Long enough for an error's first line or the start of an info log, and no longer. */
const DETAIL = 160

/** Sends what the layer reports. Call before the layer is imported, so nothing it says is missed. */
export function countAsciiOff(): void {
  const sent = new Set<string>()
  addEventListener('ascii-off', ({ detail: { off, detail } }) => {
    if (sent.has(off)) return
    sent.add(off)
    const props: Record<string, string> = detail ? { off, detail: detail.slice(0, DETAIL) } : { off }
    const send = (): void => window.rybbit?.event('Ascii', props)
    if (window.rybbit) send()
    else addEventListener('rybbit', send, { once: true })
  })
}

/** Reports a failure from the page's side: a layer that never arrived. The layer has its own (ascii/gl.ts). */
export function asciiOff(off: AsciiOff['off'], detail?: unknown): void {
  dispatchEvent(new CustomEvent('ascii-off', { detail: { off, detail: detail === undefined ? undefined : String(detail) } }))
}
