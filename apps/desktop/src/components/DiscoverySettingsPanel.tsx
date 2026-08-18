/**
 * Purpose: the settings page for the discovery feed (spec 053 §8, spec 054 §(b)) — how big the
 * cards are drawn, one switch per channel the app ships with, 省流量模式, the reader's own feeds,
 * and the 豆瓣 id that turns the catalog's 豆瓣 entry on. The source settings take effect on the
 * next restock; nothing already fetched is thrown away. The card size takes effect at once.
 * Main exports: DiscoverySettingsPanel.
 */
import { useEffect, useState } from "react";
import { listCatalogChannelChoices } from "../lib/discoveryChannelSources";
import {
  ensureDiscoveryChannelSettingsLoaded,
  useDiscoveryChannelSettingsStore,
} from "../stores/discoveryChannelSettingsStore";
import { CARD_SIZE_EXPLANATION, DiscoveryCardSizeSwitch } from "./DiscoveryCardSizeSwitch";
import { DiscoveryUserFeedsSection } from "./DiscoveryUserFeedsSection";
import { Toggle } from "./SettingsToggle";

const SOURCES_EXPLANATION =
  "发现页从这些地方取内容。关掉一个，以后就不再取它的；已经取回来的还在。";
const DATA_SAVER_EXPLANATION = "打开后只取文字，不下载图片。网速慢或者流量紧张的时候用。";
const DOUBAN_EXPLANATION =
  "填上你的豆瓣 ID，发现页会把你在豆瓣标记过的书、电影和音乐也放进来。不填就不读豆瓣。";

const inputClass =
  "w-full rounded-xl border border-stone-200 px-3 py-2 text-[15px] outline-none focus:border-amber-400";

function ChannelSwitches() {
  const channelEnabledById = useDiscoveryChannelSettingsStore((state) => state.channelEnabledById);
  const choices = listCatalogChannelChoices().filter((choice) => !choice.needsUserInput);

  return (
    <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
      <div>
        <h3 className="font-medium text-stone-700">内容来源</h3>
        <p className="text-sm text-stone-500">{SOURCES_EXPLANATION}</p>
      </div>
      <ul className="space-y-2">
        {choices.map((choice) => {
          const on = channelEnabledById[choice.id] ?? choice.defaultEnabled;
          return (
            <li key={choice.id} className="flex items-center justify-between gap-4">
              <span className="min-w-0 truncate text-[15px] text-stone-600">
                {choice.displayName}
              </span>
              <Toggle
                on={on}
                label={choice.displayName}
                onClick={() =>
                  void useDiscoveryChannelSettingsStore.getState().setChannelEnabled(choice.id, !on)
                }
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DoubanSection() {
  const storedId = useDiscoveryChannelSettingsStore((state) => state.doubanUserId);
  const [draft, setDraft] = useState(storedId);
  const [saved, setSaved] = useState(false);

  // The stored id arrives after the panel first renders (the settings row is read once, on
  // mount), so the field follows it until the reader types.
  useEffect(() => setDraft(storedId), [storedId]);

  async function save(): Promise<void> {
    await useDiscoveryChannelSettingsStore.getState().setDoubanUserId(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
      <div>
        <h3 className="font-medium text-stone-700">豆瓣</h3>
        <p className="text-sm text-stone-500">{DOUBAN_EXPLANATION}</p>
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="豆瓣用户 ID"
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => void save()}
          className="shrink-0 rounded-xl bg-amber-500 px-4 py-2 text-white transition-colors hover:bg-amber-600"
        >
          保存
        </button>
      </div>
      {saved && <p className="text-amber-600 text-sm">已保存 ✓</p>}
    </section>
  );
}

export function DiscoverySettingsPanel() {
  const loaded = useDiscoveryChannelSettingsStore((state) => state.loaded);
  const dataSaverEnabled = useDiscoveryChannelSettingsStore((state) => state.dataSaverEnabled);

  useEffect(() => {
    void ensureDiscoveryChannelSettingsLoaded();
  }, []);

  if (!loaded) return null;

  return (
    <>
      <section className="flex items-center justify-between gap-4 rounded-2xl bg-white p-5 shadow-sm">
        <div>
          <h3 className="font-medium text-stone-700">卡片大小</h3>
          <p className="text-sm text-stone-500">{CARD_SIZE_EXPLANATION}</p>
        </div>
        <DiscoveryCardSizeSwitch />
      </section>
      <ChannelSwitches />
      <section className="flex items-center justify-between gap-4 rounded-2xl bg-white p-5 shadow-sm">
        <div>
          <h3 className="font-medium text-stone-700">省流量模式</h3>
          <p className="text-sm text-stone-500">{DATA_SAVER_EXPLANATION}</p>
        </div>
        <Toggle
          on={dataSaverEnabled}
          label="省流量模式"
          onClick={() =>
            void useDiscoveryChannelSettingsStore.getState().setDataSaverEnabled(!dataSaverEnabled)
          }
        />
      </section>
      <DiscoveryUserFeedsSection />
      <DoubanSection />
    </>
  );
}
