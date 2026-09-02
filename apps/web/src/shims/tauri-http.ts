/**
 * Purpose: stands in for @tauri-apps/plugin-http in the browser build — it is just the
 * browser's own fetch.
 *
 * One consequence is worth stating plainly rather than discovering at runtime. On the desktop
 * build these requests are made by Rust, outside the browser's security model, so any endpoint
 * works. Here they are made by a web page, so **the AI service has to allow cross-origin
 * requests**. Providers differ: some send the headers and work immediately, some do not and
 * will fail with a CORS error no amount of client code can fix.
 *
 * The app already treats a failed request as "degrade quietly and record it", so a blocked
 * provider surfaces the same way a network failure does. apps/web/README.md says which
 * providers are known to work, because "it does not work and I cannot see why" is the worst
 * possible first experience.
 * Main exports: fetch.
 */

/** The plugin's init, which is RequestInit plus a few Rust-client options. Only the one the
 * app actually passes is modelled here. */
interface TauriFetchInit extends RequestInit {
  maxRedirections?: number;
}

/**
 * The browser's fetch, bound so it cannot be called with the wrong `this`.
 *
 * `maxRedirections: 0` — safeFetch asks for it so it can re-check each hop itself — becomes
 * `redirect: "manual"`. The browser then answers with an opaque redirect: status 0, no
 * readable Location. That is deliberately a dead end rather than a silent follow: a redirect
 * the caller cannot inspect is one it cannot re-check, and safeFetch treats it as a refusal.
 * Any other value is left to the browser, which caps redirect chains on its own.
 */
export const fetch = (input: RequestInfo | URL, init?: TauriFetchInit): Promise<Response> => {
  if (init === undefined) return globalThis.fetch(input);
  const { maxRedirections, ...rest } = init;
  return globalThis.fetch(input, maxRedirections === 0 ? { ...rest, redirect: "manual" } : rest);
};

export default fetch;
