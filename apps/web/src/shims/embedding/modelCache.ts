/**
 * Purpose: where the downloaded model lives between visits — the browser's Cache API, keyed
 * so that the same file fetched from huggingface.co and from a mirror is one entry.
 *
 * transformers.js keys its own cache by the full download URL. Left alone, a session that
 * chose the mirror would not see the copy an earlier session downloaded from the origin, and
 * would fetch 113 MB again. This wrapper rewrites any known source host to the first one
 * before touching the cache, and leaves every other URL (the runtime's own wasm, served from
 * this origin) as it is.
 * Main exports: MODEL_CACHE_NAME, canonicalCacheKey, createModelCache.
 */

export const MODEL_CACHE_NAME = "breadcrumb-embedding-model";

/** The minimum of the Cache API that transformers.js's `env.customCache` needs. */
export interface ModelCache {
  match(request: string): Promise<Response | undefined>;
  put(request: string, response: Response): Promise<void>;
}

export function canonicalCacheKey(request: string, sources: readonly string[]): string {
  const canonical = sources[0];
  if (canonical === undefined) return request;
  for (const host of sources) {
    if (request.startsWith(host)) return `${canonical}${request.slice(host.length)}`;
  }
  return request;
}

/**
 * A failing cache is a slower app, not a broken one: a miss on read means a download, a
 * failed write means the next visit downloads again. Neither is allowed to fail the embedding
 * that is in progress, so both are swallowed here — the write with a console note, because
 * a persistently failing write (storage quota, usually) is worth a developer's attention.
 */
export function createModelCache(
  openCache: () => Promise<Pick<Cache, "match" | "put">>,
  sources: readonly string[],
): ModelCache {
  return {
    async match(request) {
      try {
        const cache = await openCache();
        return await cache.match(canonicalCacheKey(request, sources));
      } catch {
        return undefined;
      }
    },
    async put(request, response) {
      try {
        const cache = await openCache();
        await cache.put(canonicalCacheKey(request, sources), response);
      } catch (error) {
        console.warn(
          "embedding model could not be cached; it will download again next time",
          error,
        );
      }
    },
  };
}
