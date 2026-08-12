/**
 * Purpose: the teach-back entry (spec 034, experiment) — lowest-retention nodes as
 * candidates, a free topic input, and recent teach sessions for re-entry. Fully additive:
 * removing this section reverts the whole experiment's UI.
 * Main exports: LabTeachSection.
 */
import type { ConversationRow } from "@breadcrumb/core-db";
import { useEffect, useState } from "react";
import { getRepos } from "../lib/db";
import { pickTeachCandidates, startTeachSession, TEACH_COPY } from "../lib/teachActions";
import { appEventBus } from "../stores/chatStore";
import { useKnowledgeStore } from "../stores/knowledgeStore";
import { useMemoryStore } from "../stores/memoryStore";

export function LabTeachSection() {
  const nodes = useKnowledgeStore((state) => state.nodes);
  const retentionByNode = useMemoryStore((state) => state.retentionByNode);
  const [freeTopic, setFreeTopic] = useState("");
  const [recent, setRecent] = useState<ConversationRow[]>([]);

  useEffect(() => {
    void (async () => {
      const repos = await getRepos();
      setRecent((await repos.conversations.listByKind("teach")).slice(0, 5));
      // Retention only refreshes after chat rounds — candidates need it now.
      await useMemoryStore.getState().refresh();
    })();
  }, []);

  const candidates = pickTeachCandidates(nodes, retentionByNode, 3);

  const start = async (topic: string) => {
    const trimmed = topic.trim();
    if (trimmed.length === 0) return;
    const conversationId = await startTeachSession(trimmed);
    appEventBus.emit("app:navigateChat", { conversationId });
  };

  return (
    <section>
      <h3 className="mb-1 font-semibold text-stone-600">{TEACH_COPY.sectionTitle}</h3>
      <p className="mb-2 text-stone-400 text-xs">{TEACH_COPY.sectionHint}</p>
      {candidates.length > 0 && (
        <ul className="mb-2 space-y-1">
          {candidates.map((node) => (
            <li key={node.id} className="rounded border border-stone-200 px-2 py-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{node.label}</span>
                <button
                  type="button"
                  onClick={() => void start(node.label)}
                  className="rounded bg-amber-100 px-2 py-0.5 text-stone-700 text-xs hover:bg-amber-200"
                >
                  {TEACH_COPY.startButton}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          void start(freeTopic);
        }}
      >
        <input
          value={freeTopic}
          onChange={(event) => setFreeTopic(event.target.value)}
          placeholder={TEACH_COPY.freeTopicPlaceholder}
          className="min-w-0 flex-1 rounded border border-stone-200 px-2 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={freeTopic.trim().length === 0}
          className="rounded bg-amber-100 px-2 py-1 text-stone-700 text-xs disabled:opacity-40"
        >
          {TEACH_COPY.startButton}
        </button>
      </form>
      {recent.length > 0 && (
        <div className="mt-2">
          <p className="text-stone-400 text-xs">{TEACH_COPY.recentTitle}</p>
          <ul className="mt-1 space-y-0.5">
            {recent.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  onClick={() =>
                    appEventBus.emit("app:navigateChat", { conversationId: conversation.id })
                  }
                  className="text-left text-stone-500 text-xs underline-offset-2 hover:underline"
                >
                  {conversation.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
