/**
 * Purpose: the browser edition's installability and its offline shell.
 *
 * Two decisions carry the whole file. The first: what goes into the precache, which a service
 * worker downloads *in one transaction* on first visit — one failed request and the whole
 * install is discarded. So the precache is the shell and nothing else: the scripts, the
 * stylesheet, the map's artwork, and SQLite's wasm, because a database that cannot open is not
 * a degraded app, it is a blank page. The heavy, optional things — the occupation datasets,
 * mermaid, the bundled dictionary, the embedding runtime, the font slices — are cached the
 * first time they are actually used, which is the honest trade: a fast first visit, and an
 * offline experience that completes itself as someone uses the app.
 *
 * The second: everything cached at runtime is content-hashed or immutable, so CacheFirst is
 * correct for all of it. A new deploy writes new filenames; the old entries expire out.
 *
 * `scope`, `start_url` and the service worker's own location are all left to the plugin, which
 * takes them from Vite's `base` — the app is served from /Breadcrumb/ on GitHub Pages, and a
 * service worker cannot claim a scope above its own path without a response header no static
 * host will send.
 *
 * Main exports: pwaPlugin.
 */

import type { PluginOption } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/** A year. The runtime caches hold hashed filenames, so an entry is either still referenced
 * or already unreachable; there is nothing to go stale. */
const YEAR = 60 * 60 * 24 * 365;

/** Everything precaching must not swallow. The first four are big enough to make a first
 * visit feel like a download; the rest are optional by design and arrive through
 * runtimeCaching instead. `ort/` and `language-packs/` are directories the build publishes
 * whole (the language packs are added to dist after the build, by the Pages workflow). */
const NOT_THE_SHELL = [
  "ort/**",
  "language-packs/**",
  "assets/wenkai-*.woff2",
  "assets/embeddingWorker-*.js",
  "assets/escoDataset-*.js",
  "assets/onetDataset-*.js",
  "assets/mermaid-*.js",
  "assets/zh-en-*.js",
  // Vite emits a second copy of the ONNX runtime's binary from onnxruntime-web's own
  // `new URL()`; vite.config.ts drops it, and this is the belt to that pair of braces.
  "assets/ort-wasm-*.wasm",
];

export function pwaPlugin(base: string): PluginOption {
  return VitePWA({
    // The alternative, "prompt", needs an update dialog in the interface and cannot be
    // migrated to later without stranding everyone who already installed the other one
    // (vite-plugin-pwa #228, #721). This app has no version the learner can act on.
    registerType: "autoUpdate",
    // A separate registerSW.js rather than an inline script: index.html's Content-Security
    // -Policy is `script-src 'self'` with no 'unsafe-inline', and an inline registration
    // would simply not run.
    injectRegister: "script-defer",
    // The icons are already in the precache through globPatterns; leaving this on lists each
    // of them twice.
    includeManifestIcons: false,
    manifest: {
      // No `lang` and no `dir`: the interface speaks eleven languages and the learner picks
      // one at runtime. Naming a single language here would be wrong ten times out of eleven,
      // and a manifest cannot be re-read per session.
      id: base,
      // The plugin's default manifest says lang: "en"; undefined removes the key from the
      // JSON rather than replacing one wrong answer with another.
      lang: undefined,
      name: "Breadcrumb",
      short_name: "Breadcrumb",
      description:
        "本地优先的 AI 学习伴侣。你的数据留在这台设备上。A local-first AI learning companion; " +
        "your data stays on this device.",
      display: "standalone",
      // Both match index.html: the shell is white, and so is the boot screen behind it.
      theme_color: "#ffffff",
      background_color: "#ffffff",
      // Relative to the manifest's own url. Writing the base path in here would double it
      // (vite-plugin-pwa #713).
      icons: [
        { src: "icon-128.png", sizes: "128x128", type: "image/png" },
        { src: "icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    },
    workbox: {
      globPatterns: ["**/*.{js,css,html,png,svg}", "assets/sqlite3-*.wasm"],
      globIgnores: NOT_THE_SHELL,
      // Left at Workbox's 2 MiB default deliberately: it is a second, size-based guard over
      // the list above, so a chunk that grows past it fails loudly instead of quietly turning
      // the first visit into a multi-megabyte download.
      navigateFallback: `${base}index.html`,
      cleanupOutdatedCaches: true,
      runtimeCaching: [
        {
          // The Chinese font's 94 slices and KaTeX's faces. A browser fetches only the slices
          // a page actually needs, which is exactly why they must not be precached: precaching
          // would fetch all 94.
          urlPattern: /\.(?:woff2?|ttf)$/,
          handler: "CacheFirst",
          options: {
            cacheName: "fonts",
            expiration: { maxEntries: 160, maxAgeSeconds: YEAR },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          // Installed dictionaries. Downloaded once, verified against the digest in the
          // catalogue, then read out of the database — this only spares a re-download.
          urlPattern: /\/language-packs\/[^/]+\.json$/,
          handler: "CacheFirst",
          options: {
            cacheName: "language-packs",
            expiration: { maxEntries: 16, maxAgeSeconds: YEAR },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          // The ONNX runtime. The model weights beside it are not here on purpose:
          // transformers.js keeps those in its own Cache API store (see modelCache.ts), and
          // two caches for one download would mean storing 113 MB twice.
          urlPattern: /\/ort\/[^/]+$/,
          handler: "CacheFirst",
          options: {
            cacheName: "ort",
            expiration: { maxEntries: 8, maxAgeSeconds: YEAR },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          // The chunks kept out of the shell. Cached the moment they are first used, so the
          // second visit has them offline: the embedding worker (useless without its model,
          // which has its own cache), the two occupation datasets, mermaid, and the bundled
          // Chinese-English pack the demo learner is seeded from.
          urlPattern:
            /\/assets\/(?:embeddingWorker|escoDataset|onetDataset|mermaid|zh-en)-[^/]+\.js$/,
          handler: "CacheFirst",
          options: {
            cacheName: "heavy-chunks",
            expiration: { maxEntries: 12, maxAgeSeconds: YEAR },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
      ],
    },
  });
}
