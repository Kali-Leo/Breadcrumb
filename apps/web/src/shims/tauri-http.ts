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

/** The browser's fetch, bound so it cannot be called with the wrong `this`. */
export const fetch: typeof globalThis.fetch = (...args) => globalThis.fetch(...args);

export default fetch;
