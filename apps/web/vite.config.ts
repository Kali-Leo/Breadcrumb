import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { manualChunks } from "../desktop/vite.chunks";
import { pwaPlugin } from "./vite.pwa";

// GitHub Pages serves a project site under /<repo>/, so assets have to be requested from
// there. Set BASE_PATH=/ for any host that serves from the root.
const base = process.env.BASE_PATH ?? "/Breadcrumb/";

const desktopSrc = fileURLToPath(new URL("../desktop/src", import.meta.url));
const shim = (name: string) => fileURLToPath(new URL(`./src/shims/${name}`, import.meta.url));

/**
 * onnxruntime-web resolves its own binary with `new URL("ort-wasm-….wasm", import.meta.url)`,
 * which Vite dutifully turns into a 23.6 MB emitted asset. Nothing ever requests it:
 * embeddingWorker.ts overrides `wasmPaths` before the runtime initialises, pointing at the
 * copy public/ort/ serves from this origin (copy-ort-assets.mjs). Deleting it from the bundle
 * costs the deploy a quarter of its size and the runtime nothing. The URL string stays in the
 * JavaScript, unevaluated and unfetched.
 */
function dropDuplicateOrtWasm(): Plugin {
  return {
    name: "breadcrumb:drop-duplicate-ort-wasm",
    generateBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (/(^|\/)ort-wasm-[^/]*\.wasm$/.test(fileName)) delete bundle[fileName];
      }
    },
  };
}

/**
 * The browser edition builds the desktop application's source directly. The only difference
 * between the two is which module answers when the app asks for SQLite, a Rust command, an
 * HTTP request or a link — so those four are aliased to browser implementations and nothing
 * else is duplicated. A feature added to the desktop app is in this build the same day.
 */
export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), dropDuplicateOrtWasm(), pwaPlugin(base)],
  resolve: {
    alias: [
      { find: "@tauri-apps/plugin-sql", replacement: shim("tauri-sql.ts") },
      { find: "@tauri-apps/api/core", replacement: shim("tauri-core.ts") },
      { find: "@tauri-apps/plugin-http", replacement: shim("tauri-http.ts") },
      { find: "@tauri-apps/plugin-opener", replacement: shim("tauri-opener.ts") },
      { find: "@desktop", replacement: desktopSrc },
    ],
  },
  // The desktop app's source lives outside this package's root, so Vite has to be told it may
  // read from there.
  server: { fs: { allow: [desktopSrc, fileURLToPath(new URL(".", import.meta.url))] } },
  optimizeDeps: {
    // sqlite-wasm ships a worker and its own .wasm; pre-bundling mangles the paths it needs.
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  build: {
    target: "es2022",
    rollupOptions: { output: { manualChunks } },
    // Back to a number that means something. The occupation datasets are still megabytes and
    // will still say so on every build — they are named chunks now, so the warning points at
    // them by name and nothing else hides behind a raised ceiling. What actually guards the
    // first screen is scripts/check-bundle-size.mjs, which this package runs after every build.
    chunkSizeWarningLimit: 1_000,
  },
});
