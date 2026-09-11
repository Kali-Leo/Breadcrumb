/**
 * Purpose: one Wikidata statement → one sentence the judge can be asked to copy. Rendering is
 * done here, by code, because the anchor gate needs a sentence the model can copy verbatim
 * and SPARQL returns JSON — so a sentence is template plus authoritative value, and the model
 * contributes no word of it. The value text is language-neutral by construction (a number,
 * a unit label, an ISO date, an item label); the sentence around it comes from the host's
 * catalogue in the learner's language, with a neutral fallback here.
 * Main exports: valueText, renderFact, FactRenderer, FactParts, neutralFactRenderer.
 */
import type { StatementValue, WikidataStatement } from "./wikidataQuery";

/** ISO-ish date at the statement's own precision: 11 = day, 10 = month, 9 or coarser = year.
 * Wikidata time literals carry a sign and a zero-padded year; a minus sign is kept. */
function formatTime(time: string, precision: number): string {
  const match = /^([+-]?\d+)-(\d\d)-(\d\d)/.exec(time);
  if (match === null) return time;
  const [, year = "", month = "", day = ""] = match;
  const signedYear = year.replace(/^\+/, "");
  if (precision >= 11) return `${signedYear}-${month}-${day}`;
  if (precision === 10) return `${signedYear}-${month}`;
  return signedYear;
}

/** The value as text, unit and reading date included; language-neutral by construction. */
export function valueText(value: StatementValue, pointInTime: string | null): string {
  let text: string;
  switch (value.kind) {
    case "quantity":
      text = value.unit === null ? value.amount : `${value.amount} ${value.unit}`;
      break;
    case "time":
      text = formatTime(value.time, value.precision);
      break;
    case "item":
      text = value.label;
      break;
  }
  return pointInTime === null ? text : `${text} (${formatTime(pointInTime, 11)})`;
}

/** The pieces one sentence is built from — every word of them comes from Wikidata, in the
 * learner's language where a label exists. */
export interface FactParts {
  subject: string;
  property: string;
  value: string;
  /** The statement's own cited source URL, when it has one. */
  reference: string | null;
}

/** Turns the parts into one sentence. The app supplies one from its message catalogue so the
 * learner is asked to copy a sentence in their own language; the default is the
 * language-neutral fallback (labels, a dash, a colon) for hosts that supply nothing. */
export type FactRenderer = (parts: FactParts) => string;

export const neutralFactRenderer: FactRenderer = (parts) =>
  `${parts.subject} — ${parts.property}: ${parts.value}` +
  (parts.reference === null ? "" : ` <${parts.reference}>`);

export function renderFact(
  subject: string,
  propertyLabel: string,
  statement: WikidataStatement,
  reference: string | null,
  render: FactRenderer,
): string {
  return render({
    subject,
    property: propertyLabel,
    value: valueText(statement.value, statement.pointInTime),
    reference,
  });
}
