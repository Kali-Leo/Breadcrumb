/**
 * Purpose: what the reading pane shows for one external article (spec 053 §7), in the order the
 * spec's 断网重启 acceptance asks for: the text already kept for this card, then a live extraction
 * — which is kept, so the same article opens offline afterwards — and only then the plain line
 * and the browser. Until spec 053 T10 nothing was kept at all: an article read yesterday was
 * unreadable today with the network off, on a page whose whole promise is that it survives that.
 * Side effects: one HTTP GET on the first read, and a write of the extracted text to the card.
 * Main exports: readCardArticle, CardArticle.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { useDiscoveryStore } from "../stores/discoveryStore";
import { useSettingsStore } from "../stores/settingsStore";
import { extractArticleAt } from "./articleExtraction";
import { getRepos } from "./db";

export type CardArticle =
  /** Text to render. `fromCache` is true when it came off the card rather than off the network. */
  | { kind: "text"; markdown: string; fromCache: boolean }
  /** Nothing to show here: the reader gets the plain line and the way to the browser. */
  | { kind: "unreadable"; offline: boolean };

function keptText(card: DiscoveryCardRow): string | null {
  const kept = card.body_md?.trim() ?? "";
  return kept.length > 0 ? kept : null;
}

/**
 * Reads one card's article. The kept text wins over the network even when there is a network:
 * re-fetching a page the reader already read costs them bandwidth and can only produce the same
 * text or a worse one (a paywall that has since closed, a page that has since been rewritten).
 */
export async function readCardArticle(card: DiscoveryCardRow): Promise<CardArticle> {
  const kept = keptText(card);
  if (kept !== null) return { kind: "text", markdown: kept, fromCache: true };

  const networkEnabled = useSettingsStore.getState().networkEnabled;
  if (card.url === null || !networkEnabled) return { kind: "unreadable", offline: !networkEnabled };

  const extracted = await extractArticleAt(card.url);
  if (extracted.kind !== "extracted") return { kind: "unreadable", offline: false };

  // Keeping it is the whole point, but a failed write is not the reader's problem: they are
  // looking at the text either way, and the next open will simply extract it again.
  try {
    const repos = await getRepos();
    await repos.discovery.setCardBody(card.id, extracted.markdown);
    useDiscoveryStore.getState().noteCardBody(card.id, extracted.markdown);
  } catch {
    // Left deliberately silent (spec 053 总则).
  }
  return { kind: "text", markdown: extracted.markdown, fromCache: false };
}
