/**
 * Purpose: sidebar conversation list, grouped (spec 041 §2, wired by spec 044) — a "正在进行"
 * preview of today's recent trails plus topic groups labelled by each trail's dominant node's
 * top ancestor; trail-card display names stay auto "首站 → 末站" unless the user renamed.
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
  const [sightings, setSightings] = useState<NodeSightingRow[]>([]);

  // Refreshed whenever the conversation list changes — a new sighting always comes with a
  // conversation update, so this is the natural (and cheap, local-SQLite) refresh trigger.
  // biome-ignore lint/correctness/useExhaustiveDependencies: conversations is the refresh trigger, not a body dependency
  useEffect(() => {
    void (async () => {
      const repos = await getRepos();
      setSightings(await repos.nodeSightings.listAll());
    })();
  }, [conversations]);

  const grouped = useMemo(() => {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    return groupTrails({
      conversations,
      dominantNodeByConversation: computeDominantNodes(sightings),
      nodesById,
      todaySinceIso: todayLocalMidnightIso(),
    });
  }, [conversations, sightings, nodes]);

  function trailButton(conversation: ConversationRow) {
    const active = conversation.id === activeConversationId && isChatViewActive;
    return (
      <button
        type="button"
        key={conversation.id}
        onClick={() => {
          void openConversation(conversation.id);
          onOpenChat();
        }}
        className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm transition-colors ${
          active ? "bg-amber-100 text-stone-800" : "text-stone-600 hover:bg-stone-100"
        }`}
      >
        {displayTrailTitle(conversation)}
      </button>
    );
  }

  return (
    <div className="space-y-2">
      {grouped.ongoing.length > 0 && (
        <section>
          <h3 className="mb-1 px-3 text-[11px] text-stone-400">
            {EXPLORE_UI_COPY.ongoingSectionLabel}
          </h3>
          <div className="space-y-1">{grouped.ongoing.map(trailButton)}</div>
        </section>
      )}
      {grouped.groups.map((group) => (
        <section key={group.label}>
          <h3 className="mb-1 truncate px-3 text-[11px] text-stone-400">{group.label}</h3>
          <div className="space-y-1">{group.trails.map(trailButton)}</div>
        </section>
      ))}
    </div>
  );
}
