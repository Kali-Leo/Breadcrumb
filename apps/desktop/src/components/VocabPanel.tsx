/**
 * Purpose: the vocabulary page (spec 050 §6, own bottom-left icon) — the language-weave
 * settings, the learning-words list (word states joined with the pack's gloss, newest
 * first) and the word trend chart (memory + intuition layers and the settled line — words
 * have no claim data, so no understanding line) live together here, out of settings and
 * out of the palace rail.
 * Main exports: VocabPanel.
 */
import { DIGLOT_UI_COPY } from "@breadcrumb/plugin-diglot-weave";
import { FEEDBACK_COPY } from "@breadcrumb/plugin-feedback";
import { useEffect, useState } from "react";
import { getRepos } from "../lib/db";
import { useDiglotStore } from "../stores/diglotStore";
import { useFeedbackStore } from "../stores/feedbackStore";
import { DiglotSettingsSection } from "./DiglotSettingsSection";
import { TrendLineChart } from "./TrendLineChart";

interface LearningWordRow {
  /** The foreign word being learned (the pack entry's target). */
  target: string;
  /** Its meaning — the source-language lemma the pack translates. */
  lemma: string;
  reading: string;
}

/** The words currently being learned: diglot word states (newest introduced first) joined
 * with the language pack's entries for the foreign word and its gloss. */
function LearningWordsSection() {
  const enabled = useDiglotStore((state) => state.settings.enabled);
  const pairId = useDiglotStore((state) => state.settings.pairId);
  const loaded = useDiglotStore((state) => state.loaded);
  // Introductions bump this counter, so mid-session new words refresh the list live.
  const introducedToday = useDiglotStore((state) => state.newWordsIntroducedToday);
  const [rows, setRows] = useState<LearningWordRow[]>([]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: introducedToday is a pure refresh trigger — a mid-session introduction must refetch the list
  useEffect(() => {
    if (!enabled || loaded === null) {
      setRows([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const repos = await getRepos();
      const states = await repos.diglot.listStates(pairId);
      const next = [...states]
        .sort((a, b) => b.introduced_at.localeCompare(a.introduced_at))
        .flatMap((state) => {
          const entry = loaded.pack.entries[state.lemma];
          if (entry === undefined) return [];
          return [{ target: entry.target, lemma: state.lemma, reading: entry.reading }];
        });
      if (!cancelled) setRows(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, pairId, loaded, introducedToday]);

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h3 className="text-sm font-medium text-stone-700">{DIGLOT_UI_COPY.learningWordsTitle}</h3>
      {rows.length === 0 ? (
        <p className="mt-1 text-xs text-stone-400">{DIGLOT_UI_COPY.learningWordsEmpty}</p>
      ) : (
        <ul className="mt-2 max-h-80 space-y-1 overflow-y-auto text-sm">
          {rows.map((row) => (
            <li key={row.lemma} className="flex items-baseline gap-2">
              <span className="font-medium text-stone-700">{row.target}</span>
              {row.reading !== "" && <span className="text-xs text-stone-400">{row.reading}</span>}
              <span className="ml-auto text-stone-500">{row.lemma}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Word chart palette: memory/intuition mirror the concept layer chart's colors (same layer
// semantics, FeedbackTrendsSection); settled keeps its established brown. Words have no
// claim data, so no understanding line exists here by design.
const WORD_MEMORY_COLOR = "#d97706";
const WORD_INTUITION_COLOR = "#6d28d9";
const WORDS_SETTLED_COLOR = "#92400e";

function VocabTrendCard() {
  const trends = useFeedbackStore((state) => state.trends);
  const hasWordData =
    trends.wordsSettled.some((point) => point.value > 0) ||
    trends.wordLayers.some((point) => point.memory > 0);

  useEffect(() => {
    void useFeedbackStore.getState().loadAll();
  }, []);

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm text-xs">
      <h3 className="text-sm font-medium text-stone-700">{FEEDBACK_COPY.trendWordsTitle}</h3>
      {hasWordData ? (
        <div className="mt-2">
          <TrendLineChart
            valueDecimals={1}
            series={[
              {
                key: "wordMemory",
                label: FEEDBACK_COPY.trendLayersMemoryLabel,
                color: WORD_MEMORY_COLOR,
                data: trends.wordLayers.map((point) => ({
                  date: point.date,
                  value: point.memory,
                })),
                explanation: FEEDBACK_COPY.trendWordsMemoryNote,
              },
              {
                key: "wordIntuition",
                label: FEEDBACK_COPY.trendLayersIntuitionLabel,
                color: WORD_INTUITION_COLOR,
                data: trends.wordLayers.map((point) => ({
                  date: point.date,
                  value: point.intuition,
                })),
                explanation: FEEDBACK_COPY.trendWordsIntuitionNote,
              },
              {
                key: "wordsSettled",
                label: FEEDBACK_COPY.trendWordsSettledLabel,
                color: WORDS_SETTLED_COLOR,
                data: trends.wordsSettled,
                explanation: FEEDBACK_COPY.trendWordsSettledNote,
              },
            ]}
          />
        </div>
      ) : (
        <p className="mt-1 text-stone-400">{FEEDBACK_COPY.trendsEmpty}</p>
      )}
    </section>
  );
}

export function VocabPanel() {
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto bg-stone-50 p-6">
      <DiglotSettingsSection />
      <LearningWordsSection />
      <VocabTrendCard />
    </div>
  );
}
