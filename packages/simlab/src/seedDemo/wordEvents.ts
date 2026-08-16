/**
 * Purpose: deterministic per-word signal-event plans for the demo seed (spec 035 T7b) and the
 * replay that turns a plan into real rows — the FSRS state is built exclusively via
 * memoryState's production functions, never hand-written JSON.
 * Main exports: introducedOffsetDays, planWordEvents, replayWord, WordSeedRow.
 */
import type {
  DiglotEventKind,
  DiglotWordEventRow,
  DiglotWordGuessRow,
  DiglotWordStateRow,
} from "@breadcrumb/core-db";
import {
  cardToJson,
  hashContext,
  newWordCard,
  ratingForSignal,
  reviewCard,
} from "@breadcrumb/plugin-diglot-weave";
import { DEMO_PAIR, demoId, safeIsoAt } from "./shared";

/** 50 words spread linearly over the ~10-week journey: word 0 introduced ~69 days ago, word
 * 49 introduced today. */
export function introducedOffsetDays(index: number, wordCount: number): number {
  return Math.round(69 * (1 - index / (wordCount - 1)));
}

export interface PlannedEvent {
  offsetDays: number;
  kind: DiglotEventKind;
  latencyMs?: number;
}

/** The "勤者多复习" shape: the first third of words (oldest introduced) get a diligent
 * ~5-event review history — comfortably enough spaced Good/Easy-rated reviews for FSRS
 * stability to cross the 30-day settle bar; the middle third gets a light 2-event history;
 * the last third is freshly met (1 exposure) except the very last word, introduced today,
 * which also gets a same-day guess so "today" carries real word activity. */
export function planWordEvents(index: number, wordCount: number, intro: number): PlannedEvent[] {
  if (index < wordCount * 0.4) {
    const deltas = [0, 9, 18, 27, 36];
    const kinds: DiglotEventKind[] = [
      "exposure",
      "guess_correct",
      "guess_correct",
      "guess_close",
      "guess_correct",
    ];
    return deltas
      .map((delta, rank) => (intro - delta >= 0 ? { rank, offset: intro - delta } : null))
      .filter((entry): entry is { rank: number; offset: number } => entry !== null)
      .map(({ rank, offset }) => {
        const kind =
          index % 5 === 0 && rank === 3 ? "guess_wrong" : (kinds[rank] ?? "guess_correct");
        return { offsetDays: offset, kind, latencyMs: guessLatency(kind, index) };
      });
  }
  if (index < wordCount * 0.8) {
    const deltas = [0, 14];
    return deltas
      .map((delta, rank) => (intro - delta >= 0 ? { rank, offset: intro - delta } : null))
      .filter((entry): entry is { rank: number; offset: number } => entry !== null)
      .map(({ rank, offset }) => {
        const kind: DiglotEventKind =
          rank === 0 ? "exposure" : index % 2 === 0 ? "guess_correct" : "guess_close";
        return { offsetDays: offset, kind, latencyMs: guessLatency(kind, index) };
      });
  }
  if (index < wordCount - 1) {
    return [{ offsetDays: intro, kind: "exposure" }];
  }
  // The single word introduced today: gives the demo landscape today's word microprogress.
  return [
    { offsetDays: 0, kind: "exposure" },
    { offsetDays: 0, kind: "guess_correct", latencyMs: 3200 },
  ];
}

function guessLatency(kind: DiglotEventKind, index: number): number | undefined {
  if (kind === "guess_correct") return 2200 + ((index * 131) % 2500);
  if (kind === "guess_close") return 5200 + ((index * 97) % 2000);
  if (kind === "guess_wrong") return 4800 + ((index * 53) % 2200);
  return undefined;
}

export interface WordSeedRow {
  state: DiglotWordStateRow;
  events: DiglotWordEventRow[];
  guesses: DiglotWordGuessRow[];
}

/** Replays one word's plan through the exact production signal->rating mapping
 * (`ratingForSignal`) and FSRS update (`reviewCard`) — the same pattern
 * plugin-feedback/wordSettledSeries.ts uses to rebuild history, so the resulting fsrs_json is
 * a faithful card, not an approximation. `guessOf` supplies the raw guess text/context for
 * guess_* events; `idSeed` makes every row's id unique across the whole 50-word corpus. */
export function replayWord(input: {
  lemma: string;
  now: Date;
  intro: number;
  plan: readonly PlannedEvent[];
  idSeed: number;
  guessOf: (kind: DiglotEventKind) => { guess: string; context: string };
}): WordSeedRow {
  const { lemma, now, intro, plan, idSeed, guessOf } = input;
  const introducedAt = safeIsoAt(now, intro, 10, (idSeed * 7) % 60, 30);
  let card = newWordCard(new Date(introducedAt));
  const priorKinds: DiglotEventKind[] = [];
  let reps = 0;
  let lastRatedAtIso: string | null = null;
  const events: DiglotWordEventRow[] = [];
  const guesses: DiglotWordGuessRow[] = [];

  plan.forEach((planned, index) => {
    // A later event in the plan must land closer to `now` — both branches of safeIsoAt
    // preserve that: earlier calendar days sort before later ones, and within "today" the
    // minutes-ago figure shrinks as `index` grows.
    const createdAt = safeIsoAt(
      now,
      planned.offsetDays,
      11,
      (idSeed * 11 + index * 3) % 60,
      Math.max(1, 25 - index * 10),
    );
    const rating = ratingForSignal(planned.kind, priorKinds, planned.latencyMs, reps);
    priorKinds.unshift(planned.kind);
    if (priorKinds.length > 8) priorKinds.pop();

    let contextHash: string | null = null;
    if (planned.kind.startsWith("guess")) {
      const { guess, context } = guessOf(planned.kind);
      contextHash = hashContext(context);
      guesses.push({
        id: demoId("guess", `${idSeed}-${index}`),
        lemma,
        pair: DEMO_PAIR,
        guess,
        grade:
          planned.kind === "guess_correct"
            ? "correct"
            : planned.kind === "guess_close"
              ? "close"
              : "wrong",
        context,
        latency_ms: planned.latencyMs ?? 4000,
        created_at: createdAt,
      });
    }
    events.push({
      id: demoId("event", `${idSeed}-${index}`),
      lemma,
      pair: DEMO_PAIR,
      kind: planned.kind,
      message_id: null,
      context_hash: contextHash,
      latency_ms: planned.latencyMs ?? null,
      created_at: createdAt,
    });
    if (rating !== null) {
      card = reviewCard(DEMO_PAIR, card, new Date(createdAt), rating);
      lastRatedAtIso = createdAt;
      reps += 1;
    }
  });

  return {
    state: {
      lemma,
      pair: DEMO_PAIR,
      fsrs_json: cardToJson(card),
      due: card.due.toISOString(),
      introduced_at: introducedAt,
      last_event_at: lastRatedAtIso,
    },
    events,
    guesses,
  };
}
