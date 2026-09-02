/**
 * Purpose: the synthetic corpus behind the diglot journey simulator — a language pack plus a
 * chat stream whose word frequencies are only loosely correlated with the pack's introduction
 * order. That mismatch is the real zh:en situation (the bundled pack's t1Safe entries have a
 * median frequency rank around 18800 in the subtitle list its queue is built from), and it is
 * what lets review debt pile up on words the conversation never brings back — the effect a
 * closed 200-word corpus where every word recurs constantly cannot show.
 * Main exports: makeSyntheticPack, makeChatCorpus, SIM_PACK_WORDS.
 */
import { type LoadedLanguagePack, loadLanguagePack } from "@breadcrumb/feature-diglot-weave";
import { mulberry32 } from "../util/prng";

/** Pack size: the bundled zh:en pack offers 4888 weavable lemmas. */
export const SIM_PACK_WORDS = 4000;

/** How far a word's chat frequency may sit from its introduction rank, as a share of the
 * whole pack. 1 = the two orders are broadly related but any individual word can be
 * anywhere — the pack is built from subtitle frequencies, the chat is LLM tutoring prose. */
const RANK_MISMATCH = 1;

/** A synthetic pack: `word0001…wordN` → `t-word0001…`, all t1Safe, rank = index. */
export function makeSyntheticPack(wordCount: number): LoadedLanguagePack {
  const entries: Record<string, unknown> = {};
  for (let index = 0; index < wordCount; index += 1) {
    entries[wordName(index)] = {
      target: `t-${wordName(index)}`,
      pos: "n",
      reading: "",
      altTargets: [],
      freqRank: index + 1,
      t1Safe: true,
    };
  }
  return loadLanguagePack({
    schemaVersion: 1,
    id: "en:fr",
    sourceLang: "en",
    targetLang: "fr",
    version: "sim",
    attribution: ["synthetic"],
    capabilities: { t1Safe: true, rtl: false, ruby: false },
    forms: {},
    entries,
  });
}

export interface ChatCorpus {
  /** One assistant reply of `length` word tokens, Zipf-shaped over the chat's own frequency
   * order: frequent words recur, rare ones trail off — like real conversation. */
  message(random: () => number, length: number): string;
}

/** Builds the chat stream for one seeded run. */
export function makeChatCorpus(input: { seed: number; wordCount: number }): ChatCorpus {
  const byChatFrequency = chatFrequencyOrder(input.seed, input.wordCount);
  return {
    message(random, length) {
      const words: string[] = [];
      for (let position = 0; position < length; position += 1) {
        const zipf = Math.min(Math.floor(input.wordCount ** random()), input.wordCount - 1);
        words.push(wordName(byChatFrequency[zipf] ?? 0));
        if (position % 8 === 7) words.push(",");
      }
      return `${words.join(" ")}.`;
    },
  };
}

/** Pack indexes ordered by how often this learner's chat uses them: the introduction rank
 * plus a large deterministic offset, so the two orders correlate loosely rather than
 * perfectly. */
function chatFrequencyOrder(seed: number, wordCount: number): number[] {
  const random = mulberry32(seed ^ 0x5f356495);
  return [...Array(wordCount).keys()]
    .map((index) => ({ index, key: index + random() * wordCount * RANK_MISMATCH }))
    .sort((a, b) => a.key - b.key)
    .map((entry) => entry.index);
}

function wordName(index: number): string {
  return `word${String(index + 1).padStart(4, "0")}`;
}
