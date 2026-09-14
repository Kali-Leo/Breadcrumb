/**
 * Purpose: runs the first launch — the opening slides, once — and nothing after: from the
 * moment they close, each feature introduces itself where it is (FeatureHintHost), and this
 * component renders nothing again.
 *
 * Kept out of App.tsx so the shell stays a shell: App renders this and hands it the one thing
 * only App can do, which is switching views.
 *
 * The demo module is reached through import() rather than a top-level import: it seeds three
 * months of a learner's history, and none of that code has any business being fetched by
 * someone who is not asking for it.
 * Main exports: OnboardingHost.
 */
import { useCallback, useEffect, useState } from "react";
import { useChatStore } from "../../stores/chatStore";
import { useKnowledgeStore } from "../../stores/knowledgeStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { WelcomeSlides } from "./WelcomeSlides";

/** "idle" is the state before settings have loaded — which is every first render. Deciding
 * between the slides and done at that moment would always decide "done", because `seen`
 * cannot be known until the database has answered. */
type Phase = "idle" | "slides" | "done";

export type OnboardingView = "chat" | "map" | "vocab" | "discovery" | "settings";

interface OnboardingHostProps {
  /** False until settings have been read. Passed separately from `seen` on purpose: a single
   * combined flag is false both before the answer arrives and after a "no". */
  ready: boolean;
  /** True once the learner has been through this before. */
  seen: boolean;
  onNavigate(view: OnboardingView): void;
}

export function OnboardingHost({ ready, seen, onNavigate }: OnboardingHostProps) {
  const [phase, setPhase] = useState<Phase>("idle");

  // Settle out of "idle" only once the answer is actually known, and only once — a learner
  // who has just closed the slides must not be sent back to them by a later re-render.
  useEffect(() => {
    if (!ready) return;
    setPhase((current) => (current === "idle" ? (seen ? "done" : "slides") : current));
  }, [ready, seen]);

  const finish = useCallback(() => {
    void useSettingsStore.getState().markOnboardingSeen();
    setPhase("done");
    onNavigate("chat");
  }, [onNavigate]);

  const tryDemo = useCallback(async () => {
    const { installDemoData } = await import("../../lib/platform/demoData");
    await installDemoData();
    // Reload the stores that already read from the database, so the map, the trail and the
    // review panel show the demo learner without a restart.
    await useKnowledgeStore.getState().loadTree();
    await useChatStore.getState().loadFromDatabase();
    finish();
  }, [finish]);

  if (phase !== "slides") return null;
  return <WelcomeSlides onTryDemo={tryDemo} onDone={finish} />;
}
