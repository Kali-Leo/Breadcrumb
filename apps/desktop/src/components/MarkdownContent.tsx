/**
 * Purpose: chat markdown renderer — a small mdast→React walk (remark-parse + remark-gfm +
 * remark-math, KaTeX for formulas) that keeps source offsets, so diglot patches and explore
 * doors (spec 039) can both be woven into exactly the text nodes they belong to (math/code
 * are never touched); overlapping spans give the diglot weave priority. Span/patch merging
 * itself lives in MarkdownSpans.tsx.
 * Main exports: MarkdownContent.
 */
import katex from "katex";
import "katex/dist/katex.min.css";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Parent } from "mdast";
import { memo, type ReactNode, useMemo } from "react";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import {
  type AnyNode,
  type DiglotContext,
  type DoorContext,
  offsetsOf,
  renderTextNode,
} from "./MarkdownSpans";
import { MermaidBlock } from "./MermaidBlock";

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

/** KaTeX typesetting is the most expensive thing this walk does, and a formula's HTML depends
 * only on (value, displayMode) — both primitives, so a re-render of the surrounding message
 * reuses the previous output instead of re-running renderToString (design audit 2026-08-28,
 * 数据层与性能 #3). A memoized component rather than a useMemo because renderNode is a plain
 * recursive function, not a hook context. */
/** Schemes a link in model output may carry. Anything else renders as inert text rather than
 * a clickable target. */
const SAFE_LINK_SCHEMES = new Set(["http:", "https:", "mailto:"]);

function isSafeHref(url: string | undefined): url is string {
  if (url === undefined) return false;
  try {
    return SAFE_LINK_SCHEMES.has(new URL(url, "https://example.invalid").protocol);
  } catch {
    return false;
  }
}

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

function renderMath(value: string, displayMode: boolean, key: string): ReactNode {
  return <MathSpan key={key} value={value} displayMode={displayMode} />;
}

function renderChildren(
  node: AnyNode,
  source: string,
  diglot: DiglotContext | null,
  doors: DoorContext | null,
): ReactNode[] {
  return (node.children ?? []).map((child, index) =>
    renderNode(child, source, diglot, doors, `${child.type}-${index}-${offsetsOf(child).start}`),
  );
}

function renderNode(
  node: AnyNode,
  source: string,
  diglot: DiglotContext | null,
  doors: DoorContext | null,
  key: string,
): ReactNode {
  const children = () => renderChildren(node, source, diglot, doors);
  switch (node.type) {
    case "text":
      return renderTextNode(node, source, diglot, doors, key);
    case "paragraph":
      return (
        <p key={key} className="my-1 first:mt-0 last:mb-0">
          {children()}
        </p>
      );
    case "strong":
      return <strong key={key}>{children()}</strong>;
    case "emphasis":
      return <em key={key}>{children()}</em>;
    case "delete":
      return <del key={key}>{children()}</del>;
    case "inlineCode":
      return (
        <code key={key} className="font-mono text-[13px]">
          {node.value}
        </code>
      );
    case "code":
      if (node.lang === "mermaid") {
        return <MermaidBlock key={key} code={node.value ?? ""} />;
      }
      return (
        <pre key={key} className="my-1.5 overflow-x-auto rounded-lg bg-stone-100 p-3">
          <code className="font-mono text-[13px]">{node.value}</code>
        </pre>
      );
    case "math":
      return renderMath(node.value ?? "", true, key);
    case "inlineMath":
      return renderMath(node.value ?? "", false, key);
    case "heading": {
      const depth = Math.min(Math.max(node.depth ?? 3, 1), 6);
      const Tag = `h${depth}` as "h3";
      return (
        <Tag key={key} className="mt-2 mb-1 font-semibold">
          {children()}
        </Tag>
      );
    }
    case "list":
      return node.ordered === true ? (
        <ol key={key} className="my-1 list-decimal space-y-0.5 ps-5">
          {children()}
        </ol>
      ) : (
        <ul key={key} className="my-1 list-disc space-y-0.5 ps-5">
          {children()}
        </ul>
      );
    case "listItem":
      return <li key={key}>{children()}</li>;
    case "blockquote":
      return (
        <blockquote key={key} className="my-1 border-stone-200 border-s-2 ps-3 text-stone-600">
          {children()}
        </blockquote>
      );
    case "link": {
      // The webview must never navigate to an address the model chose: this window has no
      // address bar, so a page loaded in it is indistinguishable from the app itself. Hand it
      // to the system browser, as every other outbound link does (FactcheckBadge) — https
      // only, which is the whole of the opener capability's allow list, so an http:// or
      // mailto: link looks the same and quietly does nothing. The scheme check stays: React
      // refuses javascript: URLs, but one framework behaviour is a thin only-check.
      const url = node.url;
      return isSafeHref(url) ? (
        <button
          key={key}
          type="button"
          onClick={() => {
            if (url.startsWith("https://")) void openUrl(url);
          }}
          className="inline text-start text-amber-700 underline"
        >
          {children()}
        </button>
      ) : (
        // An <a> with no href was not clickable either; the text keeps exactly its old look.
        <span key={key} className="text-amber-700 underline">
          {children()}
        </span>
      );
    }
    case "break":
      return <br key={key} />;
    case "thematicBreak":
      return <hr key={key} className="my-2 border-stone-200" />;
    case "table":
      return (
        <div key={key} className="my-1.5 overflow-x-auto">
          <table className="border-collapse text-sm">
            <tbody>{children()}</tbody>
          </table>
        </div>
      );
    case "tableRow":
      return <tr key={key}>{children()}</tr>;
    case "tableCell":
      return (
        <td key={key} className="border border-stone-200 px-2 py-1">
          {children()}
        </td>
      );
    default:
      // Unknown node: render its children (or raw value) rather than dropping content.
      return node.children !== undefined ? (
        <span key={key}>{children()}</span>
      ) : (
        <span key={key}>{node.value ?? ""}</span>
      );
  }
}

/** Renders one chat message body. `source` must be the normalized display source (see
 * normalizeMathDelimiters); diglot patch and door offsets must reference the same string. */
export function MarkdownContent({
  source,
  diglot,
  doors,
}: {
  source: string;
  diglot?: DiglotContext;
  doors?: DoorContext;
}) {
  // remark re-parses the whole message on every render otherwise, and a streaming reply
  // re-renders its window once per token (design audit 2026-08-28, 数据层与性能 #3).
  const tree = useMemo(() => parser.parse(source) as Parent, [source]);
  return (
    <div className="leading-relaxed">
      {(tree.children as AnyNode[]).map((child, index) =>
        renderNode(child, source, diglot ?? null, doors ?? null, `${child.type}-${index}`),
      )}
    </div>
  );
}
