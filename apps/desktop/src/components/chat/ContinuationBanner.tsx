/**
 * Purpose: the mid-tree continuation banner (spec 040 §2) — shown while the active path
 * ends on a station that is not the newest leaf: the newer branch isn't gone, just off the
 * active path, and "回到最新" jumps back to it.
 * Main exports: ContinuationBanner.
 */
import { useTranslation } from "react-i18next";
import { newestLeafId } from "../../lib/chat/messageTree";
import { useChatStore } from "../../stores/chatStore";

export function ContinuationBanner() {
  const { t } = useTranslation(["chat", "common"]);
  const allMessages = useChatStore((state) => state.allMessages);
  const currentLeafId = useChatStore((state) => state.currentLeafId);
  const returnToLatest = useChatStore((state) => state.returnToLatest);
  if (currentLeafId === newestLeafId(allMessages)) return null;
  return (
    <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-1.5 text-xs text-stone-600">
      <span>{t("resumedFromMiddle")}</span>
      <button
        type="button"
        onClick={returnToLatest}
        className="ms-auto rounded px-2 py-0.5 text-stone-400 hover:bg-amber-100"
      >
        {t("backToLatest")}
      </button>
    </div>
  );
}
