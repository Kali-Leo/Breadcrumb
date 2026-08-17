/**
 * Purpose: the display-side facts a discovery card needs (spec 053 §6/§7) — which reader a card
 * opens into, what its source is called, and the one line that names source and author. Kept out
 * of the components so the dispatch is testable without a DOM.
 * Main exports: readerModeForCard, ReaderMode, sourceDisplayName, sourceAndAuthorLine.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { loadStarterChannelCatalog } from "@breadcrumb/plugin-channels";
import { videoEmbedForUrl } from "./discoveryVideoEmbeds";

/**
 * "generated" is the retired self-generated card (spec 051): no source, no address, the body is
 * written by the model on first open. Everything else is external content:
 * "video" only when the link is one of the two providers with an official embed player,
 * "podcast" for audio episodes, "article" for everything else — including a video link we cannot
 * embed, which is still readable as a page and always offers 在浏览器打开.
 */
export type ReaderMode = "generated" | "video" | "podcast" | "article";

export function readerModeForCard(card: DiscoveryCardRow): ReaderMode {
  if (card.source_id === null) return "generated";
  if (card.kind === "video" && videoEmbedForUrl(card.url) !== null) return "video";
  if (card.kind === "podcast") return "podcast";
  return "article";
}

/** Built once: the catalog is a static file that ships with the app. */
let catalogNamesById: Map<string, string> | null = null;

function namesById(): Map<string, string> {
  if (catalogNamesById === null) {
    catalogNamesById = new Map(
      loadStarterChannelCatalog().sources.map((source) => [source.id, source.displayName]),
    );
  }
  return catalogNamesById;
}

function hostLabel(rawUrl: string | null): string | null {
  if (rawUrl === null) return null;
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/**
 * The name the reader sees for where an item came from. Sources the reader added themselves are
 * not in the shipped catalog, so the site's own address stands in — that is what every feed
 * reader shows, and it is always true.
 */
export function sourceDisplayName(card: DiscoveryCardRow): string | null {
  if (card.source_id === null) return null;
  return namesById().get(card.source_id) ?? hostLabel(card.url);
}

/** "少数派 · 张三" — both parts optional, no labels, nothing when neither is known. */
export function sourceAndAuthorLine(card: DiscoveryCardRow): string | null {
  const parts = [sourceDisplayName(card), card.author].filter(
    (part): part is string => part !== null && part.trim().length > 0,
  );
  if (parts.length === 0) return null;
  // An author republished under their own name would otherwise read "张三 · 张三".
  const unique = parts.filter((part, index) => parts.indexOf(part) === index);
  return unique.join(" · ");
}
