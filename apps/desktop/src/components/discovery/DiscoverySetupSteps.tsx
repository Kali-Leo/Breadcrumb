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
import { useBrowsingInterestStore } from "../../stores/browsingInterestStore";

const VIOLENTMONKEY_URL = "https://violentmonkey.github.io/";
const BILIBILI_SCRIPT_URL = "https://greasyfork.org/zh-CN/scripts/592929";
const YOUTUBE_SCRIPT_URL = "https://greasyfork.org/zh-CN/scripts/592932";
const PROJECT_URL = "https://github.com/Kali-Leo/feed-mode";
const DEPENDENCY_COMMAND = "pip install numpy scikit-learn jieba sentence-transformers";

// Written out as whole strings: JSX turns a line break inside Chinese text into a stray space.
const COPY = {
  intro:
    "这一页显示你在 B站 和 YouTube 上看过什么、对什么感兴趣。整理都在你自己这台电脑上完成，内容不会送到别的地方去。",
  action: "还差浏览器那一步：装一个能运行脚本的插件，再装两个脚本。",
  afterClick:
    "浏览器里会打开三个页面：先装 Violentmonkey，再回到另外两页各点一次「安装此脚本」。装好之后照常刷 B站 和 YouTube 就行，这一页会自己变成你的兴趣。",
  token:
    "还有一步：在 B站 首页左下角的开关条上点 🔗，把下面这串字粘贴进去，YouTube 首页上同样做一次。",
  starting: "正在启动这台电脑上的兴趣程序…",
  notFound:
    "没在这台电脑上找到那个兴趣程序。它在 feed-mode 项目里，下载到主目录或桌面即可，之后回到这一页。",
  pythonMissing: "这台电脑上没有 Python，兴趣程序需要它才能运行。",
  failed:
    "兴趣程序没能启动起来。多半是缺几个 Python 包，在项目文件夹里运行这行命令，然后回到这一页：",
} as const;

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
        {copied ? "已复制" : "复制"}
      </button>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm text-stone-500 leading-relaxed">{children}</p>;
}

/** The service is the app's job, not the user's — this only speaks up when it went wrong. */
function ServiceNote() {
  const status = useBrowsingInterestStore((state) => state.serviceStatus);
  if (status === "running" || status === "unknown") return null;
  return (
    <div className="mt-8 space-y-2 rounded-xl bg-stone-50 px-4 py-3">
      {status === "starting" && <Note>{COPY.starting}</Note>}
      {status === "notFound" && (
        <>
          <Note>{COPY.notFound}</Note>
          <LinkButton label="打开项目主页" url={PROJECT_URL} />
        </>
      )}
      {status === "pythonMissing" && <Note>{COPY.pythonMissing}</Note>}
      {status === "failed" && (
        <>
          <Note>{COPY.failed}</Note>
          <CopyRow value={DEPENDENCY_COMMAND} />
        </>
      )}
    </div>
  );
}

export function DiscoverySetupSteps() {
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
      <h1 className="font-semibold text-lg text-stone-700">发现</h1>
      <Note>{COPY.intro}</Note>

      <div className="mt-7 space-y-3">
        <Note>{COPY.action}</Note>
        <button
          type="button"
          onClick={installInBrowser}
          className="rounded-full bg-amber-500 px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-amber-600"
        >
          在浏览器里安装
        </button>
        {opened && <Note>{COPY.afterClick}</Note>}
      </div>

      {connectionToken && (
        <div className="mt-6 space-y-2">
          <Note>{COPY.token}</Note>
          <CopyRow value={connectionToken} />
        </div>
      )}

      <ServiceNote />
    </div>
  );
}
