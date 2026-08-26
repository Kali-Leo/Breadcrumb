/**
 * Purpose: the professional content the user actually watched — two tabs (没看完 / 看完),
 * a filter by top-level group, and a card per item with its cover and how far it got.
 * Main exports: InterestProContentPanel.
 */
import {
  groupCounts,
  type ProContentItem,
  thumbnailUrl,
  videoUrl,
  watchedMinutes,
  watchedPercent,
} from "@breadcrumb/plugin-browsing-interest";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { useBrowsingInterestStore } from "../../stores/browsingInterestStore";
import { InterestPanel, InterestPanelEmptyLine, InterestSegmentedControl } from "./InterestPanel";

const TABS = [
  { value: "unfinished", label: "没看完" },
  { value: "finished", label: "看完" },
] as const;
type Tab = (typeof TABS)[number]["value"];

const ALL_GROUPS = "全部";

function ProContentCard({ item, finished }: { item: ProContentItem; finished: boolean }) {
  const url = videoUrl(item.site, item.id);
  const cover = thumbnailUrl(item.pic);
  const percent = watchedPercent(item) ?? (finished ? 100 : 0);
  const minutes = watchedMinutes(item);
  const date = new Date(item.ts * 1000);

  return (
    <div className="flex gap-3 rounded-xl bg-stone-50 p-2.5 transition-colors hover:bg-white hover:shadow-sm">
      {cover ? (
        <img
          src={cover}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          className="h-[82px] w-[132px] shrink-0 rounded-lg bg-stone-200 object-cover"
        />
      ) : (
        <div className="h-[82px] w-[132px] shrink-0 rounded-lg bg-stone-200" />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {url ? (
          <button
            type="button"
            onClick={() => void openUrl(url)}
            className="line-clamp-2 text-left text-blue-700 text-sm hover:underline"
          >
            {item.title}
          </button>
        ) : (
          <span className="line-clamp-2 text-sm text-stone-700">{item.title}</span>
        )}
        <div className="mt-1 text-[11px] text-stone-400">
          {[
            item.up,
            item.topic,
            `${date.getMonth() + 1}.${date.getDate()}`,
            minutes ? `${minutes.watched}/${minutes.total} 分钟` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
        <div className="flex-1" />
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-stone-200">
          <div
            className={`h-full rounded-full ${percent >= 80 ? "bg-emerald-500" : "bg-orange-500"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function InterestProContentPanel() {
  const proContent = useBrowsingInterestStore((state) => state.proContent);
  const [tab, setTab] = useState<Tab>("unfinished");
  const [group, setGroup] = useState<string>(ALL_GROUPS);

  const everything = [...(proContent?.unfinished ?? []), ...(proContent?.finished ?? [])];
  const groups = [
    { value: ALL_GROUPS, label: ALL_GROUPS },
    ...groupCounts(everything).map((entry) => ({
      value: entry.group,
      label: `${entry.group} ${entry.count}`,
    })),
  ];
  const items = (proContent?.[tab] ?? []).filter(
    (item) => group === ALL_GROUPS || item.group === group,
  );

  return (
    <InterestPanel
      title="专业内容"
      controls={
        <>
          <InterestSegmentedControl options={TABS} value={tab} onChange={(next) => setTab(next)} />
          <InterestSegmentedControl
            options={groups}
            value={groups.some((entry) => entry.value === group) ? group : ALL_GROUPS}
            onChange={(next) => setGroup(next)}
          />
        </>
      }
    >
      {items.length === 0 ? (
        <InterestPanelEmptyLine>这段时间没有看过的专业内容</InterestPanelEmptyLine>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3">
          {items.map((item) => (
            <ProContentCard
              key={`${item.id}-${item.ts}`}
              item={item}
              finished={tab === "finished"}
            />
          ))}
        </div>
      )}
    </InterestPanel>
  );
}
