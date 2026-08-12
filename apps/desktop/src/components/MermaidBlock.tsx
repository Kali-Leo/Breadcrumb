/**
 * Purpose: renders a ```mermaid code fence as a diagram (spec 034 顺带) — mermaid.js
 * lazy-loaded on first use; any parse/render failure falls back to the plain code block.
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

export function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  renderCounter += 1;
  const idRef = useRef(`mermaid-${renderCounter}`);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const mermaid = await loadMermaid();
        const { svg: rendered } = await mermaid.render(idRef.current, code);
        if (!cancelled) setSvg(rendered);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

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
