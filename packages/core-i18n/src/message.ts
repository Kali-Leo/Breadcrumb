/**
 * Purpose: how a pure-logic package names a sentence it cannot write. Packages carry no
 * wording (spec 058 §2) — they decide *which* sentence applies and with what values, and
 * apps/desktop renders it through t(). Keeps the message catalogue the single place any
 * language is written down.
 * Main exports: CopyMessage.
 */
export interface CopyMessage {
  /** Catalogue key, namespace included: "learning:diglot.guessCorrect". */
  key: string;
  /** Interpolation values for that key's placeholders. */
  params?: Record<string, string | number>;
}
