/**
 * Purpose: the JSON endpoints (V2EX, Algolia, Discourse topics, iTunes, oEmbed) all answer with a
 * body that may not be JSON at all — a Cloudflare interstitial, a captive-portal login page, or a
 * payload the size cap cut in half. This turns that into a value or a reason, never a throw.
 * Main exports: parseJsonPayload, JsonPayloadResult.
 */

export type JsonPayloadResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: string };

export function parseJsonPayload(body: string): JsonPayloadResult {
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
