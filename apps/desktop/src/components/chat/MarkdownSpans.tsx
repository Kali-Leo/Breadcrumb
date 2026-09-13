/**
 * Purpose: text-span rendering for MarkdownContent's mdast "text" leaves (diglot
 * weave + explore doors + grounding marks) — merges diglot/door patches into runs and
 * dispatches each run to its span component. Split out of MarkdownContent.tsx to stay under
 * the file-size cap.
 *
 * Grounding marks deliberately do NOT join the patch merge. They replace nothing: each is a
 * dot dropped at one offset, where a sentence ends. So they are applied inside the plain runs
 * only — a mark that would land inside a woven or door span is skipped rather than fought
 * over, which costs one dot and keeps the two replacement features exactly as they were.
 * Main exports: DiglotContext, DoorContext, MarkContext, AnyNode, offsetsOf, renderTextNode.
 */
import type { ReplacementPatch } from "@breadcrumb/feature-diglot-weave";
import type { DoorCandidate } from "@breadcrumb/feature-explore";
import type { GroundedSentence } from "@breadcrumb/feature-factcheck";
import type { Node } from "mdast";
import type { ReactNode } from "react";
import { mergeTextRuns } from "../../lib/chat/messagePatchMerge";
import { DiglotText } from "../diglot/DiglotText";
import { FocusDoorText } from "../focus/FocusDoorText";
import { GroundingMark } from "./GroundingMark";

export interface DiglotContext {
  messageId: string;
  patches: ReplacementPatch[];
}

export interface DoorContext {
  patches: DoorCandidate[];
  /** A door word click-to-select handler — an ordinary reply opens a focus session directly,
   * the focus overlay's own doors select a new station. nodeId is null for a
   * term-marked word with no matching knowledge node. */
  onSelect: (word: string, nodeId: string | null) => void;
}

export interface MarkContext {
  /** Labelled sentences of this message, each anchored at its own `end` offset. */
  sentences: readonly GroundedSentence[];
}

export interface AnyNode extends Node {
  value?: string;
  children?: AnyNode[];
  depth?: number;
  ordered?: boolean;
  url?: string;
  lang?: string;
}

export function offsetsOf(node: Node): { start: number; end: number } {
  return {
    start: node.position?.start.offset ?? 0,
    end: node.position?.end.offset ?? 0,
  };
}

/** Renders one merged run: plain text, a diglot-woven cluster, or a door cluster. The
 * diglot/door branches are only ever reached when their context is non-null, because
 * mergeTextRuns only produces that run kind from a non-empty in-range patch list. */
function renderRun(
  run: ReturnType<typeof mergeTextRuns>[number],
  source: string,
  diglot: DiglotContext | null,
  doors: DoorContext | null,
  marks: MarkContext | null,
): ReactNode {
  if (run.kind === "plain") {
    return <span key={`plain-${run.start}`}>{renderPlain(source, run.start, run.end, marks)}</span>;
  }
  if (run.kind === "diglot" && diglot !== null) {
    return (
      <DiglotText
        key={`diglot-${run.start}`}
        messageId={diglot.messageId}
        content={source}
        patches={run.patches}
        rangeStart={run.start}
        rangeEnd={run.end}
      />
    );
  }
  if (run.kind === "door" && doors !== null) {
    return (
      <FocusDoorText
        key={`door-${run.start}`}
        content={source}
        patches={run.patches}
        rangeStart={run.start}
        rangeEnd={run.end}
        onSelect={doors.onSelect}
      />
    );
  }
  return null;
}

/** One plain stretch of source, cut open wherever a labelled sentence ends so its dot can sit
 * there. No marks (the ordinary case) returns the slice untouched. */
function renderPlain(
  source: string,
  start: number,
  end: number,
  marks: MarkContext | null,
): ReactNode {
  const inside =
    marks === null
      ? []
      : marks.sentences.filter((sentence) => sentence.end > start && sentence.end <= end);
  if (inside.length === 0) return source.slice(start, end);
  const pieces: ReactNode[] = [];
  let cursor = start;
  for (const sentence of inside) {
    pieces.push(source.slice(cursor, sentence.end));
    pieces.push(<GroundingMark key={`mark-${sentence.order}`} sentence={sentence} />);
    cursor = sentence.end;
  }
  pieces.push(source.slice(cursor, end));
  return pieces;
}

/** Renders one mdast "text" node, weaving in any diglot/door patches that fall inside its
 * [start, end) range and dropping in any grounding marks anchored there. */
export function renderTextNode(
  node: AnyNode,
  source: string,
  diglot: DiglotContext | null,
  doors: DoorContext | null,
  marks: MarkContext | null,
  key: string,
): ReactNode {
  const { start, end } = offsetsOf(node);
  const inRange = (start2: number, end2: number) => start2 >= start && end2 <= end;
  const diglotInRange =
    diglot === null ? [] : diglot.patches.filter((p) => inRange(p.start, p.end));
  const doorInRange = doors === null ? [] : doors.patches.filter((p) => inRange(p.start, p.end));
  const markInRange =
    marks === null
      ? null
      : {
          sentences: marks.sentences.filter(
            (sentence) => sentence.end > start && sentence.end <= end,
          ),
        };
  if (diglotInRange.length === 0 && doorInRange.length === 0) {
    return <span key={key}>{renderPlain(source, start, end, markInRange)}</span>;
  }
  const runs = mergeTextRuns(start, end, diglotInRange, doorInRange);
  return (
    <span key={key}>{runs.map((run) => renderRun(run, source, diglot, doors, markInRange))}</span>
  );
}
