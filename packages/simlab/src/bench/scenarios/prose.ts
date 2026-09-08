/**
 * Purpose: bench scenarios for the three purposes whose output is prose, not JSON — `chat`
 * (the study companion answering a real exchange), `companion-chat` (one of the three
 * authored cast members answering the same thing) and `focus-explain` (a focus station
 * explaining one word out of an answer).
 *
 * Every model sees the identical batch: the same conversations, in the same eleven languages,
 * with the same shipped system prompts. There is no right answer to compare against, so these
 * are scored by simlab's mechanical judges (see scoring/proseJudge.ts) plus similarity to the
 * reference model's reply.
 *
 * Main exports: chatScenarios, companionChatScenarios, focusExplainScenarios.
 */
import type { ChatMessage } from "@breadcrumb/core-llm";
import { TEACHING_CONTRACT_BASE } from "@breadcrumb/core-teaching";
import { demoTextFor } from "@breadcrumb/demo-seed";
import { type CompanionCard, loadCompanionCards } from "@breadcrumb/feature-companion";
import { buildWordExplainMessages } from "@breadcrumb/feature-explore";
import { BENCH_LANGUAGES, demoConcepts, demoLongAnswer, demoRounds } from "../demoPool";
import { type BenchScenario, proseScenario } from "../scenarioTypes";

/**
 * Mirrors apps/desktop's buildCompanionChatSystemPrompt. It cannot be imported: that function
 * lives inside a Tauri-coupled module (settings store, repositories), which is also why
 * `companion-chat` has no measured row in the purpose catalogue. The card fields and the tone
 * sentences are the shipped ones, read from the same authored cards the app loads.
 */
function companionSystemPrompt(card: CompanionCard): string {
  const { name, description, personality, scenario } = card.data;
  const competenceNote = card.data.extensions.breadcrumb.competenceNote;
  return (
    `你是 ${name}。${description}${personality}${scenario}你与学习者的水平关系:${competenceNote}。` +
    "你是明示的 AI 学习伙伴,被问起是不是 AI 时如实承认。语气平实,不评判、不夸赞、不施压;" +
    "告别时就平静地告别,不做任何挽留或追问。"
  ).trim();
}

/** Three conversation states per language: a cold open, a follow-up two turns in, and the
 * same for the JavaScript conversation — the shapes an ordinary session actually passes
 * through. */
function historiesOf(language: string): { history: ChatMessage[]; concepts: string[] }[] {
  const text = demoTextFor(language);
  const rounds = demoRounds(language);
  const [a0, a1, a2] = text.astroMessages;
  const [j0, j1, j2] = text.jsMessages;
  return [
    { history: [{ role: "user", content: a0 }], concepts: rounds[0]?.concepts ?? [] },
    {
      history: [
        { role: "user", content: a0 },
        { role: "assistant", content: a1 },
        { role: "user", content: a2 },
      ],
      concepts: rounds[1]?.concepts ?? [],
    },
    {
      history: [
        { role: "user", content: j0 },
        { role: "assistant", content: j1 },
        { role: "user", content: j2 },
      ],
      concepts: rounds[4]?.concepts ?? [],
    },
  ];
}

export function chatScenarios(): BenchScenario[] {
  const scenarios: BenchScenario[] = [];
  for (const language of BENCH_LANGUAGES) {
    historiesOf(language).forEach((sample, slot) => {
      scenarios.push(
        proseScenario({
          purpose: "chat",
          id: `chat/${language}/${slot}`,
          language,
          messages: [{ role: "system", content: TEACHING_CONTRACT_BASE }, ...sample.history],
          targetConcepts: sample.concepts,
        }),
      );
    });
  }
  return scenarios;
}

export function companionChatScenarios(): BenchScenario[] {
  const cards = loadCompanionCards();
  const scenarios: BenchScenario[] = [];
  BENCH_LANGUAGES.forEach((language, languageIndex) => {
    const samples = historiesOf(language);
    cards.forEach((card, cardIndex) => {
      // Each card meets a different conversation state, rotated by language, so no card is
      // permanently scored on the easiest opening.
      const sample = samples[(languageIndex + cardIndex) % samples.length];
      if (sample === undefined) return;
      scenarios.push(
        proseScenario({
          purpose: "companion-chat",
          id: `companion-chat/${language}/${card.data.name}`,
          language,
          messages: [{ role: "system", content: companionSystemPrompt(card) }, ...sample.history],
          targetConcepts: sample.concepts,
        }),
      );
    });
  });
  return scenarios;
}

/** The word a focus station is opened on: a concept the answer actually contains, so the
 * station has the context it is designed around rather than degrading to a bare lookup. */
function wordInAnswer(answer: string, labels: readonly string[]): string | null {
  return labels.find((label) => answer.includes(label)) ?? null;
}

export function focusExplainScenarios(): BenchScenario[] {
  const scenarios: BenchScenario[] = [];
  for (const language of BENCH_LANGUAGES) {
    const labels = demoConcepts(language).map((concept) => concept.label);
    const answers = [
      demoLongAnswer(language, "astro"),
      demoLongAnswer(language, "js"),
      demoRounds(language)[5]?.answer ?? "",
    ];
    answers.forEach((answer, slot) => {
      // Falls back to the first label when the answer names none verbatim: that is the
      // product's own degraded path (map entry, reopened session), and it is worth measuring.
      const word = wordInAnswer(answer, labels) ?? labels[slot] ?? "";
      if (answer.length === 0 || word.length === 0) return;
      scenarios.push(
        proseScenario({
          purpose: "focus-explain",
          id: `focus-explain/${language}/${slot}`,
          language,
          messages: buildWordExplainMessages(answer, word),
          targetConcepts: [word],
        }),
      );
    });
  }
  return scenarios;
}
