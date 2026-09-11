/**
 * Purpose: the shapes and the arithmetic of the retrieval-layer measurement — what one
 * layer's outcome on one item looks like, the per-layer summary, and the per-language /
 * per-claim-type slices. Two hit columns throughout: `hit` is the gold anchor found verbatim
 * (the anchor gate's own reduction), `valueHit` is every number in the anchor found — the
 * only hit the structured layer can score, whose sentences are rendered, not quoted.
 * Main exports: EVIDENCE_LAYERS, EvidenceLayer, LayerOutcome, ItemOutcome, LayerSummary,
 * EvidenceHitRateResult, summarise, sliceTable.
 */

export const EVIDENCE_LAYERS = ["wikidata", "wikipedia", "zhipu"] as const;
export type EvidenceLayer = (typeof EVIDENCE_LAYERS)[number];

/** One layer's outcome on one item. */
export interface LayerOutcome {
  /** True when the layer's search did not complete for any of the item's queries. */
  failed: boolean;
  items: number;
  /** A returned passage contains the gold anchor verbatim (whitespace-insensitive). */
  hit: boolean;
  /** A returned passage carries every number in the anchor (thousands separators ignored) —
   * the only kind of hit the structured layer can score, since its sentence is rendered as
   * «subject — property: value» and never contains a Wikipedia sentence. Equal to `hit` for
   * an anchor without a number. */
  valueHit: boolean;
  ms: number;
}

export interface ItemOutcome {
  id: string;
  lang: string;
  claimType: string;
  label: string;
  anchor: string;
  queries: string[];
  layers: Partial<Record<EvidenceLayer, LayerOutcome>>;
  /** Some layer found the anchor verbatim. */
  anyHit: boolean;
  /** Some layer found the anchor's numbers (or the anchor itself, when it has none). */
  anyValueHit: boolean;
}

export interface LayerSummary {
  attempted: number;
  hits: number;
  valueHits: number;
  failed: number;
  hitRate: number;
  valueHitRate: number;
  medianMs: number;
}

export interface EvidenceHitRateResult {
  queries: "llm" | "claim";
  anchoredItems: number;
  layers: Record<EvidenceLayer, LayerSummary | "skipped">;
  anyLayerHitRate: number;
  anyLayerValueHitRate: number;
  byLanguage: Record<string, Record<EvidenceLayer, string>>;
  byClaimType: Record<string, Record<EvidenceLayer, string>>;
  items: ItemOutcome[];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** One layer over a set of items — "skipped" when it never ran (no key, gated language). */
export function summarise(
  items: readonly ItemOutcome[],
  layer: EvidenceLayer,
): LayerSummary | "skipped" {
  const outcomes = items
    .map((item) => item.layers[layer])
    .filter((o): o is LayerOutcome => o !== undefined);
  if (outcomes.length === 0) return "skipped";
  const hits = outcomes.filter((o) => o.hit).length;
  const valueHits = outcomes.filter((o) => o.valueHit).length;
  return {
    attempted: outcomes.length,
    hits,
    valueHits,
    failed: outcomes.filter((o) => o.failed).length,
    hitRate: hits / outcomes.length,
    valueHitRate: valueHits / outcomes.length,
    medianMs: median(outcomes.map((o) => o.ms)),
  };
}

/** "hits(valueHits)/attempted" per layer within one slice of the items. */
export function sliceTable(items: readonly ItemOutcome[], by: (item: ItemOutcome) => string) {
  const table: Record<string, Record<EvidenceLayer, string>> = {};
  for (const key of new Set(items.map(by))) {
    const slice = items.filter((item) => by(item) === key);
    table[key] = Object.fromEntries(
      EVIDENCE_LAYERS.map((layer) => {
        const summary = summarise(slice, layer);
        return [
          layer,
          summary === "skipped"
            ? "-"
            : `${summary.hits}(${summary.valueHits})/${summary.attempted}`,
        ];
      }),
    ) as Record<EvidenceLayer, string>;
  }
  return table;
}
