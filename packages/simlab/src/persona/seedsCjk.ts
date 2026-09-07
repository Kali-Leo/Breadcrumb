/**
 * Purpose: the non-Chinese CJK seed personas — Japanese
 * and Korean. Both share Chinese's space-free segmentation and full-width punctuation, so
 * they separate "the harness assumed CJK" from "the harness assumed Chinese": anything that
 * passes for 中文 but fails here is a language bug, not a script bug.
 *
 * Provenance: persona prose drafted with deepseek-v4-flash from an archetype
 * brief and reviewed by hand. Concept labels cross-checked against the Wiktionary extraction
 * in scripts/language-packs/.cache/interlingua/: ja 変数 → "variable", ja 関数 → "function".
 * Main exports: CJK_SEED_PERSONAS.
 */
import type { Persona } from "./schema";

export const CJK_SEED_PERSONAS: readonly Persona[] = [
  // Scenario: high driftTendency — the pipeline's tolerance for a loose conversation, in a
  // language where the tutor's own replies are also space-free.
  {
    id: "topic-hopping-dabbler-ja",
    language: "ja",
    name: "広く浅く学ぶ学習者",
    description: "私は本を最後まで読まず、基礎だけ学んだらすぐ別のトピックに飛び移ってしまう。",
    knowledge: {
      knownTopics: ["変数", "関数", "ループ"],
      misconceptions: ["いろいろなトピックに手を出せば上級者になれる。"],
      targetConcepts: ["機械学習", "ニューラルネットワーク"],
    },
    behavior: {
      typoRate: 0.2,
      codeSwitching: 0.35,
      driftTendency: 0.8,
      boredomThreshold: 0.7,
      confusionTendency: 0.3,
    },
  },
  // Scenario: the code-switching axis with a donor language that is not Chinese's neighbour —
  // Korean prose carrying English technical terms, which the extraction pipeline must survive.
  {
    id: "english-heavy-tech-learner-ko",
    language: "ko",
    name: "영어 혼용 학습자",
    description: "나는 프로그래밍을 공부할 때 technical term은 거의 다 영어로 그대로 쓰는 편이야.",
    knowledge: {
      knownTopics: ["변수", "함수", "조건문"],
      misconceptions: [],
      targetConcepts: ["자료구조", "시간 복잡도", "동적 계획법"],
    },
    behavior: {
      typoRate: 0.1,
      codeSwitching: 0.85,
      driftTendency: 0.25,
      boredomThreshold: 0.5,
      confusionTendency: 0.35,
    },
  },
];
