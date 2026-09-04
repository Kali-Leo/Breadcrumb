/**
 * Purpose: the four questions the first-steps checklist ticks off, each answered from real
 * state rather than from anything the card remembers about itself. Split out of
 * OnboardingChecklist so that file is about the card and this one is about the answers.
 * Main exports: ChecklistState, useChecklistState.
 */
import { useEffect, useState } from "react";
import { getRepos } from "../../lib/platform/db";
import { useSettingsStore } from "../../stores/settingsStore";

export interface ChecklistState {
  connected: boolean;
  asked: boolean;
  sawMap: boolean;
  demoInstalled: boolean;
}

/** The demo module is reached through import(), for the reason OnboardingHost gives. */
export function useChecklistState(sawMap: boolean): ChecklistState {
  const apiConfig = useSettingsStore((state) => state.apiConfig);
  // A saved key is not a connection. This item used to tick the moment the box had text in
  // it, which is how someone ends up with a green tick and an app that cannot reach anything;
  // it now waits for settings' 测试连接 to have actually got an answer out of the service.
  const apiConnectionOk = useSettingsStore((state) => state.apiConnectionOk);
  const [state, setState] = useState<ChecklistState>({
    connected: false,
    asked: false,
    sawMap: false,
    demoInstalled: false,
  });

  useEffect(() => {
    void (async () => {
      const { hasDemoData } = await import("../../lib/platform/demoData");
      const repos = await getRepos();
      const conversations = await repos.conversations.listRecentFirst();
      // Demo conversations do not count as having asked anything — the point of the item is
      // that the learner has talked to it themselves.
      const own = conversations.filter((conversation) => !conversation.id.startsWith("demo-"));
      setState({
        connected: apiConfig !== null && apiConfig.apiKey.length > 0 && apiConnectionOk,
        asked: own.length > 0,
        sawMap,
        demoInstalled: await hasDemoData(),
      });
    })();
  }, [apiConfig, apiConnectionOk, sawMap]);

  return state;
}
