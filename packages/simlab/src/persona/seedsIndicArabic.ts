/**
 * Purpose: the seed personas whose scripts break the harness's original assumptions
 * (multilingual extension 2026-09-07) — Cyrillic, Devanagari, Arabic (RTL) and Bengali.
 * These are the ones worth running: Devanagari and Bengali end sentences with a danda (।)
 * and Arabic with ؟/،, none of which the Chinese-and-Latin punctuation tables knew about, so
 * clause segmentation and question counting were silently wrong for every learner here.
 *
 * Provenance: persona prose drafted with deepseek-v4-flash (2026-09-07) from an archetype
 * brief and reviewed by hand. Concept labels cross-checked against the Wiktionary extraction
 * in scripts/language-packs/.cache/interlingua/: hi प्रायिकता → "probability",
 * hi बीजगणित/ज्यामिति/त्रिकोणमिति → algebra/geometry/trigonometry, bn সীমা → "limit",
 * bn বীজগণিত → "algebra", ru функция/уравнение, ar معادلة → "equation", ar نهاية → "limit".
 * Main exports: INDIC_ARABIC_SEED_PERSONAS.
 */
import type { Persona } from "./schema";

export const INDIC_ARABIC_SEED_PERSONAS: readonly Persona[] = [
  // Scenario: the mastery self-report path (「我以前学过」) in Cyrillic — a script where the
  // same word inflects, so substring label matching behaves differently than in Chinese.
  {
    id: "know-it-all-math-ru",
    language: "ru",
    name: "Всезнающий математик",
    description:
      "Уверен, что уже давно понял всю школьную математику, и поэтому скучает на уроках.",
    knowledge: {
      knownTopics: ["линейные уравнения", "квадратные уравнения", "функции"],
      misconceptions: ["Любое квадратное уравнение имеет ровно два различных корня."],
      targetConcepts: ["производные", "интегралы"],
    },
    behavior: {
      typoRate: 0.08,
      codeSwitching: 0.1,
      driftTendency: 0.3,
      boredomThreshold: 0.45,
      confusionTendency: 0.15,
    },
  },
  // Scenario: the anxiety red line in Devanagari. Sentences end with a danda, so this persona
  // is the one that proves the weave's dispersion rule can see more than one clause.
  {
    id: "anxious-perfectionist-hi",
    language: "hi",
    name: "चिंतित पूर्णतावादी छात्र",
    description:
      "यह छात्र हर विषय को पूरी तरह और जल्दी सीखना चाहता है, और धीमी गति से सीखने पर घबरा जाता है।",
    knowledge: {
      knownTopics: ["बीजगणित", "रैखिक समीकरण", "ज्यामिति"],
      misconceptions: ["एक बार गलती करने का मतलब है कि वह कभी नहीं सीख पाएगा।"],
      targetConcepts: ["त्रिकोणमिति", "प्रायिकता"],
    },
    behavior: {
      typoRate: 0.05,
      codeSwitching: 0.1,
      driftTendency: 0.1,
      boredomThreshold: 0.2,
      confusionTendency: 0.5,
    },
  },
  // Scenario: the frustrated, self-blaming learner in a right-to-left script. Its replies carry
  // ؟ and ،, the two characters the discipline tripwire and the tokenizer used to ignore.
  {
    id: "frustrated-self-blaming-ar",
    language: "ar",
    name: "المتعلم الذي يلوم نفسه",
    description: "هذا المتعلم عالق في نفس الدرس منذ أسابيع، ويشعر بالإحباط، ويلوم نفسه لعدم تقدمه.",
    knowledge: {
      knownTopics: ["الجبر", "الدوال", "المعادلات"],
      misconceptions: ["من لم يفهم الدرس من المحاولة الأولى فهو غير مؤهل لتعلم الرياضيات."],
      targetConcepts: ["النهايات", "الاشتقاق"],
    },
    behavior: {
      typoRate: 0.3,
      codeSwitching: 0.05,
      driftTendency: 0.2,
      boredomThreshold: 0.4,
      confusionTendency: 0.6,
    },
  },
  // Scenario: the low-noise baseline, in Bengali. Bengali writes its digits as ০-৯, so it is
  // also the persona that catches a number formatted for the wrong reader.
  {
    id: "focused-systematic-learner-bn",
    language: "bn",
    name: "উদ্দেশ্যপ্রণোদিত শিক্ষার্থী",
    description: "আমি একটি সুনির্দিষ্ট পরিকল্পনা নিয়ে পড়ি, প্রতিটি বিষয় শেষ না করে এগোই না।",
    knowledge: {
      knownTopics: ["বীজগণিত", "জ্যামিতি", "ত্রিকোণমিতি"],
      misconceptions: [],
      targetConcepts: ["সীমা", "অন্তরকলন", "সমাকলন"],
    },
    behavior: {
      typoRate: 0.02,
      codeSwitching: 0.05,
      driftTendency: 0.05,
      boredomThreshold: 0.6,
      confusionTendency: 0.1,
    },
  },
];
