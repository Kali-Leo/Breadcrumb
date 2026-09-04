/**
 * Purpose: deleting a conversation while it is still streaming. The round used to keep
 * running against a row that no longer exists — burning tokens for an answer nobody can ever
 * read, and then broadcasting chat:responseFinished so extraction, naming and the map all
 * went looking for the deleted conversation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { beginStreamControl, endStreamControl } from "./chatStreamControl";

const remove = vi.fn(async () => {});
let removeGate: (() => void) | null = null;

vi.mock("../platform/db", () => ({
  getRepos: async () => ({
    conversations: {
      remove: (id: string) => {
        void id;
        remove();
        return new Promise<void>((resolve) => {
          removeGate = resolve;
        });
      },
    },
  }),
}));
vi.mock("../../stores/knowledgeStore", () => ({
  useKnowledgeStore: { getState: () => ({ loadTree: async () => {} }) },
}));
vi.mock("../../stores/memoryStore", () => ({
  useMemoryStore: { getState: () => ({ refresh: async () => {} }) },
}));

const { createConversationActions } = await import("./chatConversationActions");
type State = import("./chatConversationActions").ConversationSliceState;
await Promise.all([import("../../stores/knowledgeStore"), import("../../stores/memoryStore")]);

function actionsOverEmptyStore(): ReturnType<typeof createConversationActions> & {
  state: () => Record<string, unknown>;
} {
  let state: Record<string, unknown> = {
    conversations: [{ id: "conv-1" }],
    todayCost: new Map(),
    sessions: new Map([["conv-1", {}]]),
    activeConversationId: null,
    startNewConversation: () => undefined,
  };
  const actions = createConversationActions(
    (patch: Partial<State>) => {
      state = { ...state, ...patch };
    },
    () => state as unknown as State,
    () => undefined,
  );
  return Object.assign(actions, { state: () => state });
}

beforeEach(() => {
  remove.mockClear();
  removeGate = null;
});

describe("deleteConversation while a round is streaming", () => {
  it("aborts the conversation's in-flight stream", async () => {
    const controller = beginStreamControl("conv-1");
    if (controller === null) throw new Error("the round must have armed");
    const actions = actionsOverEmptyStore();

    const deleting = actions.deleteConversation("conv-1");
    await vi.waitFor(() => expect(remove).toHaveBeenCalled());

    expect(controller.signal.aborted).toBe(true);
    removeGate?.();
    await deleting;
    endStreamControl("conv-1", controller);
  });

  it("drops the session before the delete round-trips, so nothing broadcasts into a ghost", async () => {
    const controller = beginStreamControl("conv-2");
    if (controller === null) throw new Error("the round must have armed");
    const actions = actionsOverEmptyStore();

    const deleting = actions.deleteConversation("conv-1");
    await vi.waitFor(() => expect(remove).toHaveBeenCalled());

    expect((actions.state().sessions as Map<string, unknown>).has("conv-1")).toBe(false);
    removeGate?.();
    await deleting;
    endStreamControl("conv-2", controller);
  });
});
