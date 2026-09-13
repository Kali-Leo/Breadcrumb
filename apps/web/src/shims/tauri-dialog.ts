/**
 * Purpose: stands in for @tauri-apps/plugin-dialog in the browser build.
 *
 * The browser edition never calls it: `pickLibraryFile` asks which edition it is on and uses a
 * file input here, which is both the only way a web page can read a local file and the only
 * permission model it has — the reader picks, and the page sees that one file. The alias
 * exists because a bundler follows a dynamic import whether or not the branch is taken, and
 * the real plugin drags Tauri's own runtime into a build that has no Tauri underneath it.
 * Main exports: open.
 */

export function open(): Promise<string | null> {
  return Promise.reject(new Error("the file dialog is not available in the browser edition"));
}
