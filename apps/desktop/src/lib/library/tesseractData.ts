/**
 * Purpose: getting tesseract's language data where tesseract will look for it — downloaded
 * once, digest-checked, unpacked, and put into the cache tesseract's own worker reads.
 *
 * The data is fetched by the app rather than by tesseract's worker so that it goes through
 * the desktop's HTTP plugin (the webview's own policy allows no outside host) and through the
 * digest check on both editions. Then it is handed over the only way that works: tesseract
 * reads its cache before it reads the network, and its cache is idb-keyval's default store
 * under `${cachePath}/${code}.traineddata` — a documented pair of options. (Passing the
 * bytes in directly is also documented, and broken in 7.0.0: the worker uses them as the
 * language's name.)
 * Main exports: TESSERACT_LANGUAGES, TesseractLanguage, TESSERACT_CACHE_PATH,
 * tesseractLanguageFor, ensureLanguageData.
 */
import { MODEL_PACKS_REPO, modelMirrorDirectory } from "@breadcrumb/core-vectors";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

export interface TesseractLanguage {
  /** tesseract's own code for the script's data file. */
  code: string;
  /** Of the gzip-compressed file as published. */
  bytes: number;
  sha256: string;
}

/** `tessdata_fast`, gzip-compressed, as published under the `tesseract-fast-v1` tag. */
export const TESSERACT_LANGUAGES: Readonly<Record<string, TesseractLanguage>> = {
  hi: {
    code: "hin",
    bytes: 922_758,
    sha256: "c3446b0988f4f5467e4140dd6eba4b25de9c8e597275a5e88b4290985e0cb045",
  },
  bn: {
    code: "ben",
    bytes: 550_607,
    sha256: "c5b5ed385d98356f8bfddc99498cdbe1dd47f5634d4d0a3e52946b0d31619402",
  },
  ar: {
    code: "ara",
    bytes: 725_639,
    sha256: "9cf78096a7d1d74826c5819263ac66b7311e4adc24c600da21123146eb5444cb",
  },
};

const DATA_DIR = "tesseract-fast";
const DATA_TAG = "tesseract-fast-v1";
/** jsDelivr first, raw GitHub second: the same two hosts, in the same order and for the
 * same reasons, as every other model this app fetches. */
export const DATA_BASES = [
  modelMirrorDirectory(DATA_DIR, DATA_TAG),
  `https://raw.githubusercontent.com/${MODEL_PACKS_REPO}/${DATA_TAG}/models/${DATA_DIR}/`,
];
/** tesseract's `cachePath`; the key it reads is `${cachePath}/${code}.traineddata`. */
export const TESSERACT_CACHE_PATH = "breadcrumb-ocr";
/** idb-keyval's defaults, which tesseract.js uses unchanged. */
const IDB_NAME = "keyval-store";
const IDB_STORE = "keyval";

/** The data for an interface language, or null when the main recognizer covers it. */
export function tesseractLanguageFor(uiLanguage: string): TesseractLanguage | null {
  const base = uiLanguage.split("-")[0]?.toLowerCase() ?? "";
  return TESSERACT_LANGUAGES[base] ?? null;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME);
    request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexedDB refused to open"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await openStore();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(IDB_STORE, mode).objectStore(IDB_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("indexedDB request failed"));
    });
  } finally {
    db.close();
  }
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function download(language: TesseractLanguage): Promise<Uint8Array> {
  const file = `${language.code}.traineddata.gz`;
  const refusals: string[] = [];
  for (const base of DATA_BASES) {
    try {
      const response = await tauriFetch(`${base}${file}`);
      if (!response.ok) throw new Error(`answered ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== language.bytes || (await sha256Hex(bytes)) !== language.sha256) {
        throw new Error("does not match its digest");
      }
      return bytes;
    } catch (error) {
      refusals.push(`${base}${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`the recognition data could not be downloaded — ${refusals.join("; ")}`);
}

/**
 * Makes sure the language's data is in tesseract's cache. Nothing is fetched when it already
 * is, and nothing is fetched behind a switched-off network switch.
 */
export async function ensureLanguageData(
  language: TesseractLanguage,
  allowDownload: boolean,
): Promise<void> {
  const key = `${TESSERACT_CACHE_PATH}/${language.code}.traineddata`;
  const cached = await withStore("readonly", (store) => store.get(key));
  if (cached !== undefined) return;
  if (!allowDownload) {
    throw new Error("the recognition data is not downloaded and the network switch is off");
  }
  const unpacked = await gunzip(await download(language));
  await withStore("readwrite", (store) => store.put(unpacked, key));
}
