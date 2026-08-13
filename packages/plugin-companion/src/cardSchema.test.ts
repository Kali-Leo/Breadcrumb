/**
 * Purpose: unit tests for the Character Card V2 subset schema — the three bundled cards
 * parse, invalid cards fail with a readable message, and knowledge-boundary matching works.
 */
import { describe, expect, it } from "vitest";
import { matchKnowledgeBoundary, parseCompanionCard } from "./cardSchema";
import { loadCompanionCards } from "./cards/index";

const validCard = {
  spec: "chara_card_v2",
  spec_version: "2.0",
  data: {
    name: "Test Companion",
    description: "A test companion.",
    personality: "Curious.",
    scenario: "Testing.",
    first_mes: "Hello.",
    mes_example: "<START>",
    creator_notes: "Test only.",
    tags: ["breadcrumb"],
    creator: "Breadcrumb",
    character_version: "1.0.0",
    extensions: {
      breadcrumb: {
        role: "peer",
        competenceNote: "on par with the learner",
        knowledgeBoundary: [{ keys: ["closure", "闭包"], content: "闭包捕获的是变量本身。" }],
      },
    },
  },
};

describe("companion card schema", () => {
  it("parses all three bundled cards", () => {
    const cards = loadCompanionCards();
    expect(cards).toHaveLength(3);
    const roles = cards.map((card) => card.data.extensions.breadcrumb.role);
    expect(roles).toEqual(["student", "peer", "mentor"]);
    const names = cards.map((card) => card.data.name);
    expect(names).toEqual(["Shichimi", "Pepper", "Cumin"]);
  });

  it("accepts a well-formed minimal card", () => {
    expect(parseCompanionCard(validCard).data.name).toBe("Test Companion");
  });

  it("rejects a card with an invalid role", () => {
    const bad = {
      ...validCard,
      data: {
        ...validCard.data,
        extensions: { breadcrumb: { ...validCard.data.extensions.breadcrumb, role: "npc" } },
      },
    };
    expect(() => parseCompanionCard(bad)).toThrow(/role/);
  });

  it("rejects a card missing a required field", () => {
    const { first_mes: _omitted, ...dataWithoutFirstMes } = validCard.data;
    const bad = { ...validCard, data: dataWithoutFirstMes };
    expect(() => parseCompanionCard(bad)).toThrow(/first_mes/);
  });

  it("matches knowledge-boundary entries case-insensitively, in card order", () => {
    const card = parseCompanionCard(validCard);
    expect(matchKnowledgeBoundary(card, "let's talk about Closure basics")).toEqual([
      "闭包捕获的是变量本身。",
    ]);
    expect(matchKnowledgeBoundary(card, "今天聊聊闭包")).toEqual(["闭包捕获的是变量本身。"]);
    expect(matchKnowledgeBoundary(card, "今天聊聊递归")).toEqual([]);
  });
});
