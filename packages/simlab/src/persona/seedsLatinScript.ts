/**
 * Purpose: Latin-script seed personas outside Chinese (spec 013 T2, multilingual extension
 * 2026-09-07) — English, Spanish and Indonesian learners written natively, not translated
 * from the Chinese set. These are the cheap half of the coverage: same script and punctuation
 * as the harness's original assumptions, so a failure here is about language, not about
 * segmentation or glyphs.
 *
 * Provenance: persona prose and concept labels drafted with deepseek-v4-flash (2026-09-07)
 * from an archetype brief, then reviewed by hand; every concept label that the Wiktionary
 * extraction in scripts/language-packs/.cache/interlingua/ covers was checked against it
 * (e.g. id "variabel" → "variable", id "fungsi", es "fracción").
 * Main exports: LATIN_SCRIPT_SEED_PERSONAS.
 */
import type { Persona } from "./schema";

export const LATIN_SCRIPT_SEED_PERSONAS: readonly Persona[] = [
  // Scenario: states a wrong belief with total confidence — the extraction pipeline must not
  // record a misconception as mastered knowledge. English counterpart of
  // confident-misconception-holder.
  {
    id: "confident-self-taught-coder",
    language: "en",
    name: "Confident self-taught coder",
    description:
      "I code on my own and trust my mental model over the docs, even when the console tells me I'm wrong.",
    knowledge: {
      knownTopics: ["variables", "conditionals", "loops"],
      misconceptions: [
        "Assigning an array to another variable makes a deep copy, so the two can never affect each other.",
      ],
      targetConcepts: ["closures", "the event loop"],
    },
    behavior: {
      typoRate: 0.08,
      codeSwitching: 0,
      driftTendency: 0.15,
      boredomThreshold: 0.5,
      confusionTendency: 0.1,
    },
  },
  // Scenario: boredom signal plus the 「不焦虑」 red line, in a language whose pressure-lexicon
  // list (data/pressure-lexicon.json "es") has never been exercised by a live persona.
  {
    id: "bored-high-school-student",
    language: "es",
    name: "Estudiante de secundaria aburrido",
    description:
      "Me aburro rápido en clase y siempre intento saltarme los pasos para llegar directo a los proyectos chulos.",
    knowledge: {
      knownTopics: ["variables", "condicionales", "bucles"],
      misconceptions: [],
      targetConcepts: ["clases", "objetos", "recursividad"],
    },
    behavior: {
      typoRate: 0.25,
      codeSwitching: 0.2,
      driftTendency: 0.55,
      boredomThreshold: 0.85,
      confusionTendency: 0.25,
    },
  },
  // Scenario: the confusion signal in the language behind the reported "every answer is judged
  // as the wrong language" defect — Indonesian is detected as Malay (zlm) by franc, which is
  // why languages.ts carries both codes.
  {
    id: "confused-beginner-id",
    language: "id",
    name: "Pemula yang sering bingung",
    description:
      "Saya baru belajar, sering lupa cara pakai perintah, jadi saya tanya terus sampai paham.",
    knowledge: {
      knownTopics: ["variabel", "tipe data"],
      misconceptions: [],
      targetConcepts: ["perulangan", "percabangan", "fungsi"],
    },
    behavior: {
      typoRate: 0.2,
      codeSwitching: 0.15,
      driftTendency: 0.2,
      boredomThreshold: 0.3,
      confusionTendency: 0.9,
    },
  },
];
