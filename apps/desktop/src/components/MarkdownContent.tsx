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
import type { Parent } from "mdast";
import type { ReactNode } from "react";
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

function renderMath(value: string, displayMode: boolean, key: string): ReactNode {
  const html = katex.renderToString(value, { displayMode, throwOnError: false });
  return (
    <span
      key={key}
      className={displayMode ? "block overflow-x-auto py-1" : undefined}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX output over model math
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
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
    case "link":
      return (
        <a
          key={key}
          href={node.url}
          target="_blank"
          rel="noreferrer"
          className="text-amber-700 underline"
        >
          {children()}
        </a>
      );
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
  const tree = parser.parse(source) as Parent;
  return (
    <div className="leading-relaxed">
      {(tree.children as AnyNode[]).map((child, index) =>
        renderNode(child, source, diglot ?? null, doors ?? null, `${child.type}-${index}`),
      )}
    </div>
  );
}
