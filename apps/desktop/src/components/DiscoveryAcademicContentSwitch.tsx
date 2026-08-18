/**
 * Purpose: the 学术内容 switch on the discovery page (spec 054, Leo's seventh point, placed where
 * he said to put it: 「学术内容开关在切换到专业模式后会显示，显示在发现页面」). It is subordinate to
 * the 休闲｜专业 pill in every sense — it stands next to it, it is a plain switch rather than a
 * third pill, and it is only on screen while 专业 is chosen, because in 休闲 there is nothing for
 * it to decide.
 * Main exports: DiscoveryAcademicContentSwitch, ACADEMIC_CONTENT_LABEL, ACADEMIC_CONTENT_HINT.
 */

import { useDiscoveryChannelSettingsStore } from "../stores/discoveryChannelSettingsStore";
import { useDiscoveryStore } from "../stores/discoveryStore";
import { Toggle } from "./SettingsToggle";

export const ACADEMIC_CONTENT_LABEL = "学术内容";
/** Says what the switch does in one sentence, in the words the grid itself uses for these
 * cards. The mechanism behind it — that papers skip the language filter — stays under water. */
export const ACADEMIC_CONTENT_HINT = "打开时，发现页里会有论文。";

export function DiscoveryAcademicContentSwitch() {
  const mode = useDiscoveryChannelSettingsStore((state) => state.feedMode);
  const enabled = useDiscoveryChannelSettingsStore((state) => state.academicContentEnabled);

  if (mode !== "professional") return null;

  async function toggle(): Promise<void> {
    await useDiscoveryChannelSettingsStore.getState().setAcademicContentEnabled(!enabled);
    await useDiscoveryStore.getState().redrawFeed();
  }

  return (
    <div className="flex items-center gap-2 text-stone-500 text-xs" title={ACADEMIC_CONTENT_HINT}>
      <span>{ACADEMIC_CONTENT_LABEL}</span>
      <Toggle on={enabled} onClick={() => void toggle()} label={ACADEMIC_CONTENT_LABEL} />
    </div>
  );
}
