/**
 * Purpose: a minimal, schema-valid CompanionCard fixture shared by companion desktop tests —
 * avoids repeating the same Character Card V2 object literal across test files.
 * Main exports: sampleCompanionCard.
 */
import type { CompanionCard } from "@breadcrumb/plugin-companion";

export function sampleCompanionCard(): CompanionCard {
  return {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "Shichimi",
      description: "一位年轻的求教者。",
      personality: "真诚好问,一次只问一个问题。",
      scenario: "她正在向学习者请教。",
      first_mes: "我是 Shichimi。",
      mes_example: "x",
      creator_notes: "y",
      tags: ["breadcrumb"],
      creator: "Breadcrumb",
      character_version: "1.0.0",
      extensions: {
        breadcrumb: {
          role: "student",
          competenceNote: "低于学习者;只知道被教过的内容",
          knowledgeBoundary: [],
        },
      },
    },
  };
}
