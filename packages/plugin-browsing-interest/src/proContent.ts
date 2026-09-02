/**
 * Purpose: small derivations the professional-content cards need — where an item links to,
 * which thumbnail url to ask for, how far it was watched, and how the items split across
 * the taxonomy's top-level groups.
 * Main exports: videoUrl, thumbnailUrl, watchedPercent, watchedMinutes, groupCounts.
 */
import type { ProContentItem } from "./schemas";

/** Bilibili ids carry their own prefix, so the id alone tells us where an item lives. */
export function videoUrl(site: string, id: string): string | null {
  if (!id) return null;
  if (id.startsWith("BV")) return `https://www.bilibili.com/video/${id}`;
  if (site === "youtube") return `https://www.youtube.com/watch?v=${id}`;
  return null;
}

/** True for bilibili's own CDN and nothing that merely ends in those letters — a host is a
 * suffix match on a label boundary, never a substring. */
function isBilibiliCdn(hostname: string): boolean {
  return hostname === "hdslb.com" || hostname.endsWith(".hdslb.com");
}

/** Bilibili covers accept a size suffix; other hosts must be requested as-is. The string
 * comes from the local service, which copies it off a page, and the caller hands it straight
 * to an <img src> — so anything that is not a parseable http(s) url gets no image at all
 * rather than an unexplained request. */
export function thumbnailUrl(pic: string): string | null {
  if (!pic) return null;
  let parsed: URL;
  try {
    parsed = new URL(pic);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const url = parsed.toString();
  return isBilibiliCdn(parsed.hostname) ? `${url}@256w_160h_1c` : url;
}

/** Null when the page never told us the total length — then there is no honest percentage. */
export function watchedPercent(item: ProContentItem): number | null {
  if (item.dur <= 0) return null;
  return Math.min(100, Math.round((item.dwell / item.dur) * 100));
}

export function watchedMinutes(item: ProContentItem): { watched: number; total: number } | null {
  if (item.dur <= 0) return null;
  return { watched: Math.round(item.dwell / 60), total: Math.round(item.dur / 60) };
}

export interface GroupCount {
  group: string;
  count: number;
}

/** Groups present in the given items, most-seen first — the filter row above the cards. */
export function groupCounts(items: ProContentItem[]): GroupCount[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item.group) continue;
    counts.set(item.group, (counts.get(item.group) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([group, count]) => ({ group, count }))
    .sort((left, right) => right.count - left.count || left.group.localeCompare(right.group));
}
