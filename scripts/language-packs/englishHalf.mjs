/**
 * Purpose: English's half of the interlingua. Every other language is reduced to "word → the
 * English glosses it carries"; English cannot be, because its bridge key is the word itself —
 * glossing `dog` as "a domesticated canine" would leave nothing for a Spanish `perro` to match.
 *
 * So the word list comes from the frequency list and the pronunciation from CMUdict, but the
 * grammar comes from the English Wiktionary extract, and it has to: without it `going` and
 * `divorced` are ordinary high-frequency English words, and the packs put `going → ida` and
 * `divorced → señora` in front of learners.
 * Main exports: buildEnglishHalf.
 */
import { arpabetToIpa } from "./entry-builder.mjs";
import { collectInflections } from "./inflections.mjs";
import { streamKaikkiEntries } from "./kaikki.mjs";

const ENGLISH_LEMMA = /^[a-z][a-z'-]*$/;

/**
 * @param extractPath English Kaikki extract — read only for part of speech and inflection.
 * @param ranks word → 1-based frequency rank.
 * @param cutoff how far down the frequency list to go.
 * @param cmuMap word → ARPABET phonemes.
 */
export async function buildEnglishHalf({ extractPath, ranks, cutoff, cmuMap }) {
  const wanted = new Set();
  for (const [word, rank] of ranks) {
    if (rank <= cutoff && ENGLISH_LEMMA.test(word)) wanted.add(word);
  }

  const posByWord = new Map();
  const sets = { inflected: new Set(), gendered: new Set() };
  const formsOf = Object.create(null); // upstream text as keys
  for await (const raw of streamKaikkiEntries(extractPath)) {
    const word = typeof raw.word === "string" ? raw.word.trim() : "";
    if (word === "" || word.includes(" ")) continue;
    collectInflections(raw, word, sets, formsOf);
    if (!wanted.has(word) || posByWord.has(word)) continue;
    if (typeof raw.pos === "string") posByWord.set(word, raw.pos);
  }

  const words = Object.create(null); // upstream text as keys; see interlingua.mjs
  for (const word of wanted) {
    const phonemes = cmuMap.get(word);
    words[word] = {
      p: posByWord.get(word) ?? "",
      k: [word],
      i: phonemes ? `/${arpabetToIpa(phonemes)}/` : "",
      r: ranks.get(word),
      x: sets.inflected.has(word) ? 1 : 0,
      g: sets.gendered.has(word) ? 1 : 0,
    };
  }
  const forms = Object.create(null);
  for (const surface of Object.keys(formsOf)) {
    if (words[surface] === undefined) forms[surface] = formsOf[surface];
  }
  const inflectedCount = [...wanted].filter((word) => sets.inflected.has(word)).length;
  return { words, forms, inflectedCount };
}
