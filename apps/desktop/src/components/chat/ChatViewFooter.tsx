/**
 * Purpose: everything that belongs after the last message in the history — the "正在查资料"
 * line, the streaming reply, and the gentle error/retry banner. Split out of ChatView so that
 * file stays about the column's layout and its locate/scroll behaviour.
 *
 * The source-gathering line is here because that wait happens BEFORE the first token, in the
 * same place the streaming bubble will appear: naming the step is the difference between
 * waiting and watching work happen, and the waiting is not dead time either — an answer that
 * arrives instantly is judged LESS considered than one that takes a few seconds (Tan et al.,
 * CHI 2026, N=240). No skeleton, no progress animation: skeletons measured as the slowest-
 * feeling of the options, and a long visible process makes a bad result feel worse.
 * Main exports: ChatViewFooter.
 */
import type { CopyMessage } from "@breadcrumb/core-i18n";
import { useTranslation } from "react-i18next";
import { useCopyMessage } from "../../i18n/useCopyMessage";
import { useGroundingStore } from "../../stores/groundingStore";
import { useRerankerStore } from "../../stores/rerankerStore";
import { MessageBubble } from "./MessageBubble";

interface ChatViewFooterProps {
  conversationId: string | null;
  /** Null when no round is streaming into this conversation. */
  streamingText: string | null;
  errorText: CopyMessage | null;
  canRetry: boolean;
  onRetry(conversationId: string): void;
}

export function ChatViewFooter({
  conversationId,
  streamingText,
  errorText,
  canRetry,
  onRetry,
}: ChatViewFooterProps) {
  const { t } = useTranslation(["chat", "common"]);
  const copy = useCopyMessage();
  const gathering = useGroundingStore((state) =>
    conversationId === null ? false : state.gatheringConversationIds.has(conversationId),
  );
  // The one-time download of the passage-ranking model runs for minutes behind the chat. It is
  // named here, beside the search it will improve, because a reader who sees network traffic
  // deserves to know what it is — and because this round did not wait for it.
  const preparingRanking = useRerankerStore((state) => state.status === "downloading");

  return (
    <div className="space-y-3">
      {gathering && (
        <p className="ps-1 text-xs text-stone-600">
          <span className="animate-pulse">🔍</span> {t("chat:grounding.gathering")}
          {preparingRanking && (
            <span className="ms-2 text-stone-400">{t("chat:grounding.preparingRanking")}</span>
          )}
        </p>
      )}
      {!gathering && preparingRanking && (
        <p className="ps-1 text-xs text-stone-400">{t("chat:grounding.preparingRanking")}</p>
      )}
      {streamingText !== null && (
        <MessageBubble
          conversationId={conversationId}
          author="assistant"
          content={streamingText || "…"}
        />
      )}
      {(errorText !== null || canRetry) && (
        <div className="mx-auto max-w-md rounded-xl bg-amber-50 px-4 py-3 text-center text-sm text-stone-600">
          {errorText === null ? t("chat:noReplyYet") : copy(errorText)}
          {canRetry && conversationId !== null && (
            <button
              type="button"
              onClick={() => onRetry(conversationId)}
              className="ms-2 rounded-lg bg-amber-100 px-2 py-0.5 text-stone-700 hover:bg-amber-200"
            >
              {t("common:actions.retry")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
