/**
 * Purpose: the cross-language end-to-end invariants — drive the deterministic stand-in path
 * (fixed replies, no network, no API key) with NON-Chinese personas and check the things that
 * are only ever true by accident when every persona is Chinese.
 *
 * This is the class of test that was missing. Every existing runner test drives a Chinese
 * persona through Chinese fixtures, so a defect that only appears in another language — a
 * reply judged as the wrong language, a label that comes back in the wrong script, a
 * discipline rule that silently stops being enforced — could not be observed. The reported
 * "every Indonesian answer is judged as the wrong language" bug is exactly that shape, which
 * is why Indonesian is in here by name.
 */
import {
  checkReplyLanguage,
  formatCount,
  formatDate,
  type Language,
  languageOf,
  type ScriptFamily,
} from "@breadcrumb/core-i18n";
import { afterEach, describe, expect, it } from "vitest";
import { createTempDatabase, type TempDatabase } from "../db/sqliteClient";
import { findPressureLexiconHits, loadPressureLexicon } from "../judges/pressureLexicon";
import { countQuestions } from "../judges/teachingDiscipline";
import type { Persona } from "../persona/schema";
import { SEED_PERSONAS } from "../persona/seeds";
import { buildStudentSystemPrompt } from "../persona/studentPrompt";
import { runRoundPipeline } from "./pipeline";

let temp: TempDatabase | null = null;
afterEach(() => {
  temp?.close();
  temp = null;
});

const NON_CHINESE_PERSONAS = SEED_PERSONAS.filter((persona) => persona.language !== "zh-CN");

/** One range per script family, enough to tell "this label came back in the reader's script"
 * from "this label came back in Chinese because a prompt template was hard-coded". */
const SCRIPT_PATTERNS: Record<ScriptFamily, RegExp> = {
  latin: /\p{Script=Latin}/u,
  hanzi: /\p{Script=Han}/u,
  arabic: /\p{Script=Arabic}/u,
  devanagari: /\p{Script=Devanagari}/u,
  bengali: /\p{Script=Bengali}/u,
  ethiopic: /\p{Script=Ethiopic}/u,
  cyrillic: /\p{Script=Cyrillic}/u,
  kana: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u,
  hangul: /\p{Script=Hangul}/u,
};

function languageOfPersona(persona: Persona): Language {
  const language = languageOf(persona.language);
  if (language === null) throw new Error(`persona ${persona.id}: unknown language`);
  return language;
}

/** A tutor turn in the persona's own language, built from its own target concepts, plus two
 * questions closed with that language's question mark. */
const TUTOR_TURNS: Record<string, string> = {
  en: "A closure keeps the scope it was defined in. Does that match what you expected? Shall we try one?",
  es: "Una clase agrupa datos y comportamiento en un mismo lugar. ¿Te suena de algo? ¿Probamos una?",
  id: "Perulangan menjalankan blok yang sama berulang kali sampai syaratnya selesai. Apakah itu masuk akal? Mau coba satu?",
  ru: "Производная показывает скорость изменения функции в точке. Это похоже на то, что ты ожидал? Попробуем пример?",
  hi: "अवकलज बताता है कि कोई राशि कितनी तेज़ी से बदल रही है। क्या यह समझ आया? एक उदाहरण देखें?",
  ar: "النهاية تصف إلى أين تتجه الدالة قرب نقطة معينة، وهي أساس الاشتقاق؟ هل نجرب مثالا؟",
  bn: "সীমা বলে দেয় কোনো ফাংশন একটি বিন্দুর কাছে কোথায় যাচ্ছে। এটা কি বোঝা গেল? একটা উদাহরণ দেখব?",
  ja: "機械学習はデータから規則を見つける方法です。ここまでは大丈夫ですか？一つ試してみますか？",
  ko: "자료구조는 데이터를 어떻게 담을지 정하는 방법이에요. 여기까지 이해되셨나요? 하나 해볼까요?",
};

function tutorTurnFor(persona: Persona): string {
  const turn = TUTOR_TURNS[persona.language];
  if (turn === undefined) throw new Error(`no tutor turn for ${persona.language}`);
  return turn;
}

