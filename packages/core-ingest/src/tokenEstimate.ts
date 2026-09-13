/**
 * Purpose: how many tokens a piece of text is worth, without a tokenizer.
 *
 * Chunk sizes are stated in tokens because that is the unit the model's context is measured
 * in, but loading a tokenizer to cut a book into blocks would mean the import path depends on
 * the model being downloaded, and it does not — keyword search works within seconds of an
 * import, before any model file exists. So this is an estimate, and an estimate is enough:
 * being ten per cent out moves a chunk boundary, it does not break anything.
 *
 * The two rates are the two regimes every multilingual tokenizer actually has. CJK is close to
 * one token per character; alphabetic text averages about four characters per token. Counting
 * them separately is what keeps a Chinese chapter and an English one the same size in the
 * thing that matters, rather than the same size in characters and four times apart in tokens.
 * Main exports: estimateTokens.
 */

const CJK = /[㐀-䶿一-鿿豈-﫿぀-ヿ가-힯]/u;
/** Characters per token for everything that is not written one-character-per-word. */
const ALPHABETIC_CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  let dense = 0;
  let rest = 0;
  for (const character of text) {
    if (CJK.test(character)) dense += 1;
    else rest += 1;
  }
  return dense + Math.ceil(rest / ALPHABETIC_CHARS_PER_TOKEN);
}
