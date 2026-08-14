/**
 * Purpose: sidebar conversation list, upgraded from a flat feed into trail cards (spec 041
 * §§1-2) — "正在进行" preview, topic groups (each trail's dominant node's top ancestor), and a
 * low-key "按时间浏览" toggle into the original time-ordered list. Split out of Sidebar.tsx to
 * keep it under the file-size cap.
 * Main exports: TrailList.
 */
import type { ConversationRow, NodeSightingRow } from "@breadcrumb/core-db";
import { EXPLORE_UI_COPY } from "@breadcrumb/plugin-explore";
import { useEffect, useMemo, useState } from "react";
import { getRepos } from "../lib/db";
import { todayLocalMidnightIso } from "../lib/time";
import { computeDominantNodes, groupTrails } from "../lib/trailGrouping";
import { displayTrailTitle } from "../lib/trailNaming";
import { useChatStore } from "../stores/chatStore";
import { useKnowledgeStore } from "../stores/knowledgeStore";

interface TrailListProps {
  isChatViewActive: boolean;
  onOpenChat(): void;
}

export function TrailList({ isChatViewActive, onOpenChat }: TrailListProps) {
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const openConversation = useChatStore((state) => state.openConversation);
  const nodes = useKnowledgeStore((state) => state.nodes);
  const [sightings, setSightings] = useState<readonly NodeSightingRow[]>([]);
  const [showTimeline, setShowTimeline] = useState(false);

  // Re-reads sightings whenever the conversation list changes (new round, new stations, a
  // rename) — conversations itself isn't read inside the effect, just used as the refresh signal.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on the conversation list, not read directly
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const repos = await getRepos();
      const rows = await repos.nodeSightings.listAll();
      if (!cancelled) setSightings(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversations]);

  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const dominantNodeByConversation = useMemo(() => computeDominantNodes(sightings), [sightings]);
  const grouped = useMemo(
    () =>
      groupTrails({
        conversations,
        dominantNodeByConversation,
        nodesById,
        todaySinceIso: todayLocalMidnightIso(),
      }),
    [conversations, dominantNodeByConversation, nodesById],
  );

  function open(conversation: ConversationRow) {
    void openConversation(conversation.id);
    onOpenChat();
  }

  function trailButton(conversation: ConversationRow) {
    const active = conversation.id === activeConversationId && isChatViewActive;
    return (
      <button
        type="button"
        key={conversation.id}
        onClick={() => open(conversation)}
        className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm transition-colors ${
          active ? "bg-amber-100 text-stone-800" : "text-stone-600 hover:bg-stone-100"
        }`}
      >
        {displayTrailTitle(conversation)}
      </button>
    );
  }

  return (
    <div className="space-y-1">
      {showTimeline ? (
        <div>{conversations.map(trailButton)}</div>
      ) : (
        <>
          {grouped.ongoing.length > 0 && (
            <div className="pb-1">
              <p className="px-3 py-1 text-[11px] text-stone-400">
                {EXPLORE_UI_COPY.ongoingSectionLabel}
              </p>
              {grouped.ongoing.map(trailButton)}
            </div>
          )}
          {grouped.groups.map((group) => (
            <div key={group.label} className="pb-1">
              <p className="px-3 py-1 text-xs text-stone-400">{group.label}</p>
              {group.trails.map(trailButton)}
            </div>
          ))}
        </>
      )}
      <button
        type="button"
        onClick={() => setShowTimeline((value) => !value)}
        className="block w-full px-3 py-1.5 text-left text-[11px] text-stone-400 hover:text-stone-600"
      >
        {showTimeline ? EXPLORE_UI_COPY.timelineCollapseLabel : EXPLORE_UI_COPY.timelineToggleLabel}
      </button>
    </div>
  );
}
