// @vitest-environment jsdom
/**
 * Purpose: the first-run panel, mounted for real — what it says, what a chip looks like before
 * anyone touches it, and what reaches discovery_events when the reader is done. The rows are the
 * contract the ordering layer reads (kind 'onboarding', sign of value_ms, topic_label = the
 * field's own name), so they are asserted through the real writing path, not a spy on it.
 */
import type { DiscoveryEventRow } from "@breadcrumb/core-db";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let eventRows: DiscoveryEventRow[] = [];
const dismissOnboarding = vi.fn(async () => undefined);
const refillPool = vi.fn(async () => undefined);

vi.mock("../lib/db", () => ({
  getRepos: async () => ({
    discovery: {
      insertEvent: async (row: DiscoveryEventRow) => {
        eventRows.push(row);
      },
    },
  }),
}));

vi.mock("../stores/discoveryChannelSettingsStore", () => ({
  useDiscoveryChannelSettingsStore: { getState: () => ({ dismissOnboarding }) },
}));

vi.mock("../stores/discoveryStore", () => ({
  useDiscoveryStore: { getState: () => ({ refillPool }) },
}));

const { ONBOARDING_FIELD_GROUPS, ONBOARDING_FIELDS } = await import("../lib/discoveryOnboarding");
const { DiscoveryOnboarding, ONBOARDING_HEADING, ONBOARDING_INTRO } = await import(
  "./DiscoveryOnboarding"
);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  eventRows = [];
  dismissOnboarding.mockClear();
  refillPool.mockClear();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(onDone: () => void = () => undefined): void {
  act(() => root.render(<DiscoveryOnboarding onDone={onDone} />));
}

function chipFor(field: string): HTMLButtonElement {
  const chip = [...container.querySelectorAll("button")].find((button) =>
    (button.getAttribute("aria-label") ?? "").startsWith(`${field}：`),
  );
  if (!chip) throw new Error(`no chip for ${field}`);
  return chip;
}

function clickTimes(field: string, times: number): void {
  for (let index = 0; index < times; index += 1) {
    act(() => chipFor(field).click());
  }
}

function buttonNamed(text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!button) throw new Error(`no button named ${text}`);
  return button;
}

async function clickAndSettle(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
  await act(async () => undefined);
}

describe("what the panel says", () => {
  it("asks in a few words and explains in one short sentence", () => {
    mount();
    expect(container.querySelector("h2")?.textContent).toBe("选择你感兴趣的领域");
    expect(ONBOARDING_HEADING).toBe("选择你感兴趣的领域");
    expect(ONBOARDING_INTRO).toBe("发现页会按这些给你推荐文章、视频和播客，不用选全。");
    const paragraphs = [...container.querySelectorAll("p")].map((p) => p.textContent);
    expect(paragraphs).toEqual([ONBOARDING_INTRO]);
  });

  it("shows every field once, under its group, and 完成 with 跳过", () => {
    mount();
    const groupNames = [...container.querySelectorAll("h3")].map((h3) => h3.textContent);
    expect(groupNames).toEqual(ONBOARDING_FIELD_GROUPS.map((group) => group.name));
    for (const field of ONBOARDING_FIELDS) expect(chipFor(field)).toBeTruthy();
    expect(buttonNamed("完成")).toBeTruthy();
    expect(buttonNamed("跳过")).toBeTruthy();
  });

  it("wears the position on the chip itself, 一般 included, so the states need no prose", () => {
    mount();
    const field = ONBOARDING_FIELDS[0] ?? "";
    expect(chipFor(field).textContent).toBe(`${field}一般`);
    clickTimes(field, 1);
    expect(chipFor(field).textContent).toBe(`${field}想看`);
    clickTimes(field, 1);
    expect(chipFor(field).textContent).toBe(`${field}不想看`);
    clickTimes(field, 1);
    expect(chipFor(field).textContent).toBe(`${field}一般`);
  });
});

describe("what the panel writes", () => {
  it("writes nothing at all when everything is left at 一般", async () => {
    const onDone = vi.fn();
    mount(onDone);
    await clickAndSettle(buttonNamed("完成"));
    expect(eventRows).toEqual([]);
    expect(dismissOnboarding).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("writes one row per field with an opinion, signed, under the field's own name", async () => {
    mount();
    clickTimes("历史", 1);
    clickTimes("游戏", 2);
    await clickAndSettle(buttonNamed("完成"));

    expect(eventRows.map((row) => [row.topic_label, row.kind, row.value_ms])).toEqual([
      ["历史", "onboarding", 1],
      ["游戏", "onboarding", -1],
    ]);
    // Neither row belongs to a card; the ordering layer reads them by topic_label alone.
    expect(eventRows.every((row) => row.card_id === "")).toBe(true);
  });

  it("asks for the restock that goes looking for what was just said", async () => {
    mount();
    clickTimes("历史", 1);
    await clickAndSettle(buttonNamed("完成"));
    expect(refillPool).toHaveBeenCalledWith({ forceRecall: true });
  });

  it("writes nothing and asks for nothing when the reader skips", async () => {
    const onDone = vi.fn();
    mount(onDone);
    clickTimes("历史", 1);
    await clickAndSettle(buttonNamed("跳过"));
    expect(eventRows).toEqual([]);
    expect(refillPool).not.toHaveBeenCalled();
    expect(dismissOnboarding).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });
});
