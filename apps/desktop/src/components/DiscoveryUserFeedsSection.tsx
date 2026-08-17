/**
 * Purpose: the settings section for feeds the reader adds themselves (spec 053 §8) — paste an
 * address, see the list, remove one. Anything that is not a usable address is refused with a
 * plain line instead of being stored and silently never fetched.
 * Main exports: DiscoveryUserFeedsSection.
 */
import { useState } from "react";
import { useDiscoveryChannelSettingsStore } from "../stores/discoveryChannelSettingsStore";

const EXPLANATION =
  "很多网站会提供一个 RSS 地址，用来发布自己的更新。粘贴到这里，发现页就会把它的新内容一起取回来。";

export function DiscoveryUserFeedsSection() {
  const userFeedUrls = useDiscoveryChannelSettingsStore((state) => state.userFeedUrls);
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  async function add(): Promise<void> {
    const outcome = await useDiscoveryChannelSettingsStore.getState().addUserFeedUrl(draft);
    if (!outcome.ok) {
      setProblem(outcome.reason);
      return;
    }
    setDraft("");
    setProblem(null);
  }

  return (
    <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
      <div>
        <h3 className="font-medium text-stone-700">自己添加的订阅源</h3>
        <p className="text-sm text-stone-500">{EXPLANATION}</p>
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setProblem(null);
          }}
          placeholder="粘贴一个 RSS 地址"
          className="w-full rounded-xl border border-stone-200 px-3 py-2 text-[15px] outline-none focus:border-amber-400"
        />
        <button
          type="button"
          onClick={() => void add()}
          className="shrink-0 rounded-xl bg-amber-500 px-4 py-2 text-white transition-colors hover:bg-amber-600"
        >
          添加
        </button>
      </div>
      {problem !== null && <p className="text-amber-700 text-sm">{problem}</p>}
      {userFeedUrls.length > 0 && (
        <ul className="space-y-1">
          {userFeedUrls.map((url) => (
            <li key={url} className="flex items-center gap-3 text-sm text-stone-600">
              <span className="min-w-0 flex-1 truncate">{url}</span>
              <button
                type="button"
                onClick={() =>
                  void useDiscoveryChannelSettingsStore.getState().removeUserFeedUrl(url)
                }
                className="shrink-0 rounded-lg px-2 py-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
              >
                移除
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
