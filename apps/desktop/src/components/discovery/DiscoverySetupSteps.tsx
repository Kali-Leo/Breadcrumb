/**
 * Purpose: what the discovery page shows before any browsing has been recorded — the three
 * things the learner does in their browser, and the code that connects it to this app.
 *
 * Nothing here asks anyone to install a program: the collecting is a browser script, and the
 * two scripts come from Breadcrumb itself (the desktop serves them from this machine, the
 * browser edition from the same site the page came from). The copy names the browser
 * extension and nothing under the hood.
 * Main exports: DiscoverySetupSteps.
 */
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PairingInfo } from "../../lib/platform/browsingChannels";
import { isBrowserEdition } from "../../lib/platform/edition";
import { useBrowsingInterestStore, useConnectionCode } from "../../stores/browsingInterestStore";

const VIOLENTMONKEY_URL = "https://violentmonkey.github.io/";

/** Where a script comes from. On the desktop it is this machine; in the browser edition it is
 * the same site as the page, so a script manager can install it straight from the link. */
function scriptUrl(site: "bilibili" | "youtube", pairing: PairingInfo | null): string {
  if (pairing !== null) return `http://127.0.0.1:${pairing.port}/script/${site}.user.js`;
  const file = `${site}-feed-mode.user.js`;
  return new URL(`userscripts/${file}`, new URL(import.meta.env.BASE_URL, window.location.href))
    .href;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm text-stone-500 leading-relaxed">{children}</p>;
}

function StepHeading({ children }: { children: ReactNode }) {
  return <h2 className="font-medium text-sm text-stone-700">{children}</h2>;
}

function LinkButton({ label, url }: { label: string; url: string }) {
  return (
    <button
      type="button"
      onClick={() => void openUrl(url)}
      className="rounded-full border border-stone-300 px-3 py-1.5 text-stone-600 text-xs transition-colors hover:bg-stone-50 coarse:min-h-11"
    >
      {label}
    </button>
  );
}

function CopyRow({ value }: { value: string }) {
  const { t } = useTranslation(["discovery", "common"]);
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-lg bg-stone-100 px-2.5 py-1.5 font-mono text-[12px] text-stone-600">
        {value}
      </code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
        className="shrink-0 rounded-full border border-stone-300 px-3 py-1.5 text-stone-600 text-xs transition-colors hover:bg-stone-50 coarse:min-h-11"
      >
        {copied ? t("common:actions.copied") : t("common:actions.copy")}
      </button>
    </div>
  );
}

export function DiscoverySetupSteps() {
  const { t } = useTranslation(["discovery", "common"]);
  const pairing = useBrowsingInterestStore((state) => state.pairing);
  const code = useConnectionCode();

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="font-semibold text-lg text-stone-700">{t("setup.title")}</h1>
      <Note>{t("setup.intro")}</Note>

      <div className="mt-8 space-y-3">
        <StepHeading>{t("setup.step1Title")}</StepHeading>
        <Note>{t("setup.step1Body")}</Note>
        <LinkButton label={t("setup.step1Button")} url={VIOLENTMONKEY_URL} />
      </div>

      <div className="mt-8 space-y-3">
        <StepHeading>{t("setup.step2Title")}</StepHeading>
        <Note>{t("setup.step2Body")}</Note>
        <div className="flex flex-wrap gap-2">
          <LinkButton label={t("setup.bilibiliScript")} url={scriptUrl("bilibili", pairing)} />
          <LinkButton label={t("setup.youtubeScript")} url={scriptUrl("youtube", pairing)} />
        </div>
      </div>

      {/* Which third step depends on the build, not on whether the listener happens to be up:
          a desktop whose listener failed still connects by a code, and telling it to wait for
          a page hand-off it cannot receive would be advice that never comes true. */}
      {isBrowserEdition() ? (
        <div className="mt-8 space-y-3">
          <StepHeading>{t("setup.step3TitleWeb")}</StepHeading>
          <Note>{t("setup.step3BodyWeb")}</Note>
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          <StepHeading>{t("setup.step3Title")}</StepHeading>
          <Note>{t("setup.step3Body")}</Note>
          {code === null ? <Note>{t("setup.codeUsed")}</Note> : <CopyRow value={code} />}
          {(pairing?.paired ?? 0) > 0 && <Note>{t("setup.connected")}</Note>}
        </div>
      )}
    </div>
  );
}
