/**
 * Purpose: renders a ```mermaid code fence as a diagram (spec 034 顺带) — mermaid.js
 * lazy-loaded on first use; render is debounced until the source is stable so a growing
 * unclosed fence shows the plain code block instead of flickering; any parse/render
 * failure falls back to the plain code block.
 * Main exports: MermaidBlock.
 */
import { useEffect, useRef, useState } from "react";

let mermaidReady: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  mermaidReady ??= import("mermaid").then((module) => {
    module.default.initialize({ startOnLoad: false, theme: "neutral" });
    return module.default;
  });
  return mermaidReady;
}

let renderCounter = 0;

/** How long the source must go unchanged before a render is attempted — long enough that a
 * streaming reply's per-delta growth never triggers one, short enough to feel instant once
 * the fence stops changing (ChatGPT-style: defer until the block is settled). */
const STABLE_SOURCE_DEBOUNCE_MS = 300;

export function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [stableCode, setStableCode] = useState<string | null>(null);
  renderCounter += 1;
  const idRef = useRef(`mermaid-${renderCounter}`);

  // Debounce: only adopt `code` as the render target once it has stopped changing for
  // STABLE_SOURCE_DEBOUNCE_MS. A still-streaming fence keeps re-arming the timer and never
  // reaches this render at all, so the plain code block shows the whole time instead of
  // flickering between it and a diagram on every delta.
  useEffect(() => {
    const timer = setTimeout(() => setStableCode(code), STABLE_SOURCE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [code]);

  useEffect(() => {
    if (stableCode === null) return;
    let cancelled = false;
    void (async () => {
      try {
        const mermaid = await loadMermaid();
        const { svg: rendered } = await mermaid.render(idRef.current, stableCode);
        if (!cancelled) setSvg(rendered);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stableCode]);

  if (failed || svg === null) {
    return (
      <pre className="my-1.5 overflow-x-auto rounded-lg bg-stone-100 p-3">
        <code className="font-mono text-[13px]">{code}</code>
      </pre>
    );
  }
  return (
    <div
      className="my-1.5 overflow-x-auto"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid SVG over model diagram code
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
