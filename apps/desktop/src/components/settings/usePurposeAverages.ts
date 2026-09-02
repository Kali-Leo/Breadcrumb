/**
 * Purpose: loads the account's own average token usage per purpose for the model in use, so
 * the spending page can price its per-use estimates from what calls have actually cost this
 * learner. Read once when the page opens and again only when the model changes — never on
 * every render.
 * Main exports: usePurposeAverages.
 */
import { useEffect, useState } from "react";
import type { PurposeAverages } from "../../lib/billing/billingEstimates";
import { getRepos } from "../../lib/platform/db";

/** Shared empty map, so a model with no history re-renders nothing. */
const NO_AVERAGES: PurposeAverages = new Map();

export function usePurposeAverages(model: string): PurposeAverages {
  const [averages, setAverages] = useState<PurposeAverages>(NO_AVERAGES);
  useEffect(() => {
    let cancelled = false;
    setAverages(NO_AVERAGES);
    void (async () => {
      try {
        const repos = await getRepos();
        const rows = await repos.llmCalls.averageUsageByPurpose(model);
        if (!cancelled) setAverages(new Map(rows.map((row) => [row.purpose, row])));
      } catch {
        // The estimates fall back to the catalogue on their own; a page that cannot read
        // the ledger still shows every switch and every number it can stand behind.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [model]);
  return averages;
}
