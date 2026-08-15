/**
 * Purpose: the third level's two-stage node card (spec 049) — concept summary, plain state
 * statement, the recommendation reason when this is the "下一步", the relation list
 * (clickable jumps), alternates on demand, and one state-worded main action. Opening a
 * conversation is deliberately never a single click on the map.
 * Main exports: KingdomNodeCard, reasonLine.
 */
import type { FrontierCandidate } from "@breadcrumb/plugin-planner";
import type { KingdomViewNode } from "../../../lib/kingdomView";

export interface NodeRelations {
  parent: { id: string; label: string } | null;
  children: { id: string; label: string }[];
  /** Sources of requires-edges pointing at this node — its prerequisites. */
  prerequisites: { id: string; label: string }[];
  /** Sources of helps-edges pointing at this node — what aids it. */
  helpers: { id: string; label: string }[];
}

interface KingdomNodeCardProps {
  node: KingdomViewNode;
  isPrimary: boolean;
  candidate: FrontierCandidate | null;
  alternates: readonly FrontierCandidate[];
  lastSeenDate: string | null;
  relations: NodeRelations;
  opening: boolean;
  hasChildren: boolean;
  collapsed: boolean;
  onJump(nodeId: string): void;
  onMainAction(): void;
  onToggleCollapse(): void;
}

/** One plain, suggest-only sentence for why this node is the current invitation. */
export function reasonLine(candidate: FrontierCandidate): string {
  if (candidate.reason.litPrerequisiteLabels.length > 0) {
    return `它的前置 ${candidate.reason.litPrerequisiteLabels.join("、")} 已完成。`;
  }
  if (candidate.reason.wasLitBefore) return "以前学过,有阵子没见了。";
  if (candidate.reason.gatewayTo) return `通往你感兴趣的「${candidate.reason.gatewayTo.label}」。`;
  return "可以从这里进入这片区域。";
}

function stateStatement(node: KingdomViewNode, lastSeenDate: string | null): string {
  if (node.state === "done")
    return lastSeenDate === null ? "已完成。" : `已完成 · 上次接触 ${lastSeenDate}。`;
  if (node.state === "visited")
    return lastSeenDate === null ? "走过。" : `走过 · 上次接触 ${lastSeenDate}。`;
  return "尚未开始。";
}

const MAIN_ACTION_LABEL = { untouched: "开始学习", visited: "继续", done: "换你来讲讲" } as const;

function RelationRow({
  title,
  items,
  onJump,
}: {
  title: string;
  items: { id: string; label: string }[];
  onJump(nodeId: string): void;
}) {
  if (items.length === 0) return null;
  return (
    <p className="text-stone-500">
      {title}:
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onJump(item.id)}
          className="ml-1 rounded bg-stone-100 px-1 py-0.5 text-stone-600 hover:bg-stone-200"
        >
          {item.label}
        </button>
      ))}
    </p>
  );
}

export function KingdomNodeCard({
  node,
  isPrimary,
  candidate,
  alternates,
  lastSeenDate,
  relations,
  opening,
  hasChildren,
  collapsed,
  onJump,
  onMainAction,
  onToggleCollapse,
}: KingdomNodeCardProps) {
  return (
    <section className="rounded-xl bg-white p-3 text-xs shadow-sm">
      <h3 className="text-sm font-semibold text-stone-700">{node.label}</h3>
      {isPrimary && candidate !== null && (
        <p className="mt-1 text-amber-700">{reasonLine(candidate)}</p>
      )}
      <p className="mt-1 text-stone-500">{stateStatement(node, lastSeenDate)}</p>
      {node.summary !== "" && <p className="mt-1 text-stone-500">{node.summary}</p>}

      <div className="mt-2 space-y-1">
        <RelationRow
          title="属于"
          items={relations.parent ? [relations.parent] : []}
          onJump={onJump}
        />
        <RelationRow title="包含" items={relations.children} onJump={onJump} />
        <RelationRow title="前置" items={relations.prerequisites} onJump={onJump} />
        <RelationRow title="帮衬它的" items={relations.helpers} onJump={onJump} />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={opening}
          onClick={onMainAction}
          className="rounded bg-amber-500 px-3 py-1 text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
        >
          {opening ? "打开中…" : MAIN_ACTION_LABEL[node.state]}
        </button>
        {hasChildren && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="rounded border border-stone-200 px-2 py-1 text-stone-500 hover:border-amber-400"
          >
            {collapsed ? "展开这一支" : "折叠这一支"}
          </button>
        )}
      </div>

      {isPrimary && alternates.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-stone-400">其他入口</summary>
          <ul className="mt-1 space-y-1">
            {alternates.map((alternate) => (
              <li key={alternate.nodeId}>
                <button
                  type="button"
                  onClick={() => onJump(alternate.nodeId)}
                  className="w-full rounded border border-stone-200 px-2 py-1 text-left text-stone-600 hover:border-amber-400"
                >
                  <span className="font-medium">{alternate.label}</span>
                  <span className="mt-0.5 block text-stone-400">{reasonLine(alternate)}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
