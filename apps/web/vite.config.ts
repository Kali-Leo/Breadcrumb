import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { manualChunks } from "../desktop/vite.chunks";

const desktopSrc = fileURLToPath(new URL("../desktop/src", import.meta.url));
const shim = (name: string) => fileURLToPath(new URL(`./src/shims/${name}`, import.meta.url));

/**
 * The browser edition builds the desktop application's source directly. The only difference
 * between the two is which module answers when the app asks for SQLite, a Rust command, an
 * HTTP request or a link — so those four are aliased to browser implementations and nothing
 * else is duplicated. A feature added to the desktop app is in this build the same day.
 */
export default defineConfig({
  // GitHub Pages serves a project site under /<repo>/, so assets have to be requested from
  // there. Set BASE_PATH=/ for any host that serves from the root.
  base: process.env.BASE_PATH ?? "/Breadcrumb/",
  plugins: [react(), tailwindcss()],
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
