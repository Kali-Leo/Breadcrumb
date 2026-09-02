/**
 * Purpose: the URL-verification and pruning half of the search-build pipeline (spec 023 §5),
 * split out of compareBuildActions.ts to keep that file under the file-size ceiling — fetches
 * every unique cited source once, gives dead direct links one search rescue, and prunes the
 * branches whose sources never checked out (宁缺毋假). Knows nothing about the LLM call or
 * about where the surviving items get persisted.
 * Main exports: verifyCitedSources, CitationVerdict, VerifiedCitations.
 */
import {
  findRescueUrl,
  pruneUnverifiedBranches,
  type SearchedProposalItem,
  verifyEvidenceText,
} from "@breadcrumb/feature-compare";
import { createBingProvider, fetchExternalPage } from "@breadcrumb/feature-factcheck";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

/** How long to wait for a cited page. Every other fetch in the app bounds itself; this one
 * used to wait forever, which is a stall the user sits through. */
const CITATION_FETCH_TIMEOUT_MS = 8000;

/** Fetches one cited URL and checks the page mentions the cited material's title tokens.
 * Any network error counts as unverified — the branch dies, the build never throws here.
 *
 * The URL comes out of the model's own JSON, and this fetch runs in Rust where the browser's
 * private-network protections do not apply. Without a guard, a model could name
 * `http://127.0.0.1:...` and read back, one substring at a time, whether a chosen string
 * appears in a local service's response — the verdict is reported either way. fetchExternalPage
 * refuses loopback and private addresses, bounds the body, and bounds the wait. */
async function verifyUrl(url: string, sourceTitles: readonly string[]): Promise<boolean> {
  const text = await fetchExternalPage(tauriFetch, url, CITATION_FETCH_TIMEOUT_MS);
  if (text === null) return false;
  return sourceTitles.some((title) => verifyEvidenceText(text, title));
}

/** One cited URL's outcome: whether the branch survives, and the reachable URL that rescued
 * it (null when the original verified directly, or when nothing rescued it). */
export interface CitationVerdict {
  url: string;
  ok: boolean;
  rescueUrl: string | null;
}

export interface VerifiedCitations {
  /** The proposal items whose whole ancestry verified, each citing the URL we reached. */
  surviving: readonly SearchedProposalItem[];
  /** Every unique cited URL's verdict, in the order the citations were collected — the
   * caller reports the failed ones when the build falls under the threshold. */
  verdicts: readonly CitationVerdict[];
}

/**
 * Verify each unique cited URL once; an item may share a source with its siblings.
 * Dead direct links get one search rescue: the model cites deep links from memory and
 * those rot (all three 2026-08-10 failures were a single hallucinated/rotted URL taking
 * the whole build to 0/N). A search hit proving the cited material exists revives the
 * branch and swaps in the reachable URL; no hit still kills it (宁缺毋假).
 */
export async function verifyCitedSources(
  items: readonly SearchedProposalItem[],
): Promise<VerifiedCitations> {
  const titlesByUrl = new Map<string, string[]>();
  for (const item of items) {
    const titles = titlesByUrl.get(item.sourceUrl) ?? [];
    titles.push(item.sourceTitle);
    titlesByUrl.set(item.sourceUrl, titles);
  }
  const bing = createBingProvider({ fetchImpl: tauriFetch });
  const verdicts = await Promise.all(
    [...titlesByUrl.entries()].map(async ([url, titles]) => {
      if (await verifyUrl(url, titles)) return { url, ok: true, rescueUrl: null };
      // A failed search yields no items, and no rescue — same outcome as no hit, so the
      // branch dies either way (宁缺毋假); only the items are of interest here.
      const { items: results } = await bing.search(titles[0] ?? "", 3);
      const rescueUrl = findRescueUrl(results, titles);
      return { url, ok: rescueUrl !== null, rescueUrl };
    }),
  );
  const verifiedUrls = new Set(verdicts.filter((verdict) => verdict.ok).map((v) => v.url));
  const rescuedUrlByOriginal = new Map(
    verdicts
      .filter((verdict) => verdict.rescueUrl !== null)
      .map((verdict) => [verdict.url, verdict.rescueUrl as string]),
  );

  const surviving = pruneUnverifiedBranches(items, verifiedUrls).map((item) => ({
    ...item,
    // The rescued URL is the one we actually verified as reachable — cite that.
    sourceUrl: rescuedUrlByOriginal.get(item.sourceUrl) ?? item.sourceUrl,
  }));
  return { surviving, verdicts };
}
