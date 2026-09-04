import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { manualChunks } from "./vite.chunks";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  // Same grouping as the browser edition, so a problem with it shows up in whichever build
  // runs first rather than only in production.
  build: {
    // The same floor the browser edition sets (apps/web/vite.config.ts explains why these four
    // numbers), for the same reason from the other direction: this build's webviews are the
    // host's, not ours — WKWebView on macOS, WebKitGTK on Linux — so a Mac on macOS 13 is
    // running Safari 16's engine and gets whatever this line compiles to. Left unset, Vite
    // picks its own default and the two editions could silently disagree.
    target: ["chrome111", "edge111", "firefox128", "safari16.4"],
    rollupOptions: { output: { manualChunks } },
    chunkSizeWarningLimit: 1_000,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
