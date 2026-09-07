/**
 * Purpose: the demo seed's 50-word vocabulary — real zh:en dictionary entries
 * from the bundled language pack, replayed through real FSRS to produce word states, the
 * signal-event log, and verbatim guesses.
 * Main exports: WORD_COUNT, buildWordSeed.
 */
import type {
  DiglotEventKind,
  DiglotLanguagePackRow,
  DiglotWordEventRow,
  DiglotWordGuessRow,
  DiglotWordStateRow,
} from "@breadcrumb/core-db";
import { loadLanguagePack } from "@breadcrumb/feature-diglot-weave";
import { DEMO_PAIR, isoAt } from "./shared";
import type { DemoText } from "./text/demoText";
import { introducedOffsetDays, planWordEvents, replayWord } from "./wordEvents";

export const WORD_COUNT = 50;

const WRONG_GUESS_POOL = ["something", "thing", "stuff", "idea", "maybe"] as const;

export interface WordSeedResult {
  pack: DiglotLanguagePackRow;
  states: DiglotWordStateRow[];
  events: DiglotWordEventRow[];
  guesses: DiglotWordGuessRow[];
}

/** Takes the bundled zh:en pack's 50 most frequent T1-safe entries and builds each word's
 * full history under the DEMO_PAIR namespace, so it can never collide with the user's real
 * "zh:en" progress.
 *
 * The pack arrives as an argument rather than being read off disk: this runs inside the app
 * (and in a browser) as well as in the dev CLI, and only one of those has a filesystem. It is
 * still Zod-validated here through loadLanguagePack, exactly as the app validates its own. */
export function buildWordSeed(now: Date, rawPack: unknown, text: DemoText): WordSeedResult {
  const loaded = loadLanguagePack(rawPack);
  const lemmas = loaded.introductionQueue.slice(0, WORD_COUNT);

  const states: DiglotWordStateRow[] = [];
  const events: DiglotWordEventRow[] = [];
  const guesses: DiglotWordGuessRow[] = [];

  lemmas.forEach((lemma, index) => {
    const entry = loaded.pack.entries[lemma];
    const intro = introducedOffsetDays(index, lemmas.length);
    const plan = planWordEvents(index, lemmas.length, intro);
    // "{word}" is the only placeholder these sentences have; everything around it, quotation
    // marks included, is the sentence as that language writes it.
    const pattern = text.wordContexts[index % text.wordContexts.length] ?? "{word}";
    const wrongGuess = WRONG_GUESS_POOL[index % WRONG_GUESS_POOL.length] ?? "something";
    const guessOf = (kind: DiglotEventKind): { guess: string; context: string } => {
      const context = pattern.replace("{word}", lemma);
      if (kind === "guess_correct") return { guess: entry?.target ?? lemma, context };
      if (kind === "guess_close") {
        const alt = entry?.altTargets[0];
        const target = entry?.target ?? lemma;
        return { guess: alt ?? target.slice(0, Math.max(1, target.length - 1)), context };
      }
      return { guess: wrongGuess, context };
    };
    const seeded = replayWord({ lemma, now, intro, plan, idSeed: index, guessOf });
    states.push(seeded.state);
    events.push(...seeded.events);
    guesses.push(...seeded.guesses);
  });

  const pack: DiglotLanguagePackRow = {
    id: DEMO_PAIR,
    source_lang: loaded.pack.sourceLang,
    target_lang: loaded.pack.targetLang,
    version: loaded.pack.version,
    meta_json: JSON.stringify(loaded.pack.capabilities),
    installed_at: isoAt(now, 70, 8, 0),
  };

  return { pack, states, events, guesses };
}
