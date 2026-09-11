/**
 * Purpose: the fact-check companion under an assistant message. In 学习模式 the check runs by
 * itself, so this mostly reports rather than invites: the work is named while it runs, a claim
 * the sources contradict is shown outside the fold (hiding the one finding worth reading would
 * be the whole feature failing), and a plain sentence says which part of the answer was checked
 * at all — without it, readers take everything unmarked as verified (Pennycook et al., 2020).
 * The 求证 button stays for rounds nothing checked automatically.
 * Main exports: FactcheckBadge.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCopyMessage } from "../../i18n/useCopyMessage";
import { type DisplayClaim, useFactcheckStore } from "../../stores/factcheckStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { FactcheckClaimLine } from "./FactcheckClaimLine";

/** What the line under the answer says while the check is running. Naming the step is the
 * difference between waiting and watching work happen — and the waiting is not dead time
 * either: an answer that arrives instantly is judged LESS considered than one that takes a few
 * seconds (Tan et al., CHI 2026, N=240). */
const STAGE_KEYS: Record<string, string> = {
  extracting: "factcheck.checkingExtracting",
  gathering: "factcheck.checkingGathering",
  judging: "factcheck.checkingJudging",
};

interface FactcheckBadgeProps {
  /** The conversation this badge's message belongs to — passed by its window, never read
   * from the active binding (same wiring as MessageBubble's conversationId prop). */
  conversationId: string | null;
  messageId: string;
}

export function FactcheckBadge({ conversationId, messageId }: FactcheckBadgeProps) {
  const { t } = useTranslation("chat");
  const copy = useCopyMessage();
  const enabled = useSettingsStore((state) => state.featureSwitches.factcheck);
  const claims = useFactcheckStore((state) =>
    conversationId === null
      ? undefined
      : state.claimsByConversation.get(conversationId)?.get(messageId),
  );
  const checking = useFactcheckStore((state) => state.checkingMessageIds.has(messageId));
  const stage = useFactcheckStore((state) => state.stageByMessageId[messageId]);
  const notice = useFactcheckStore((state) => state.noticeByMessageId[messageId]);
  const checkMessage = useFactcheckStore((state) => state.checkMessage);
  const [open, setOpen] = useState(false);

  if (!enabled || conversationId === null) return null;

  if (checking) {
    const stageKey = (stage === undefined ? undefined : STAGE_KEYS[stage]) ?? "factcheck.checking";
    return (
      <p className="ps-1 text-xs text-stone-600">
        <span className="animate-pulse">🔍</span> {t(stageKey as never)}
      </p>
    );
  }

  if (claims === undefined) {
    return (
      <div className="ps-1">
        <button
          type="button"
          onClick={() => void checkMessage(conversationId, messageId)}
          className="text-xs text-stone-400 transition-colors hover:text-amber-600"
        >
          🔍 {t("factcheck.ask")}
        </button>
        {notice && <span className="ms-2 text-xs text-stone-400">{copy(notice)}</span>}
      </div>
    );
  }

  if (claims.length === 0) {
    return <p className="ps-1 text-xs text-stone-400">🔍 {t("factcheck.nothingToCheck")}</p>;
  }

  const conflicts = claims.filter((claim) => claim.relationship === "contradicted");
  const rest = claims.filter((claim) => claim.relationship !== "contradicted");
  const supportedCount = claims.filter((claim) => claim.relationship === "supported").length;

  return (
    <div className="max-w-[76%] space-y-1 ps-1">
      {conflicts.length > 0 && (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/80 p-3">
          <p className="text-xs text-amber-800">{t("factcheck.conflictHeading")}</p>
          <ul className="space-y-2">
            {conflicts.map((claim) => (
              <FactcheckClaimLine key={claim.text} claim={claim} />
            ))}
          </ul>
        </div>
      )}
      {rest.length === 0 ? (
        <p className="text-xs text-stone-400">🔍 {buildSummary(t, claims, supportedCount)}</p>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-xs text-stone-400 transition-colors hover:text-amber-600"
        >
          🔍 {buildSummary(t, claims, supportedCount)} {open ? "▾" : "▸"}
        </button>
      )}
      {/* Always visible, folded or not: this sentence is what stops the unchecked parts of the
          answer from reading as checked. */}
      <p className="text-xs text-stone-400">{t("factcheck.coverageNote")}</p>
      {open && (
        <ul className="space-y-2 rounded-xl bg-white/70 p-3 shadow-sm">
          {rest.map((claim) => (
            <FactcheckClaimLine key={claim.text} claim={claim} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** The collapsed line. When not one claim could be looked up, saying "0 found supporting
 * sources" would be a claim about the world we have no basis for — so that case gets its own
 * sentence about us, not about the answer. */
function buildSummary(
  t: ReturnType<typeof useTranslation<"chat">>["t"],
  claims: readonly DisplayClaim[],
  supportedCount: number,
): string {
  if (claims.every((claim) => claim.relationship === "unavailable")) {
    return t("factcheck.noneChecked");
  }
  return supportedCount === claims.length
    ? t("factcheck.allSupported", { count: supportedCount })
    : t("factcheck.someSupported", { supported: supportedCount, total: claims.length });
}
