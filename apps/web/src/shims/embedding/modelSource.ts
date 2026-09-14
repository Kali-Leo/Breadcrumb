/**
 * Purpose: which host the model is downloaded from. The app is used from places where a lot of
 * the internet is unreachable, so reachability is measured at run time rather than assumed:
 * each candidate is asked for one small file with a short timeout, in order of preference, and
 * the first that answers is used for the session.
 *
 * A round in which nothing answered is remembered for a minute rather than for the session,
 * so a laptop that was briefly offline is not stuck until the page is reloaded, while the
 * embedding calls the app makes in the background do not each pay two timeouts.
 * Main exports: MODEL_ID, MODEL_DIR, MODEL_SOURCES, modelSources, preferredModelBase,
 * configuredModelBase, remotePaths, isModelSourceUrl, probeSource, createSourceResolver.
 */
import {
  EMBEDDING_MODEL_DIR,
  EMBEDDING_MODEL_TAG,
  MODEL_PACKS_REPO,
  modelMirrorDirectory,
} from "@breadcrumb/core-vectors";

/**
 * Our own repository, not a third party's conversion. The readily available int8 export of
 * this model agrees with full precision only to a cosine of 0.918 and costs 0.045 of Chinese
 * nDCG@10; the repository it sits in also declares no licence, while the weights it was made
 * from are Apache-2.0. So the files are exported and quantized by us and published here.
 */
export const MODEL_ID = MODEL_PACKS_REPO;
export const MODEL_DIR = EMBEDDING_MODEL_DIR;

/** Every download is pinned to the tag the files were published under rather than to a branch:
 * a moving ref would let a later upload land in a browser holding half of the earlier one. */
const REPO_PATH = `models/${MODEL_DIR}/`;

/**
 * jsDelivr first — the same mirror the desktop falls back to, built from the same constants.
 * The desktop's first choice is GitHub release assets, which this edition cannot touch at all — a release download redirects to a host that answers without
 * CORS headers, so the fetch fails before a byte arrives. What is left is the repository tree,
 * and of the ways to read it jsDelivr is the one that is both reachable from the mainland and
 * unmetered. Its limit is 20 MB per file, which is why the graph is published in pieces
 * (splitGraph.ts).
 *
 * raw.githubusercontent.com serves the identical bytes with the same CORS header and is the
 * fallback for a network that blocks the CDN; it is second because it is slow from the places
 * that most need this to work.
 */
export const JSDELIVR_BASE = modelMirrorDirectory(MODEL_DIR, EMBEDDING_MODEL_TAG);
export const RAW_GITHUB_BASE = `https://raw.githubusercontent.com/${MODEL_ID}/${EMBEDDING_MODEL_TAG}/${REPO_PATH}`;
export const MODEL_SOURCES: readonly string[] = [JSDELIVR_BASE, RAW_GITHUB_BASE];

export const PROBE_TIMEOUT_MS = 3_000;
export const RETRY_FAILED_ROUND_AFTER_MS = 60_000;

/** A local or staging host, for working on this without the published files. Set
 * VITE_MODEL_BASE_URL to a directory that ends in a slash; when it is set it is the only
 * source, because a fallback to a host that does not have the files is just a slow failure. */
export function configuredModelBase(): string | null {
  const configured = import.meta.env.VITE_MODEL_BASE_URL;
  return typeof configured === "string" && configured !== "" ? configured : null;
}

/** The candidates this build will actually try, in order of preference. */
export function modelSources(): readonly string[] {
  const configured = configuredModelBase();
  return configured === null ? MODEL_SOURCES : [configured];
}

/** The base a cache entry is filed under, and what the library is pointed at before a host has
 * been chosen — so a model downloaded from the fallback is still found on the next visit. */
export function preferredModelBase(): string {
  return configuredModelBase() ?? JSDELIVR_BASE;
}

/** The embedding model's smallest file: a host that does not answer within the timeout with
 * it is not going to manage 311 MB. Other models name their own (SourceResolverDeps.probeFile). */
export const DEFAULT_PROBE_FILE = "config.json";

export function probeUrl(base: string, probeFile: string = DEFAULT_PROBE_FILE): string {
  return `${base}${probeFile}`;
}

export function isModelSourceUrl(
  url: string,
  sources: readonly string[] = modelSources(),
): boolean {
  return sources.some((base) => url.startsWith(base));
}

/**
 * A directory URL split the way transformers.js wants it: the library joins `env.remoteHost`,
 * then `env.remotePathTemplate`, then the file name, stripping one slash between each. Handing
 * it the origin and the path separately is the split that survives that stripping — an empty
 * template would leave a doubled slash, and the candidate hosts have paths of different shapes,
 * so the template cannot be one constant the way it was when everything came from one hub.
 */
export function remotePaths(base: string): { host: string; template: string } {
  const url = new URL(base);
  const path = url.pathname.replace(/^\/+/, "");
  // `.` rather than the empty string for a base that is a bare origin: URL parsing removes it,
  // where an empty segment would leave a `//` for the server to interpret.
  return { host: `${url.origin}/`, template: path === "" ? "./" : path };
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** True when the host answered the HEAD probe with a success status inside the timeout.
 * Anything else — a timeout, a network error, a 4xx/5xx — is "not this one". */
export async function probeSource(
  base: string,
  fetchFn: FetchLike,
  timeoutMs: number = PROBE_TIMEOUT_MS,
  probeFile: string = DEFAULT_PROBE_FILE,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(probeUrl(base, probeFile), {
      method: "HEAD",
      signal: controller.signal,
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export interface SourceResolver {
  /** The chosen base with its trailing slash, or null when no candidate answered. */
  resolve(): Promise<string | null>;
}

export interface SourceResolverDeps {
  fetch: FetchLike;
  now?: () => number;
  sources?: readonly string[];
  timeoutMs?: number;
  /** The file the probe asks each source for; the model's smallest. */
  probeFile?: string;
}

export function createSourceResolver(deps: SourceResolverDeps): SourceResolver {
  const now = deps.now ?? (() => Date.now());
  const sources = deps.sources ?? modelSources();
  let chosen: string | null = null;
  let failedRoundAt: number | null = null;
  let inFlight: Promise<string | null> | null = null;

  async function probeAll(): Promise<string | null> {
    for (const base of sources) {
      if (await probeSource(base, deps.fetch, deps.timeoutMs, deps.probeFile)) return base;
    }
    return null;
  }

  return {
    async resolve() {
      if (chosen !== null) return chosen;
      if (failedRoundAt !== null && now() - failedRoundAt < RETRY_FAILED_ROUND_AFTER_MS) {
        return null;
      }
      inFlight ??= probeAll().then((base) => {
        inFlight = null;
        if (base === null) failedRoundAt = now();
        else chosen = base;
        return base;
      });
      return inFlight;
    },
  };
}
