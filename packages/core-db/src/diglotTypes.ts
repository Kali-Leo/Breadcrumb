/**
 * Purpose: row types for the diglot weave data layer (spec 033) — word FSRS states, the
 * append-only signal event log, verbatim guesses, and installed language packs.
 * Main exports: DiglotWordStateRow, DiglotWordEventRow, DiglotWordGuessRow,
 * DiglotLanguagePackRow, DiglotEventKind, DiglotGuessGrade, DiglotPairId.
 */
/** A language pair id, `${sourceLang}:${targetLang}` in BCP-47 (e.g. "zh:en") — the source
 * is the conversation language, the target is the language being learned (spec 033). */
export type DiglotPairId = string;

/** One FSRS memory state per (lemma, pair) — spec 033. `fsrs_json` is the serialized
 * ts-fsrs card; `due` duplicates the card's due date as a column for cheap due queries. */
export interface DiglotWordStateRow {
  lemma: string;
  pair: DiglotPairId;
  fsrs_json: string;
  due: string;
  introduced_at: string;
  last_event_at: string | null;
}

/** Every implicit-signal kind the render layer can emit for a woven word (spec 033).
 * Ordered roughly weakest→strongest: passive exposure, lookup, audio play, the four guess
 * outcomes, and productive use of the word in the user's own message. */
export type DiglotEventKind =
  | "exposure"
  | "hover"
  | "audio"
  | "guess_correct"
  | "guess_close"
  | "guess_wrong"
  | "guess_abandoned"
  | "productive_use";

/** One append-only signal event for a woven word (spec 033). `context_hash` identifies the
 * sentence the word appeared in (for the contextual-diversity factor); `latency_ms` is only
 * set for guess events (hover→submit time). */
export interface DiglotWordEventRow {
  id: string;
  lemma: string;
  pair: DiglotPairId;
  kind: DiglotEventKind;
  message_id: string | null;
  context_hash: string | null;
  latency_ms: number | null;
  created_at: string;
}

/** How a guess was graded against the dictionary: exact/synonym match, embedding-close,
 * or neither (spec 033). */
export type DiglotGuessGrade = "correct" | "close" | "wrong";

/** The raw text of one guess, kept verbatim for future confusion-pair mining (spec 033).
 * `context` is the full sentence shown with the guess card. */
export interface DiglotWordGuessRow {
  id: string;
  lemma: string;
  pair: DiglotPairId;
  guess: string;
  grade: DiglotGuessGrade;
  context: string;
  latency_ms: number;
  created_at: string;
}

/** One installed language pack (spec 033). `meta_json` holds capability flags (t1Safe, TTS
 * availability), entry counts and attribution strings; the pack payload lives on disk. */
export interface DiglotLanguagePackRow {
  id: DiglotPairId;
  source_lang: string;
  target_lang: string;
  version: string;
  meta_json: string;
  installed_at: string;
}
