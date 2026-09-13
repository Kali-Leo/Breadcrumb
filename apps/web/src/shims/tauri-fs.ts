/**
 * Purpose: stands in for @tauri-apps/plugin-fs in the browser build. See tauri-dialog.ts —
 * same reason, same never-called branch. A browser page reads the bytes of a file the reader
 * chose, and nothing else on the disk; there is no filesystem here to stand in for.
 * Main exports: readFile.
 */

export function readFile(): Promise<Uint8Array> {
  return Promise.reject(new Error("the filesystem is not available in the browser edition"));
}
