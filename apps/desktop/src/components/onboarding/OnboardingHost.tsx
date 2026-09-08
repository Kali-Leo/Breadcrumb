/**
 * Purpose: runs the newcomer experience and owns which phase it is in — the introduction,
 * then a checklist that outlives it, with the guided tour reachable from the checklist.
 *
 * The introduction no longer pulls anyone into the tour. It says what the app is and ends on
 * the chat page; from there each page explains itself when it is first opened (PageGuideHost).
 * The tour still exists for people who want to be walked through the running app, but it is
 * now something you choose — from this checklist or from settings — rather than the road out
 * of the welcome screen.
 *
 * Kept out of App.tsx so the shell stays a shell: App renders this and hands it the two things
 * only App can do, which are switching views and knowing which one is open.
 *
 * The demo module is reached through import() rather than a top-level import: it seeds three
 * months of a learner's history, and none of that code has any business being fetched by
 * someone who is not asking for it.
 *
 * Main exports: OnboardingHost.
 */
import { useCallback, useEffect, useState } from "react";
import { useChatStore } from "../../stores/chatStore";
import { useKnowledgeStore } from "../../stores/knowledgeStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { OnboardingChecklist } from "./OnboardingChecklist";
import { SpotlightTour } from "./SpotlightTour";
import { DEMO_TOUR_STEPS, TOUR_STEPS } from "./tourSteps";
import { WelcomeDialog } from "./WelcomeDialog";

/** "idle" is the state before settings have loaded — which is every first render. Deciding
 * between welcome and done at that moment would always decide "done", because `active` cannot
 * be true until the database has answered. */
type Phase = "idle" | "welcome" | "tour" | "checklist" | "done";

export type OnboardingView = "chat" | "map" | "vocab" | "discovery" | "settings";

interface OnboardingHostProps {
  /** False until settings have been read. Passed separately from `seen` on purpose: a single
   * combined flag is false both before the answer arrives and after a "no", and settling on
   * that would always settle on "done" during the very first render. */
  ready: boolean;
  /** True once the learner has been through this before. */
  seen: boolean;
  /** True once the first-steps checklist has been dismissed. It outlives the tour, so a
   * newcomer who quits after the introduction still gets it on their next launch. */
  checklistDismissed: boolean;
  onNavigate(view: OnboardingView): void;
  sawMap: boolean;
}

export function OnboardingHost({
  ready,
  seen,
  checklistDismissed,
  onNavigate,
  sawMap,
}: OnboardingHostProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [withDemo, setWithDemo] = useState(false);

  // Settle out of "idle" only once the answer is actually known, and only once — a learner
  // who finishes the tour must not be sent back to the welcome screen by a later re-render.
  useEffect(() => {
    if (!ready) return;
    setPhase((current) => {
      if (current !== "idle") return current;
      if (!seen) return "welcome";
      return checklistDismissed ? "done" : "checklist";
    });
  }, [ready, seen, checklistDismissed]);

  const finishIntro = useCallback(() => {
    void useSettingsStore.getState().markOnboardingSeen();
    setPhase("checklist");
    onNavigate("chat");
  }, [onNavigate]);

  const tryDemo = useCallback(async () => {
    const { installDemoData } = await import("../../lib/platform/demoData");
    await installDemoData();
    // Reload the stores that already read from the database, so the map, the trail and the
    // review panel show the demo learner without a restart.
    await useKnowledgeStore.getState().loadTree();
    await useChatStore.getState().loadFromDatabase();
    setWithDemo(true);
    finishIntro();
  }, [finishIntro]);

  if (phase === "idle" || phase === "done") return null;

  if (phase === "welcome") {
    return <WelcomeDialog onTryDemo={tryDemo} onDone={finishIntro} />;
  }

  if (phase === "tour") {
    return (
      <SpotlightTour
        steps={withDemo ? DEMO_TOUR_STEPS : TOUR_STEPS}
        onNavigate={onNavigate}
        onFinish={() => {
          setPhase("checklist");
          onNavigate("chat");
        }}
      />
    );
  }

  return (
    <OnboardingChecklist
      sawMap={sawMap}
      onReplayTour={() => {
        // The tour reads better over the example learner, but it has its own shorter route
        // for an empty app, so it starts either way rather than sending anyone back to the
        // introduction to install something first.
        void (async () => {
          const { hasDemoData } = await import("../../lib/platform/demoData");
          setWithDemo(await hasDemoData());
          setPhase("tour");
        })();
      }}
      onOpenSettings={() => onNavigate("settings")}
      onOpenMap={() => onNavigate("map")}
      onDismiss={() => {
        void useSettingsStore.getState().dismissChecklist();
        setPhase("done");
      }}
    />
  );
}
