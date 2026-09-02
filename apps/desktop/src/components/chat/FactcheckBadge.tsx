/**
 * Purpose: the quiet fact-check companion under an assistant message — a "求证" button,
 * then gentle per-claim verdicts with verified evidence links (zero-pressure wording).
 * Main exports: FactcheckBadge.
 */
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCopyMessage } from "../../i18n/useCopyMessage";
import { claimReasoningKey } from "../../lib/factcheck/factcheckClaimCopy";
import { type DisplayClaim, useFactcheckStore } from "../../stores/factcheckStore";
import { useSettingsStore } from "../../stores/settingsStore";

/** The four outcomes, each with its icon and tone; the wording comes from the catalogue.
 * `unavailable` is the one the judge never produces: it means the search itself did not get
 * through, which says nothing about whether sources exist. */
const RELATIONSHIP_BADGES: Record<string, { icon: string; labelKey: string; tone: string }> = {
  supported: { icon: "✓", labelKey: "factcheck.supported", tone: "text-emerald-600" },
  insufficient: { icon: "◌", labelKey: "factcheck.insufficient", tone: "text-stone-500" },
  contradicted: { icon: "≈", labelKey: "factcheck.contradicted", tone: "text-amber-700" },
  unavailable: { icon: "…", labelKey: "factcheck.unavailable", tone: "text-stone-400" },
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
  const notice = useFactcheckStore((state) => state.noticeByMessageId[messageId]);
  const checkMessage = useFactcheckStore((state) => state.checkMessage);
  const [open, setOpen] = useState(false);

  if (!enabled || conversationId === null) return null;

  if (checking) {
    return (
      <p className="animate-pulse ps-1 text-xs text-stone-400">🔍 {t("factcheck.checking")}</p>
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

  const supportedCount = claims.filter((claim) => claim.relationship === "supported").length;
  const summary = buildSummary(t, claims, supportedCount);

  return (
    <div className="max-w-[76%] space-y-1 ps-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs text-stone-400 transition-colors hover:text-amber-600"
      >
        🔍 {summary} {open ? "▾" : "▸"}
      </button>
      {open && (
        <ul className="space-y-2 rounded-xl bg-white/70 p-3 shadow-sm">
          {claims.map((claim) => (
            <ClaimLine key={claim.text} claim={claim} />
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

function ClaimLine({ claim }: { claim: DisplayClaim }) {
  const { t } = useTranslation("chat");
  const badge = RELATIONSHIP_BADGES[claim.relationship] ?? RELATIONSHIP_BADGES.insufficient;
  // Outcomes the pipeline decided by itself carry no reasoning on purpose — the sentence is
  // written here, in the reader's language, rather than in the headless package.
  const fallbackKey = claimReasoningKey({
    relationship: claim.relationship,
    reasoning: claim.reasoning,
    evidenceCount: claim.evidence.length,
  });
  const reasoning = fallbackKey === null ? claim.reasoning : t(fallbackKey as never);
  return (
    <li className="space-y-0.5 text-xs">
      <p className="text-stone-600">
        <span className={badge?.tone}>{badge?.icon}</span> {claim.text}
        <span className={`ms-1 ${badge?.tone}`}>（{badge ? t(badge.labelKey as never) : ""}）</span>
      </p>
      <p className="ps-4 text-stone-500">{reasoning}</p>
      {claim.evidence.map((item) => (
        <button
          key={item.url}
          type="button"
          onClick={() => {
            // Evidence addresses come from search results and can be plain http, which the
            // opener capability no longer allows (nothing else in the app produces one).
            // Refusing quietly beats raising an error the learner cannot act on.
            if (item.url.startsWith("https://")) void openUrl(item.url);
          }}
          className="block ps-4 text-start text-stone-400 underline decoration-stone-300 hover:text-amber-600"
        >
          {item.title}
        </button>
      ))}
    </li>
  );
}
