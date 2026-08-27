/**
 * Purpose: the diglot weave's guess feedback as a catalogue key rather than a sentence
 * (spec 058 §2 — packages carry no wording). The grade decides which of three plain
 * statements applies; apps/desktop writes them in the reader's language.
 * Main exports: guessFeedbackMessage.
 */

import type { DiglotGuessGrade } from "@breadcrumb/core-db";
import type { CopyMessage } from "@breadcrumb/core-i18n";

export function guessFeedbackMessage(
  grade: DiglotGuessGrade,
  originalSurface: string,
): CopyMessage {
  const params = { word: originalSurface };
  switch (grade) {
    case "correct":
      return { key: "learning:diglot.guessCorrect", params };
    case "close":
      return { key: "learning:diglot.guessClose", params };
    case "wrong":
      return { key: "learning:diglot.guessWrong", params };
  }
}
