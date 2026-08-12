/**
 * Purpose: chat markdown renderer — a small mdast→React walk (remark-parse + remark-gfm +
 * remark-math, KaTeX for formulas) that keeps source offsets, so diglot patches can be
 * woven into exactly the text nodes they belong to (math/code are never woven).
 * Main exports: MarkdownContent.
 */
import type { ReplacementPatch } from "@breadcrumb/plugin-diglot-weave";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { Node, Parent } from "mdast";
import type { ReactNode } from "react";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { DiglotText } from "./DiglotText";

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

interface DiglotContext {
  messageId: string;
  patches: ReplacementPatch[];
}

interface AnyNode extends Node {
  value?: string;
  children?: AnyNode[];
  depth?: number;
  ordered?: boolean;
  url?: string;
  lang?: string;
}

function offsetsOf(node: Node): { start: number; end: number } {
  return {
    start: node.position?.start.offset ?? 0,
    end: node.position?.end.offset ?? 0,
  };
}

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

function renderText(node: AnyNode, source: string, diglot: DiglotContext | null, key: string) {
  const { start, end } = offsetsOf(node);
  const inRange =
    diglot === null
      ? []
      : diglot.patches.filter((patch) => patch.start >= start && patch.end <= end);
  if (diglot === null || inRange.length === 0) {
    return <span key={key}>{node.value ?? ""}</span>;
  }
  return (
    <DiglotText
      key={key}
      messageId={diglot.messageId}
      content={source}
      patches={inRange}
      rangeStart={start}
      rangeEnd={end}
    />
  );
}

function renderChildren(node: AnyNode, source: string, diglot: DiglotContext | null): ReactNode[] {
  return (node.children ?? []).map((child, index) =>
    renderNode(child, source, diglot, `${child.type}-${index}-${offsetsOf(child).start}`),
  );
}

function renderNode(
  node: AnyNode,
  source: string,
  diglot: DiglotContext | null,
  key: string,
): ReactNode {
  const children = () => renderChildren(node, source, diglot);
  switch (node.type) {
    case "text":
      return renderText(node, source, diglot, key);
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
        <code key={key} className="rounded bg-stone-100 px-1 font-mono text-[13px]">
          {node.value}
        </code>
      );
    case "code":
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
        <ol key={key} className="my-1 list-decimal space-y-0.5 pl-5">
          {children()}
        </ol>
      ) : (
        <ul key={key} className="my-1 list-disc space-y-0.5 pl-5">
          {children()}
        </ul>
      );
    case "listItem":
      return <li key={key}>{children()}</li>;
    case "blockquote":
      return (
        <blockquote key={key} className="my-1 border-stone-200 border-l-2 pl-3 text-stone-600">
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
 * normalizeMathDelimiters); diglot patch offsets must reference the same string. */
export function MarkdownContent({ source, diglot }: { source: string; diglot?: DiglotContext }) {
  const tree = parser.parse(source) as Parent;
  return (
    <div className="leading-relaxed">
      {(tree.children as AnyNode[]).map((child, index) =>
        renderNode(child, source, diglot ?? null, `${child.type}-${index}`),
      )}
    </div>
  );
}
