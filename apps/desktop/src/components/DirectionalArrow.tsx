/**
 * Purpose: a back/forward arrow that points the right way in both writing directions. The
 * glyph cannot live inside the message itself: "←" means "back" in a left-to-right layout
 * and "forward" in a right-to-left one (found with the pseudolocale, spec 058 §3).
 * Main exports: BackArrow, ForwardArrow.
 */

export function BackArrow() {
  return (
    <span aria-hidden className="inline-block rtl:rotate-180">
      ←
    </span>
  );
}

export function ForwardArrow() {
  return (
    <span aria-hidden className="inline-block rtl:rotate-180">
      →
    </span>
  );
}
