/**
 * Purpose: the kingdom card's two outward actions — the state-worded main action (open a
 * teach-back for a done concept, otherwise go straight into focus mode with the AI already
 * teaching) and the jump back to where a concept was first met.
 * Main exports: startKingdomMainAction, goToKingdomOrigin.
 */
import { COMPANION_COPY } from "@breadcrumb/feature-companion";
import type { FrontierCandidate } from "@breadcrumb/feature-planner";
import { appEventBus, useChatStore } from "../../stores/chatStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { startTeachSession } from "../companion/teachActions";
import { startLearningForConcept } from "../focus/focusLearning";
import { getRepos } from "../platform/db";
import type { KingdomViewNode } from "./kingdomView";

export async function startKingdomMainAction(
  node: KingdomViewNode,
  primary: FrontierCandidate | null,
): Promise<void> {
  if (node.state === "done") {
    // 用户主动讲=讲给一位求教的同学听（Leo 铁律，spec 050 §9 的临时求教者形态）；
    // 对话在弹窗里进行，主界面不被占据。伙伴开关关闭时退回主界面对话形态。
    const conversationId = await startTeachSession(node.label);
    await useChatStore.getState().loadFromDatabase();
    if (useSettingsStore.getState().featureSwitches.companionChat) {
      appEventBus.emit("companion:openPopup", {
        conversationId,
        title: COMPANION_COPY.helperName(node.label),
      });
    } else {
      appEventBus.emit("app:navigateChat", { conversationId });
    }
    return;
  }
  // 开始学习/继续都直进专注模式，AI 立刻开讲（spec 050 §2）；退出后落回宫殿。
  const result = await startLearningForConcept(
    node.label,
    primary?.nodeId === node.id ? primary.reason.litPrerequisiteLabels : [],
    useSettingsStore.getState().featureSwitches.focusExplain,
  );
  if (result.mode === "chat") {
    await useChatStore.getState().loadFromDatabase();
    appEventBus.emit("app:navigateChat", { conversationId: result.conversationId });
  }
}

/**
 * Back to where this concept was first met (spec 005 §5, backlog "溯源跳转"): open that
 * conversation and scroll to the exchange itself. Silent when there is nothing to go back
 * to — the conversation was deleted, or the concept arrived without a message behind it.
 */
export async function goToKingdomOrigin(nodeId: string): Promise<void> {
  const repos = await getRepos();
  const sighting = await repos.nodeSightings.firstWithMessage(nodeId);
  if (sighting === null || sighting.message_id === null) return;
  await useChatStore.getState().openConversation(sighting.conversation_id);
  appEventBus.emit("app:navigateChat", { conversationId: sighting.conversation_id });
  appEventBus.emit("chat:locateMessage", { messageId: sighting.message_id });
}
