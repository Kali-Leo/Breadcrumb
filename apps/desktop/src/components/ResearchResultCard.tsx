/**
 * Purpose: one research result card (spec 036) — institution/purpose/ethics metadata, the
 * task's display template rendered against its stored stat results, and the two-step
 * "delete this result" action (physical delete, no edit path exists).
 * Main exports: ResearchResultCard.
 */
import type { ResearchResultRow } from "@breadcrumb/core-db";
import type { DisplayBlock } from "@breadcrumb/plugin-research";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCopyMessage } from "../i18n/useCopyMessage";
import { type ParsedStatResult, parseResearchResultDisplay } from "../lib/researchDisplay";
import { useResearchStore } from "../stores/researchStore";

/** Renders one display block against its (index-aligned) stat result. Unknown or
 * kind-mismatched combinations render nothing rather than guessing — the template only
 * ever supports text/number/bars, never markup or arbitrary HTML. */
function DisplayBlockView({
  block,
  results,
}: {
  block: DisplayBlock;
  results: ParsedStatResult[];
}) {
  const { t } = useTranslation(["settings", "common"]);
  const copy = useCopyMessage();
  if (block.kind === "text") {
    return <p className="text-stone-600">{block.text}</p>;
  }
  const result = results[block.callIndex];
  if (result === undefined) return null;

  // The statistic was not computed because the data does not support it. Saying so is the
  // whole point: the alternative — printing 0 — is a finding nobody arrived at.
  if (result.kind === "suppressed") {
    return (
      <p className="text-stone-700">
        {block.label}
        <span className="ms-2 text-stone-500">{t("research.notEnoughData")}</span>
      </p>
    );
  }

  if (block.kind === "stat" && result.kind === "number") {
    return (
      <p className="text-stone-700">
        {block.label}
        <span className="ms-2 font-semibold">{result.value}</span>
      </p>
    );
  }

  if (block.kind === "bars" && result.kind === "bars") {
    const maxValue = Math.max(1, ...result.bars.map((bar) => bar.value));
    return (
      <div>
        <p className="text-stone-700">{block.label}</p>
        <div className="mt-1 flex flex-col gap-1">
          {result.bars.map((bar) => (
            <div
              key={`${bar.label.key}-${JSON.stringify(bar.label.params ?? {})}`}
              className="flex items-center gap-2"
            >
              <span className="w-28 shrink-0 truncate text-stone-500">{copy(bar.label)}</span>
              <div className="h-2 flex-1 rounded bg-stone-100">
                <div
                  className="h-2 rounded bg-amber-400"
                  style={{ width: `${(bar.value / maxValue) * 100}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-end text-stone-500">{bar.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

export function ResearchResultCard({ result }: { result: ResearchResultRow }) {
  const { t } = useTranslation(["settings", "common"]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteResult = useResearchStore((state) => state.deleteResult);
  const parsed = parseResearchResultDisplay(result);

  return (
    <div className="rounded border border-stone-200 bg-white p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 text-stone-500">
        <span>
          {t("research.cardInstitutionLabel")}:{result.institution}
        </span>
        <span>
          {t("research.cardComputedAtLabel")}:{result.computed_at}
        </span>
      </div>
      <p className="mt-1 font-semibold text-stone-700">{result.title}</p>
      <p className="mt-1 text-stone-600">
        {t("research.cardPurposeLabel")}:{result.purpose}
      </p>
      {result.ethics_note !== null && (
        <p className="mt-1 text-stone-500">
          {t("research.cardEthicsLabel")}:{result.ethics_note}
        </p>
      )}
      {parsed !== null && (
        <div className="mt-2 flex flex-col gap-2">
          {parsed.display.map((block, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: display blocks have no stable id
            <DisplayBlockView key={index} block={block} results={parsed.results} />
          ))}
        </div>
      )}
      <div className="mt-3 border-t border-stone-100 pt-2">
        {confirmingDelete ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-stone-500">{t("research.deleteConfirmPrompt")}</span>
            <button
              type="button"
              onClick={() => void deleteResult(result.id)}
              className="rounded bg-red-500 px-2 py-1 text-white"
            >
              {t("research.deleteConfirmAction")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded border border-stone-200 px-2 py-1 text-stone-500"
            >
              {t("common:actions.cancel")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="text-stone-400 hover:text-red-500"
          >
            {t("research.deleteAction")}
          </button>
        )}
      </div>
    </div>
  );
}
