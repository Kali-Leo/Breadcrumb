/**
 * Purpose: the quiet fact-check companion under an assistant message — a "求证" button,
 * then gentle per-claim verdicts with verified evidence links (zero-pressure wording).
 * Main exports: FactcheckBadge.
 */
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { type DisplayClaim, useFactcheckStore } from "../stores/factcheckStore";
import { useSettingsStore } from "../stores/settingsStore";

const RELATIONSHIP_BADGES: Record<string, { icon: string; label: string; tone: string }> = {
  supported: { icon: "✓", label: "找到了佐证", tone: "text-emerald-600" },
  insufficient: { icon: "◌", label: "没找到佐证，值得再确认", tone: "text-stone-500" },
  contradicted: { icon: "≈", label: "查到的说法不太一致，两边都给你看", tone: "text-amber-700" },
};

interface FactcheckBadgeProps {
  messageId: string;
}

export function FactcheckBadge({ messageId }: FactcheckBadgeProps) {
  const enabled = useSettingsStore((state) => state.featureSwitches.factcheck);
  const claims = useFactcheckStore((state) => state.claimsByMessageId[messageId]);
  const checking = useFactcheckStore((state) => state.checkingMessageIds.has(messageId));
  const notice = useFactcheckStore((state) => state.noticeByMessageId[messageId]);
  const checkMessage = useFactcheckStore((state) => state.checkMessage);
  const [open, setOpen] = useState(false);

  if (!enabled) return null;

  if (checking) {
    return <p className="animate-pulse pl-1 text-xs text-stone-400">🔍 正在查资料…</p>;
  }

  if (claims === undefined) {
    return (
      <div className="pl-1">
        <button
          type="button"
          onClick={() => void checkMessage(messageId)}
          className="text-xs text-stone-400 transition-colors hover:text-amber-600"
        >
          🔍 求证
        </button>
        {notice && <span className="ml-2 text-xs text-stone-400">{notice}</span>}
      </div>
    );
  }

  if (claims.length === 0) {
    return <p className="pl-1 text-xs text-stone-400">🔍 这条回答没有需要核查的客观事实</p>;
  }

  const supportedCount = claims.filter((claim) => claim.relationship === "supported").length;
  const summary =
    supportedCount === claims.length
      ? `${supportedCount} 条说法都找到了佐证`
      : `${supportedCount}/${claims.length} 条说法找到了佐证`;

  return (
    <div className="max-w-[76%] space-y-1 pl-1">
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

function ClaimLine({ claim }: { claim: DisplayClaim }) {
  const badge = RELATIONSHIP_BADGES[claim.relationship] ?? RELATIONSHIP_BADGES.insufficient;
  return (
    <li className="space-y-0.5 text-xs">
      <p className="text-stone-600">
        <span className={badge?.tone}>{badge?.icon}</span> {claim.text}
        <span className={`ml-1 ${badge?.tone}`}>（{badge?.label}）</span>
      </p>
      <p className="pl-4 text-stone-500">{claim.reasoning}</p>
      {claim.evidence.map((item) => (
        <button
          key={item.url}
          type="button"
          onClick={() => void openUrl(item.url)}
          className="block pl-4 text-left text-stone-400 underline decoration-stone-300 hover:text-amber-600"
        >
          {item.title}
        </button>
      ))}
    </li>
  );
}
