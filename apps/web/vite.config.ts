import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
    // The occupation and curriculum datasets are megabytes of static data by design; warning
    // about them on every build trains people to ignore the warning.
    chunkSizeWarningLimit: 12_000,
  },
});
