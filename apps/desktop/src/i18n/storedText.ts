/**
 * Purpose: the channel for catalogue sentences that get *written down* rather than only
 * drawn — a conversation title that is later matched exactly, a seeded opener that becomes a
 * database row and part of every prompt built from that conversation. t() wraps interpolated
 * values in bidirectional isolates (see index.ts), and those invisible characters change what
 * a title compares equal to and travel into the model's context. Text that leaves the screen
 * goes through here first.
 *
 * Display is unaffected: these particular strings are shown whole — their own message bubble,
 * their own list row — so their direction comes from the element's `dir` and there is nothing
 * beside them to reorder. Isolates earn their keep inside a sentence being drawn, not around
 * a paragraph that is the whole line.
 * Main exports: stripBidiIsolates, asStoredText.
 */

/** U+2066 LRI, U+2067 RLI, U+2068 FSI, U+2069 PDI — the whole isolate family, so this keeps
 * working if the interpolation ever switches to a directional isolate. */
const BIDI_ISOLATES = /[⁦-⁩]/gu;

export function stripBidiIsolates(text: string): string {
  return text.replace(BIDI_ISOLATES, "");
}

/**
 * Wrap the t() call whose result is about to be stored or compared:
 * `asStoredText(i18next.t("palace:frontier.opener", { label }))`. Written this way rather
 * than as a t() replacement so the key stays type-checked against the catalogue.
 */
export function asStoredText(text: string): string {
  return stripBidiIsolates(text);
}
