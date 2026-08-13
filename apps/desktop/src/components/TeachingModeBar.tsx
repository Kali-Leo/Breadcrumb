/**
 * Purpose: the slim explain-mode bar above the composer (spec 038 §2.2) — three-way
 * shared-control switch with one plain trade-off sentence per mode, no persuasion.
 * Main exports: TeachingModeBar.
 */
import type { TeachingMode } from "@breadcrumb/core-teaching";
import { useChatStore } from "../stores/chatStore";
import { useSettingsStore } from "../stores/settingsStore";

const MODES: { value: TeachingMode; label: string; hint: string }[] = [
  { value: "adaptive", label: "自动", hint: "按你对每个知识点的熟悉程度，在直给和引导之间调整" },
  {
    value: "direct",
    label: "直给",
    hint: "直接给完整答案，省时间；少了自己先试的环节，留存会打些折扣",
  },
  {
    value: "guided",
    label: "引导",
    hint: "先给提示让你自己走一步，记得更牢；想要结论时可随时切直给",
  },
];

/** Rendered only for plain 'chat' conversations — teach/companion sessions have their own
 * prompt regimes and a mode switch there would be a lie. */
export function TeachingModeBar() {
  const activeKind = useChatStore((state) => state.activeKind);
  const teachingMode = useSettingsStore((state) => state.teachingMode);
  const setTeachingMode = useSettingsStore((state) => state.setTeachingMode);
  if (activeKind !== "chat") return null;

  return (
    <div className="flex items-center gap-2 border-t border-stone-100 bg-white px-4 py-1 text-xs">
      <span className="text-stone-400">讲解</span>
      <div className="flex overflow-hidden rounded-full border border-stone-200">
        {MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            onClick={() => void setTeachingMode(mode.value)}
            className={`px-2 py-0.5 transition-colors ${
              teachingMode === mode.value
                ? "bg-amber-500 text-white"
                : "bg-white text-stone-500 hover:bg-stone-50"
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>
      <p className="truncate text-stone-400">
        {MODES.find((mode) => mode.value === teachingMode)?.hint}
      </p>
    </div>
  );
}
