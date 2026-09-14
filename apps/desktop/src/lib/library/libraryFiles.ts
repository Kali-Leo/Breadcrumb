/**
 * Purpose: getting the bytes of a file the reader chose, on either edition.
 *
 * The browser edition uses a file input, which is the only way a web page can read a local
 * file and also the only permission model a web page has: the reader picks, and the page sees
 * that file and nothing else.
 *
 * The desktop edition uses Tauri's dialog and filesystem plugins, whose grant is deliberately
 * narrower than "the app can read files". The capability allows exactly `open` and `readFile`,
 * scoped to Documents, Downloads and Desktop — no writing, no deleting, no listing a
 * directory, and not the home directory. That covers where a bought e-book or a course handout
 * actually sits while leaving the rest of the disk out of reach of this webview.
 *
 * Both paths return the same thing, so nothing above here knows which edition it is on.
 * Main exports: pickLibraryFile, PickedFile, LIBRARY_FILE_ACCEPT.
 */
import { isBrowserEdition } from "../platform/edition";

export interface PickedFile {
  fileName: string;
  bytes: Uint8Array;
}

/** What the file input offers. Mirrors LIBRARY_MEDIA_TYPES. */
export const LIBRARY_FILE_ACCEPT = ".pdf,.md,.markdown,.txt,.png,.jpg,.jpeg";

/** The extensions the desktop dialog filters on — the same list, without the dots. */
const DIALOG_EXTENSIONS = ["pdf", "md", "markdown", "txt", "png", "jpg", "jpeg"];

async function pickInBrowser(): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = LIBRARY_FILE_ACCEPT;
    // A cancelled picker fires no change event in most browsers, so the promise would hang
    // forever. `cancel` is the event that says so; where it is unsupported the input is simply
    // garbage collected with the promise, which costs nothing.
    input.addEventListener("cancel", () => resolve(null));
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file === undefined) {
        resolve(null);
        return;
      }
      void file
        .arrayBuffer()
        .then((buffer) => resolve({ fileName: file.name, bytes: new Uint8Array(buffer) }));
    });
    input.click();
  });
}

async function pickOnDesktop(): Promise<PickedFile | null> {
  const [{ open }, { readFile }] = await Promise.all([
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/plugin-fs"),
  ]);
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "document", extensions: DIALOG_EXTENSIONS }],
  });
  if (typeof selected !== "string") return null;
  const fileName = selected.split(/[\\/]/).pop() ?? selected;
  return { fileName, bytes: await readFile(selected) };
}

/** Null when the reader closed the picker without choosing — which is not an error and must
 * not be reported as one. */
export function pickLibraryFile(): Promise<PickedFile | null> {
  return isBrowserEdition() ? pickInBrowser() : pickOnDesktop();
}