describe.each(NON_CHINESE_PERSONAS)("cross-language invariants — $id ($language)", (persona) => {
  const language = languageOfPersona(persona);
  const script = SCRIPT_PATTERNS[language.script];

  it("writes the persona's own text in the persona's own script", () => {
    expect(persona.name).toMatch(script);
    expect(persona.description).toMatch(script);
    for (const concept of persona.knowledge.targetConcepts) expect(concept).toMatch(script);
  });

  it("tells the simulated student which language to answer in", () => {
    const prompt = buildStudentSystemPrompt(persona);
    expect(prompt).toContain("【语言】");
    expect(prompt).toContain(language.endonym);
    expect(prompt).toContain(language.code);
  });

  it("does not judge a correct answer in this language as the wrong language", async () => {
    const verdict = await checkReplyLanguage(tutorTurnFor(persona), language);
    expect(verdict).not.toBe("differs");
  });

  it("counts the questions in a tutor turn written with this language's question mark", () => {
    expect(countQuestions(tutorTurnFor(persona))).toBe(2);
  });

  it("formats dates and counts in this reader's own conventions", () => {
    const day = new Date("2026-09-07T00:00:00.000Z");
    expect(formatDate(language.code, day)).not.toBe("");
    expect(formatCount(language.code, 12345)).not.toBe("");
    // Bengali writes its own digits; a hard-coded ASCII number would sit wrong beside it.
    if (language.code === "bn") expect(formatCount("bn", 12345)).toMatch(/[০-৯]/);
  });

  it("has a pressure-language list, so the anxiety red line is actually enforced here", () => {
    if (!language.shipped) return;
    const lexicon = loadPressureLexicon(language.code);
    expect(lexicon.length).toBeGreaterThan(0);
    const entry = lexicon[0];
    if (entry === undefined) throw new Error("empty lexicon");
    expect(findPressureLexiconHits(`... ${entry} ...`, lexicon)).toContain(entry);
  });

  it("keeps the extracted knowledge labels in the persona's language", async () => {
    temp = await createTempDatabase();
    const now = "2026-09-07T10:00:00.000Z";
    const conversationId = `conv-${persona.id}`;
    await temp.repos.conversations.create({
      id: conversationId,
      title: "t",
      created_at: now,
      updated_at: now,
      kind: "chat",
    });
    const label = persona.knowledge.targetConcepts[0];
    if (label === undefined) throw new Error("persona has no target concept");
    const answer = tutorTurnFor(persona);
    await temp.repos.messages.append({
      id: "msg-answer",
      conversation_id: conversationId,
      role: "assistant",
      content: answer,
      created_at: now,
      teaching_mode: null,
      parent_id: null,
    });

    const fetchImpl = (async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
      const systemPrompt = body.messages[0]?.content ?? "";
      if (systemPrompt.includes("知识结构提取器")) {
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  nodes: [{ label, summary: answer.slice(0, 40), parentLabel: null }],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 20, completion_tokens: 10 },
        });
      }
      return Response.json({
        choices: [
          { message: { content: JSON.stringify({ edges: [], methodNodes: [], signals: [] }) } },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      });
    }) as typeof fetch;

    const result = await runRoundPipeline({
      repos: temp.repos,
      conversationId,
      answerMessageId: "msg-answer",
      userQuestion: persona.description,
      assistantAnswer: answer,
      nowIso: now,
      llmConfig: {
        baseUrl: "https://api.example.com/v1",
        apiKey: "key",
        model: "test-model",
        fetchImpl,
      },
      recordCall: () => undefined,
      logStage: () => undefined,
    });

    expect(result.failures).toEqual([]);
    expect(result.newNodes.map((node) => node.label)).toEqual([label]);
    const persisted = await temp.repos.knowledgeNodes.listAll();
    expect(persisted.map((node) => node.label)).toEqual([label]);
    // The point of the whole file: what came back out is in the reader's script, and carries
    // no Chinese that a hard-coded prompt template could have leaked into it.
    for (const node of persisted) {
      expect(node.label).toMatch(script);
      if (language.script !== "hanzi" && language.script !== "kana") {
        expect(node.label).not.toMatch(/\p{Script=Han}/u);
      }
    }
  });
});

describe("the seed persona set as a whole", () => {
  it("covers every script family the app ships fonts for except Ethiopic", () => {
    const scripts = new Set(SEED_PERSONAS.map((persona) => languageOfPersona(persona).script));
    for (const script of [
      "latin",
      "hanzi",
      "arabic",
      "devanagari",
      "bengali",
      "cyrillic",
      "kana",
      "hangul",
    ] satisfies ScriptFamily[]) {
      expect(scripts).toContain(script);
    }
  });

  it("covers both text directions", () => {
    const directions = new Set(
      SEED_PERSONAS.map((persona) => languageOfPersona(persona).direction),
    );
    expect(directions).toEqual(new Set(["ltr", "rtl"]));
  });

  it("names a language every persona's own text can be checked against", () => {
    for (const persona of SEED_PERSONAS) expect(languageOf(persona.language)).not.toBeNull();
  });
});
