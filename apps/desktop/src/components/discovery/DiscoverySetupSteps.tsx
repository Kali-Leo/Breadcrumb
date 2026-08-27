/**
 * Purpose: what the discovery page shows until the interest service is running and has some
 * browsing to show. The app starts the service itself, so the only thing left for the user
 * is the browser side — one button that opens everything that has to be installed there,
 * because a browser will only install things the user confirms in the browser's own dialog.
 * Main exports: DiscoverySetupSteps.
 */
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useBrowsingInterestStore } from "../../stores/browsingInterestStore";

const VIOLENTMONKEY_URL = "https://violentmonkey.github.io/";
const BILIBILI_SCRIPT_URL = "https://greasyfork.org/zh-CN/scripts/592929";
const YOUTUBE_SCRIPT_URL = "https://greasyfork.org/zh-CN/scripts/592932";
const PROJECT_URL = "https://github.com/Kali-Leo/feed-mode";
const DEPENDENCY_COMMAND = "pip install numpy scikit-learn jieba sentence-transformers";

function LinkButton({ label, url }: { label: string; url: string }) {
  return (
    <button
      type="button"
      onClick={() => void openUrl(url)}
      className="rounded-full border border-stone-300 px-3 py-1.5 text-stone-600 text-xs transition-colors hover:bg-stone-50"
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
        className="shrink-0 rounded-full border border-stone-300 px-3 py-1.5 text-stone-600 text-xs transition-colors hover:bg-stone-50"
      >
        {copied ? t("common:actions.copied") : t("common:actions.copy")}
      </button>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm text-stone-500 leading-relaxed">{children}</p>;
}

/** The service is the app's job, not the user's — this only speaks up when it went wrong. */
function ServiceNote() {
  const { t } = useTranslation(["discovery", "common"]);
  const status = useBrowsingInterestStore((state) => state.serviceStatus);
  if (status === "running" || status === "unknown") return null;
  return (
    <div className="mt-8 space-y-2 rounded-xl bg-stone-50 px-4 py-3">
      {status === "starting" && <Note>{t("service.starting")}</Note>}
      {status === "notFound" && (
        <>
          <Note>{t("service.notFound")}</Note>
          <LinkButton label={t("projectHomepage")} url={PROJECT_URL} />
        </>
      )}
      {status === "pythonMissing" && <Note>{t("service.pythonMissing")}</Note>}
      {status === "failed" && (
        <>
          <Note>{t("service.failed")}</Note>
          <CopyRow value={DEPENDENCY_COMMAND} />
        </>
      )}
    </div>
  );
}

export function DiscoverySetupSteps() {
  const { t } = useTranslation(["discovery", "common"]);
  const connectionToken = useBrowsingInterestStore((state) => state.connectionToken);
  const [opened, setOpened] = useState(false);

  function installInBrowser() {
    // Order matters only for what ends up focused: the extension page is opened last so it
    // is the tab in front. The two script pages install fine once the extension is there.
    void openUrl(YOUTUBE_SCRIPT_URL);
    void openUrl(BILIBILI_SCRIPT_URL);
    void openUrl(VIOLENTMONKEY_URL);
    setOpened(true);
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="font-semibold text-lg text-stone-700">{t("title")}</h1>
      <Note>{t("intro")}</Note>

      <div className="mt-7 space-y-3">
        <Note>{t("action")}</Note>
        <button
          type="button"
          onClick={installInBrowser}
          className="rounded-full bg-amber-500 px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-amber-600"
        >
          {t("installButton")}
        </button>
        {opened && <Note>{t("afterClick")}</Note>}
      </div>

      {connectionToken && (
        <div className="mt-6 space-y-2">
          <Note>{t("token")}</Note>
          <CopyRow value={connectionToken} />
        </div>
      )}

      <ServiceNote />
    </div>
  );
}
