/**
 * Purpose: the one string comparison the map is allowed to sort by. Pure, no dependencies.
 * Main exports: compareCodePoints.
 *
 * Why not `String.prototype.localeCompare` (bug hunt 2026-09-03). Called with no locale it uses
 * the HOST's default, and its collation table is the runtime's ICU build: two machines — a
 * WebKitGTK desktop and a Firefox browser edition, or the same app before and after an OS
 * update — can order the same two island names differently. The map's slot order is derived
 * straight from that sort, so 「同一棵知识树永远画出同一张地图」 would hold only per machine.
 *
 * Code-point order is the alternative that is defined by Unicode rather than by whatever ICU
 * data happens to be installed, so it is identical everywhere and forever. The cost is real and
 * accepted: it is not alphabetical for a human — accented Latin sorts after "z", CJK sorts by
 * code point rather than by pinyin or stroke. Every use here is a TIE-BREAK (equal engagement,
 * equal creation instant) or an id/ISO-timestamp comparison, i.e. a place where "some fixed
 * order" is the whole requirement and no reader is scanning for a name alphabetically. Anything
 * the learner actually reads as a sorted list must use core-i18n's collation, not this.
 */

/**
 * Lexicographic by Unicode code point: identical on every runtime, in every locale.
 *
 * Walked one code point at a time rather than left as `a < b`, which is UTF-16 code-UNIT order
 * and puts every astral character (a surrogate pair, U+D800..U+DFFF) BEFORE U+E000..U+FFFF —
 * still deterministic, but a needless surprise for a label carrying an emoji or a rare CJK
 * ideograph. Both strings advance by the same number of units while they agree, so one index
 * walks both.
 */
export function compareCodePoints(a: string, b: string): number {
  if (a === b) return 0;
  const shared = Math.min(a.length, b.length);
  let index = 0;
  while (index < shared) {
    const left = a.codePointAt(index) ?? 0;
    const right = b.codePointAt(index) ?? 0;
    if (left !== right) return left < right ? -1 : 1;
    index += left > 0xffff ? 2 : 1;
  }
  if (a.length === b.length) return 0;
  return a.length < b.length ? -1 : 1;
}
