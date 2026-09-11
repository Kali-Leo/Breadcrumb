/**
 * Purpose: one checked claim as the reader sees it — the outcome, the sentence explaining it,
 * and the source's own words right there. The excerpt is the point of this file: the page text
 * was already fetched to judge with, and until now the interface threw it away and offered a
 * link instead. Under a tenth of readers ever follow such a link (Ding et al., AAAI 2025), so a
 * link is not evidence; the sentence in front of you is.
 * Main exports: FactcheckClaimLine, RELATIONSHIP_BADGES.
 */
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { claimReasoningKey } from "../../lib/factcheck/factcheckClaimCopy";
import type { DisplayClaim } from "../../stores/factcheckStore";

/**
 * The five outcomes, each with its icon and tone. Colour, not faintness: in a learning task,
 * marking uncertain material by drawing it more faintly measurably hurt what readers remembered
 * of it, while a stop-light palette helped (Glaser et al., 2022).
 * Two of these never come from the judge — `unavailable` means the search never got out, and
 * `unanchored` means the sources do not say it in so many words.
 */
export const RELATIONSHIP_BADGES: Record<string, { icon: string; labelKey: string; tone: string }> =
  {
    supported: { icon: "✓", labelKey: "factcheck.supported", tone: "text-emerald-600" },
    insufficient: { icon: "◌", labelKey: "factcheck.insufficient", tone: "text-stone-500" },
    unanchored: { icon: "◍", labelKey: "factcheck.unanchored", tone: "text-stone-500" },
    contradicted: { icon: "≈", labelKey: "factcheck.contradicted", tone: "text-amber-700" },
    unavailable: { icon: "…", labelKey: "factcheck.unavailable", tone: "text-stone-400" },
  };

export function FactcheckClaimLine({ claim }: { claim: DisplayClaim }) {
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
  const firstSource = claim.evidence[0];

  return (
    <li className="space-y-1 text-xs">
      <p className="text-stone-600">
        <span className={badge?.tone}>{badge?.icon}</span> {claim.text}
        <span className={`ms-1 ${badge?.tone}`}>（{badge ? t(badge.labelKey as never) : ""}）</span>
      </p>
      <p className="ps-4 text-stone-500">{reasoning}</p>
      {claim.quote !== "" && (
        <p className="ms-4 border-stone-300 border-s-2 ps-2 text-stone-600 italic">
          {t("factcheck.quoteLead")}「{claim.quote}」
        </p>
      )}
      {firstSource !== undefined && (
        <div className="ms-4 space-y-1">
          <p className="text-stone-400">
            {t("factcheck.excerptLead", { source: firstSource.title })}
          </p>
          {/* Bounded and scrollable: a page window runs to about 1500 characters, and a wall of
              text under every claim would be its own way of hiding it. */}
          <p className="max-h-28 overflow-y-auto rounded-lg bg-stone-100/70 p-2 text-stone-600 leading-relaxed">
            {firstSource.snippet}
          </p>
        </div>
      )}
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
