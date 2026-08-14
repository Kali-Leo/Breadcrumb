/**
 * Purpose: text-span rendering for MarkdownContent's mdast "text" leaves (spec 039 diglot
 * weave + explore doors) — merges diglot/door patches into runs and dispatches each run to its
 * span component. Split out of MarkdownContent.tsx to stay under the file-size cap.
 * Main exports: DiglotContext, DoorContext, AnyNode, offsetsOf, renderTextNode.
 */
import type { ReplacementPatch } from "@breadcrumb/plugin-diglot-weave";
import type { DoorCandidate } from "@breadcrumb/plugin-explore";
import type { Node } from "mdast";
import type { ReactNode } from "react";
import { mergeTextRuns } from "../lib/messagePatchMerge";
import { ConceptDoorText } from "./ConceptDoorText";
import { DiglotText } from "./DiglotText";
import { FocusDoorText } from "./FocusDoorText";

export interface DiglotContext {
  messageId: string;
  patches: ReplacementPatch[];
}

export interface DoorContext {
  messageId: string;
  patches: DoorCandidate[];
  /** When set, a door word calls this directly instead of opening ConceptDoorCard's
   * hover/click popover — the focus overlay's click-to-select behavior (spec 042 §3). */
  onSelect?: (word: string) => void;
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
): ReactNode {
  if (run.kind === "plain") {
    return <span key={`plain-${run.start}`}>{source.slice(run.start, run.end)}</span>;
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
    return doors.onSelect ? (
      <FocusDoorText
        key={`door-${run.start}`}
        content={source}
        patches={run.patches}
        rangeStart={run.start}
        rangeEnd={run.end}
        onSelect={doors.onSelect}
      />
    ) : (
      <ConceptDoorText
        key={`door-${run.start}`}
        messageId={doors.messageId}
        content={source}
        patches={run.patches}
        rangeStart={run.start}
        rangeEnd={run.end}
      />
    );
  }
  return null;
}

/** Renders one mdast "text" node, weaving in any diglot/door patches that fall inside its
 * [start, end) range. */
export function renderTextNode(
  node: AnyNode,
  source: string,
  diglot: DiglotContext | null,
  doors: DoorContext | null,
  key: string,
): ReactNode {
  const { start, end } = offsetsOf(node);
  const inRange = (start2: number, end2: number) => start2 >= start && end2 <= end;
  const diglotInRange =
    diglot === null ? [] : diglot.patches.filter((p) => inRange(p.start, p.end));
  const doorInRange = doors === null ? [] : doors.patches.filter((p) => inRange(p.start, p.end));
  if (diglotInRange.length === 0 && doorInRange.length === 0) {
    return <span key={key}>{node.value ?? ""}</span>;
  }
  const runs = mergeTextRuns(start, end, diglotInRange, doorInRange);
  return <span key={key}>{runs.map((run) => renderRun(run, source, diglot, doors))}</span>;
}
