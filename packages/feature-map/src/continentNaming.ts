/**
 * Purpose: the headless half of spec 031 §3's continent naming — the cache key derived from
 * a cluster's member set, the prompt asking for plain domain names, the Zod schema the reply
 * must satisfy, and the plainness check every name must pass. No DB, no network, no UI: the
 * desktop app owns the call, the cache row and the metering.
 * Main exports: continentNameCacheKey, buildContinentNamingMessages, continentNamingSchema,
 * isPlainContinentName, ContinentNamingRequest.
 */
import { z } from "zod";
import { hashStringToSeed } from "./random";

/** Long enough to mean something, short enough to sit on an island. Counted in code points,
 * so CJK and latin are measured the same way. */
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 12;

export interface ContinentNamingRequest {
  /** Opaque per-call handle (e.g. "c0") — node ids never leave the machine in the prompt. */
  id: string;
  /** The cluster's member labels: the only evidence the model gets. */
  memberLabels: readonly string[];
}

export const continentNamingSchema = z.object({
  clusters: z
    .array(
      z.object({
        /** Echoed back from the request, so it is as long as the handles we sent — bounded
         * because the caller turns it into a Map key. */
        id: z.string().max(64),
        name: z.string().refine(isPlainContinentName, {
          message: `name must be ${MIN_NAME_LENGTH}-${MAX_NAME_LENGTH} code points with no digits`,
        }),
      }),
    )
    .max(200),
});

/** Stable across runs and machines: the member set alone decides the key, so a cluster that
 * gains or loses a member is a different cluster and is named again rather than mislabeled. */
export function continentNameCacheKey(memberNodeIds: readonly string[]): string {
  const sorted = [...memberNodeIds].sort();
  return `${sorted.length}-${hashStringToSeed(sorted.join(",")).toString(36)}`;
}

/** A name the map can wear: plain, short, no digits. Rank words are asked against in the
 * prompt; length and digits are what can be checked mechanically. Folded into
 * continentNamingSchema via .refine() so an unusable name can never parse through — kept
 * exported since callers may still want to re-check a name from another source. */
export function isPlainContinentName(name: string): boolean {
  const trimmed = name.trim();
  const length = [...trimmed].length;
  if (length < MIN_NAME_LENGTH || length > MAX_NAME_LENGTH) return false;
  return !/[0-9０-９]/.test(trimmed);
}

/** One batched request: every unnamed cluster on its own line, one JSON object back. */
export function buildContinentNamingMessages(
  requests: readonly ContinentNamingRequest[],
): { role: "user"; content: string }[] {
  const lines = requests.map((request) => `${request.id}: ${request.memberLabels.join("、")}`);
  const content = [
    "下面每一行是一堆彼此相关的知识点，行首是这堆的编号。",
    "为每一堆起一个概括它们的领域名。",
    `要求：平实陈述的领域名，${MIN_NAME_LENGTH}~${MAX_NAME_LENGTH} 个字；`,
    "不夸赞、不评价、不含数字，不用「大师」「王者」「精通」这类等级词。",
    '只输出 JSON：{"clusters":[{"id":"c0","name":"..."}]}',
    "",
    ...lines,
  ].join("\n");
  return [{ role: "user", content }];
}
