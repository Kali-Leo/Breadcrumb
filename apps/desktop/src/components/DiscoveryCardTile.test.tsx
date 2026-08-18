// @vitest-environment jsdom
/**
 * Purpose: the card face, mounted for real (spec 054 §(b) and §(d)) — the parts that make a grid of
 * mixed content read as one grid. The picture area is the same 16:9 box whether or not a picture
 * exists, the title is cut at two lines, and the corner mark ships two texts: one drawn for the
 * eye and hidden from assistive software, one written only for it. Reading "约 8 分钟" aloud is the
 * failure this pair exists to prevent.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../stores/discoveryStore", () => ({
  useDiscoveryStore: {
    getState: () => ({
      recordImpression: vi.fn(),
      dislikeCard: vi.fn(),
      saveCard: vi.fn(),
      unsaveCard: vi.fn(),
    }),
  },
}));

vi.mock("../stores/discoveryChannelSettingsStore", () => ({
  useDiscoveryChannelSettingsStore: <Slice,>(
    select: (state: { dataSaverEnabled: boolean }) => Slice,
  ) => select({ dataSaverEnabled: false }),
}));

const { DiscoveryCardTile } = await import("./DiscoveryCardTile");

class SilentIntersectionObserver {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
    SilentIntersectionObserver;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Long enough for the estimate to have something honest to work from: 900 characters, which the
 * chosen speed turns into three minutes. */
const THREE_MINUTE_ARTICLE = "记忆宫殿的墙上写着一句话".repeat(75);

function makeCard(overrides: Partial<DiscoveryCardRow> = {}): DiscoveryCardRow {
  return {
    id: "card-1",
    title: "海马体在夜里做的事",
    hook: "睡眠时大脑重放白天的路线",
    topic_label: "少数派",
    source: "explore",
    body_md: null,
    embedding_json: null,
    batch_id: "batch-1",
    created_at: "2026-08-18T00:00:00.000Z",
    opened_at: null,
    source_id: "sspai",
    kind: "article",
    url: "https://sspai.com/post/1",
    cover_url: null,
    author: null,
    published_at: "2026-08-17T00:00:00.000Z",
    saved_at: null,
    quality_score: null,
    upstream_signal: null,
    media_url: null,
    ...overrides,
  };
}

function mount(card: DiscoveryCardRow): void {
  act(() => root.render(<DiscoveryCardTile card={card} onOpen={() => undefined} />));
}

function badge(): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-testid="discovery-media-badge"]');
}

function spokenTexts(): string[] {
  return [...container.querySelectorAll(".sr-only")].map((one) => one.textContent ?? "");
}

describe("the card's picture area", () => {
  it("keeps its 16:9 box and shows the type-toned panel when there is no picture", () => {
    mount(makeCard({ cover_url: null }));
    const placeholder = container.querySelector('[data-testid="discovery-cover-placeholder"]');
    expect(placeholder).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
    // The box is the same height whether a picture landed in it or not — the single biggest
    // reason a mixed feed used to look ragged.
    expect(container.querySelector(".pt-\\[56\\.25\\%\\]")).not.toBeNull();
  });

  it("puts a real picture in the same box", () => {
    mount(makeCard({ cover_url: "https://sspai.com/cover.jpg" }));
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://sspai.com/cover.jpg");
    expect(container.querySelector('[data-testid="discovery-cover-placeholder"]')).toBeNull();
    expect(container.querySelector(".pt-\\[56\\.25\\%\\]")).not.toBeNull();
  });
});

describe("the card's corner mark", () => {
  it("prints the reading time for the eye and spells it out for a screen reader", () => {
    mount(makeCard({ kind: "article", body_md: THREE_MINUTE_ARTICLE }));
    const mark = badge();
    expect(mark?.textContent).toContain("约 3 分钟");
    // A screen reader must never read the printed text: "约 3 分钟" would come out as the
    // characters, not as the sentence.
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
    expect(spokenTexts()).toContain("文章，大约 3 分钟");
  });

  it("says what a video is rather than inventing a running time", () => {
    mount(makeCard({ kind: "video", body_md: null }));
    expect(badge()?.textContent).toBe("视频");
    expect(spokenTexts()).toContain("视频");
    expect(badge()?.textContent).not.toMatch(/\d/);
  });

  it("says what a text is when there is not enough of it to time", () => {
    mount(makeCard({ kind: "paper", body_md: "摘要还没取回来" }));
    expect(badge()?.textContent).toBe("论文");
    expect(spokenTexts()).toContain("论文");
  });

  it("marks every kind in the same corner in the same shape", () => {
    for (const kind of ["video", "podcast", "article", "paper", "discussion"] as const) {
      mount(makeCard({ kind }));
      expect(badge()?.className).toContain("right-1");
      expect(badge()?.className).toContain("bottom-1");
    }
  });
});

describe("the card's text", () => {
  it("cuts the title at two lines and names the source above it", () => {
    mount(makeCard({ author: "张三" }));
    const title = [...container.querySelectorAll("p")].find(
      (one) => one.textContent === "海马体在夜里做的事",
    );
    expect(title?.className).toContain("line-clamp-2");
    expect(container.textContent).toContain("少数派 · 张三");
  });

  it("draws no picture area and no corner mark for a card from the retired pipeline", () => {
    mount(makeCard({ source_id: null, kind: null, url: null, cover_url: null }));
    expect(container.querySelector('[data-testid="discovery-cover-placeholder"]')).toBeNull();
    expect(badge()).toBeNull();
  });
});
