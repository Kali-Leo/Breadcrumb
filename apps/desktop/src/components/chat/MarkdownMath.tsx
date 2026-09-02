/**
 * Purpose: KaTeX typesetting for chat markdown. KaTeX is the most expensive thing the
 * markdown walk does, and a formula's HTML depends only on (value, displayMode) — both
 * primitives, so a re-render of the surrounding message reuses the previous output instead
 * of re-running renderToString (design audit 2026-08-28, 数据层与性能 #3). A memoized
 * component rather than a useMemo because renderNode is a plain recursive function, not a
 * hook context.
 * Main exports: renderMath.
 */
import katex from "katex";
import "katex/dist/katex.min.css";
import { memo, type ReactNode, useMemo } from "react";

const MathSpan = memo(function MathSpan(props: { value: string; displayMode: boolean }) {
  const { value, displayMode } = props;
  const html = useMemo(
    () =>
      katex.renderToString(value, {
        displayMode,
        throwOnError: false,
        // trust defaults to false, which is what refuses \href and \htmlData in model math.
        // maxSize does not: without it a single \rule{9999em}{9999em} from the model is a
        // layout bomb. maxExpand's default of 1000 already bounds macro expansion.
        maxSize: 20,
      }),
    [value, displayMode],
  );
  return (
    <span
      className={displayMode ? "block overflow-x-auto py-1" : undefined}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX output over model math
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

export function renderMath(value: string, displayMode: boolean, key: string): ReactNode {
  return <MathSpan key={key} value={value} displayMode={displayMode} />;
}
