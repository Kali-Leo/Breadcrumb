/**
 * Purpose: the third level's two-stage node card (spec 049) — concept summary, plain state
 * statement, the recommendation reason when this is the "下一步", the relation list
 * (clickable jumps), alternates on demand, and one state-worded main action. Opening a
 * conversation is deliberately never a single click on the map.
 * Main exports: KingdomNodeCard.
 */

import type { FrontierCandidate } from "@breadcrumb/feature-planner";
import { useTranslation } from "react-i18next";
import { useCopyMessage } from "../../../i18n/useCopyMessage";
import type { NodeRelations } from "../../../lib/map/kingdomRelations";
import type { KingdomViewNode } from "../../../lib/map/kingdomView";
import { MAIN_ACTION_KEY, reasonMessage, stateMessage } from "./kingdomCardCopy";

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
  /** Null when nothing is left to go back to: the conversation this concept was first met
   * in was deleted, or it arrived without a message behind it. */
  onGoToOrigin: (() => void) | null;
}

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
          className="ms-1 rounded bg-stone-100 px-1 py-0.5 text-stone-600 hover:bg-stone-200 coarse:my-0.5 coarse:inline-flex coarse:min-h-11 coarse:items-center coarse:px-2"
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
  onGoToOrigin,
}: KingdomNodeCardProps) {
  const { t } = useTranslation(["palace", "common"]);
  const copy = useCopyMessage();
  const listSeparator = t("common:list.separator");
  return (
    <section className="rounded-xl bg-white p-3 text-xs shadow-sm">
      <h3 className="text-sm font-semibold text-stone-700">{node.label}</h3>
      {isPrimary && candidate !== null && (
        <p className="mt-1 text-amber-700">{copy(reasonMessage(candidate, listSeparator))}</p>
      )}
      <p className="mt-1 text-stone-500">{copy(stateMessage(node, lastSeenDate))}</p>
      {node.summary !== "" && <p className="mt-1 text-stone-500">{node.summary}</p>}

      <div className="mt-2 space-y-1">
        <RelationRow
          title={t("kingdom.relationBelongsTo")}
          items={relations.parent ? [relations.parent] : []}
          onJump={onJump}
        />
        <RelationRow
          title={t("kingdom.relationContains")}
          items={relations.children}
          onJump={onJump}
        />
        <RelationRow
          title={t("kingdom.relationPrerequisites")}
          items={relations.prerequisites}
          onJump={onJump}
        />
        <RelationRow
          title={t("kingdom.relationHelpers")}
          items={relations.helpers}
          onJump={onJump}
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={opening}
          onClick={onMainAction}
          className="rounded bg-amber-500 px-3 py-1 text-white transition-colors hover:bg-amber-600 disabled:opacity-50 coarse:min-h-11 coarse:px-4"
        >
          {opening ? t("kingdom.opening") : t(MAIN_ACTION_KEY[node.state])}
        </button>
        {hasChildren && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="rounded border border-stone-200 px-2 py-1 text-stone-500 hover:border-amber-400 coarse:min-h-11 coarse:px-3"
          >
            {collapsed ? t("kingdom.expandBranch") : t("kingdom.collapseBranch")}
          </button>
        )}
      </div>

      {onGoToOrigin !== null && (
        <button
          type="button"
          onClick={onGoToOrigin}
          className="mt-2 text-stone-400 underline decoration-stone-300 underline-offset-2 hover:text-stone-600 coarse:inline-flex coarse:min-h-11 coarse:items-center"
        >
          {t("kingdom.goToOrigin")}
        </button>
      )}

      {isPrimary && alternates.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-stone-400">{t("kingdom.otherEntries")}</summary>
          <ul className="mt-1 space-y-1">
            {alternates.map((alternate) => (
              <li key={alternate.nodeId}>
                <button
                  type="button"
                  onClick={() => onJump(alternate.nodeId)}
                  className="w-full rounded border border-stone-200 px-2 py-1 text-start text-stone-600 hover:border-amber-400 coarse:min-h-11"
                >
                  <span className="font-medium">{alternate.label}</span>
                  <span className="mt-0.5 block text-stone-400">
                    {copy(reasonMessage(alternate, listSeparator))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
