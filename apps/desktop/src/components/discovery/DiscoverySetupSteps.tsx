/**
 * Purpose: what the discovery page shows before the local interest service is reachable —
 * the four things the user does once, each with the button that does it. Written for someone
 * who has never heard of userscripts (spec 057 §2).
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
const START_COMMAND = "python3 interest-model/daemon/app.py";

// Written out as whole strings: JSX turns a line break inside Chinese text into a stray space.
const COPY = {
  intro:
    "这一页显示你在 B站 和 YouTube 上看过什么、对什么感兴趣。做这件事的是两个东西：一个装在你浏览器里的脚本，在这两个网站的首页上整理推荐内容；一个跑在你这台电脑上的小程序，把看过的内容归成主题。两个都在本机，内容不会送到别的地方去。下面四步做完，这一页就会变成你的兴趣。",
  violentmonkey: "Violentmonkey 是一个免费的浏览器插件。装了它，浏览器才能运行下一步的两个脚本。",
  scripts:
    "脚本会在 B站 和 YouTube 的首页把推荐内容分成专业、精选娱乐、娱乐三档，你可以随时切换；它同时把你看过的标题记在这台电脑上。",
  service:
    "这个程序把记下来的内容归成主题。它只监听本机，不联网。在下载好的项目文件夹里运行这行命令：",
  token:
    "连接码让脚本确认，它是在把记录交给你自己的电脑。在 B站 首页左下角的开关条上点 🔗，把这串字粘贴进去；YouTube 首页上同样做一次。填好刷新页面后，把鼠标停在 🔗 上就能看到有没有连上。",
  tokenPending: "上一步的程序启动之后，这里会出现要填的连接码。",
  waiting: "还没连上电脑上的兴趣程序。它一启动，这一页会自动换成你的兴趣。",
} as const;

function LinkButton({ label, url }: { label: string; url: string }) {
  return (
    <button
      type="button"
      onClick={() => void openUrl(url)}
      className="rounded-full bg-amber-500 px-3 py-1.5 font-medium text-white text-xs transition-colors hover:bg-amber-600"
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

function SetupStep({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-100 font-semibold text-stone-500 text-xs">
        {index}
      </span>
      <div className="min-w-0 flex-1 space-y-2 pb-5">
        <h2 className="font-semibold text-sm text-stone-700">{title}</h2>
        {children}
      </div>
    </li>
  );
}

function StepText({ children }: { children: ReactNode }) {
  return <p className="text-sm text-stone-500 leading-relaxed">{children}</p>;
}

export function DiscoverySetupSteps() {
  const connectionToken = useBrowsingInterestStore((state) => state.connectionToken);

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="font-semibold text-lg text-stone-700">发现</h1>
      <p className="mt-2 text-sm text-stone-500 leading-relaxed">{COPY.intro}</p>

      <ol className="mt-7">
        <SetupStep index={1} title="装 Violentmonkey">
          <StepText>{COPY.violentmonkey}</StepText>
          <LinkButton label="打开 Violentmonkey 官网" url={VIOLENTMONKEY_URL} />
        </SetupStep>

        <SetupStep index={2} title="装上两个网站的脚本">
          <StepText>{COPY.scripts}</StepText>
          <div className="flex gap-2">
            <LinkButton label="安装 B站 版" url={BILIBILI_SCRIPT_URL} />
            <LinkButton label="安装 YouTube 版" url={YOUTUBE_SCRIPT_URL} />
          </div>
        </SetupStep>

        <SetupStep index={3} title="启动电脑上的兴趣程序">
          <StepText>{COPY.service}</StepText>
          <CopyRow value={START_COMMAND} />
          <LinkButton label="打开项目主页" url={PROJECT_URL} />
        </SetupStep>

        <SetupStep index={4} title="把连接码填进脚本设置">
          {connectionToken ? (
            <>
              <StepText>{COPY.token}</StepText>
              <CopyRow value={connectionToken} />
            </>
          ) : (
            <StepText>{COPY.tokenPending}</StepText>
          )}
        </SetupStep>
      </ol>

      <p className="rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-500">{COPY.waiting}</p>
    </div>
  );
}
