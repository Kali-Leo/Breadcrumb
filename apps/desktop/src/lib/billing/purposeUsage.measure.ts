/**
 * Purpose: measures what one call of each metered LLM purpose actually sends and receives,
 * by running the REAL prompt builders over the shared fixture scenario and pairing each with
 * a realistic reply of the shape its Zod schema demands. This is where the numbers in
 * core-llm's purpose catalogue come from; purposeUsage.test.ts re-runs it so the catalogue
 * cannot silently drift away from the prompts.
 *
 * Input tokens are exact in the sense that they are the real prompt text. Output tokens are
 * a realistic sample, not a ceiling: schemas here cap replies well above what a typical
 * round produces, and costing every call at its cap would overstate spend rather than
 * describe it. Both are converted with DeepSeek's published character ratios, which their
 * own docs call approximate — so these are estimates presented as estimates.
 *
 * Main exports: measurePurposeUsage, MeasuredPurpose.
 */

import { estimateMessageTokens, estimateTokens } from "@breadcrumb/core-llm";
import { buildTeachingSystemPrompt } from "@breadcrumb/core-teaching";
import { buildAlignmentJudgeMessages } from "@breadcrumb/feature-compare";
import { buildLlmRefineMessages } from "@breadcrumb/feature-diglot-weave";
import { buildTermMarkingMessages, buildWordExplainMessages } from "@breadcrumb/feature-explore";
import { buildClaimExtractionMessages } from "@breadcrumb/feature-factcheck";
import { buildEdgeJudgeMessages } from "@breadcrumb/feature-graph";
import { buildInterestMessages, buildSelfReportMessages } from "@breadcrumb/feature-interest";
import { buildExtractionMessages } from "@breadcrumb/feature-knowledge-tree";
import { buildContinentNamingMessages } from "@breadcrumb/feature-map";
import { buildGoalMappingMessages } from "@breadcrumb/feature-planner";
import { LONG_ANSWER, ROUND, treeLabels, treeNodes } from "./purposeUsage.fixtures";

export interface MeasuredPurpose {
  purpose: string;
  inputTokens: number;
  outputTokens: number;
}

/** A reply of the size this purpose really returns on an ordinary round, written out so its
 * tokens are counted rather than assumed. */
const REPLIES = {
  knowledgeTree: `{"nodes":[{"label":"导数的定义","summary":"用极限描述某一点上的瞬时变化率，绕开除以零。","parentLabel":"导数"},{"label":"平均变化率","summary":"一段区间上函数值改变量与自变量改变量之比。","parentLabel":"导数"}]}`,
  interest: `{"signals":[{"label":"导数的定义","curiosity":"strong","confusion":"medium","boredom":"none","confidence":"high","styles":["对比","形式化推导"]},{"label":"平均变化率","curiosity":"medium","confusion":"weak","boredom":"none","confidence":"medium","styles":["对比"]}]}`,
  // Ten pairs judged, the batch size the edge pipeline usually hands over.
  edges: `{"edges":[${Array.from(
    { length: 10 },
    (_, i) =>
      `{"pairId":"p${i}","relation":"${i % 3 === 0 ? "requires" : i % 3 === 1 ? "helps" : "unrelated"}","direction":${i % 3 === 0 ? '"aToB"' : "null"},"weight":${i % 3 === 1 ? '"medium"' : "null"},"confidence":0.8}`,
  ).join(",")}],"methodNodes":[],"adjacentConcepts":[]}`,
  selfReport: `{"mappings":[{"label":"集合","claimLevel":"learned"},{"label":"集合的基本运算","claimLevel":"learned"},{"label":"函数的概念","claimLevel":"familiar"}]}`,
  goalPlanning: `{"existing":["集合","函数的概念","导数"],"suggested":[${Array.from(
    { length: 12 },
    (_, i) =>
      `{"label":"目标所需知识点${i}","summary":"这个知识点是什么的一句话说明，写得像真的说明一样长。","requires":["导数"]}`,
  ).join(",")}]}`,
  factcheckClaims: `{"claims":[{"text":"导数定义为平均变化率在自变量增量趋于零时的极限","queries":["导数 定义 极限","derivative definition limit"]},{"text":"绝对值函数在原点不可导","queries":["绝对值函数 原点 不可导","absolute value function not differentiable at zero"]}]}`,
  compareAlign: `{"verdicts":[${Array.from(
    { length: 8 },
    (_, i) =>
      `{"verdict":"${i % 2 === 0 ? "same" : "different"}","confidence":"${i % 3 === 0 ? "high" : "medium"}","reason":"两者名称可以互换，指同一个概念。"}`,
  ).join(",")}]}`,
  mapNaming: `{"clusters":[{"id":"c0","name":"集合与函数"},{"id":"c1","name":"微分学"},{"id":"c2","name":"数列与极限"}]}`,
  termMarking: `{"terms":[{"term":"瞬时变化率"},{"term":"平均变化率"},{"term":"可导"}]}`,
  diglot: `{"words":[{"lemma":"变化","verdict":"keep","target":"change"},{"lemma":"极限","verdict":"retranslate","target":"limit"},{"lemma":"定义","verdict":"keep","target":"definition"}],"phrase":{"original":"无限接近","replacement":"approaches arbitrarily closely","gloss":"无限地靠近某个值"}}`,
  // Focus stations and chat replies are prose, not JSON — the answer itself is the output.
  focusExplain: LONG_ANSWER.slice(0, 420),
  chat: LONG_ANSWER,
} as const;

/** Ten candidate pairs, the batch the edge judge is normally handed. */
const edgePairs = Array.from({ length: 10 }, (_, index) => ({
  pairId: `p${index}`,
  nodeALabel: treeNodes[index]?.label ?? "导数",
  nodeASummary: treeNodes[index]?.summary ?? "",
  nodeBLabel: treeNodes[index + 10]?.label ?? "极限",
  nodeBSummary: treeNodes[index + 10]?.summary ?? "",
}));

const alignPairs = Array.from({ length: 8 }, (_, index) => ({
  itemKey: `item-${index}`,
  itemLabel: treeNodes[index]?.label ?? "集合",
  itemContext: "普通高中数学课程标准 · 必修第一册",
  nodeId: `n${index}`,
  nodeLabel: treeNodes[index + 3]?.label ?? "集合的含义",
  nodeSummary: treeNodes[index + 3]?.summary ?? "",
  similarity: 0.82,
}));

/** How many prior turns a mid-length conversation carries when a round is sent. Chat resends
 * its whole history, so this — not the system prompt — is what its input bill is made of. */
const CHAT_HISTORY_TURNS = 6;

/** Runs every measurable purpose over the fixture scenario. Purposes whose prompts are built
 * inside Tauri-coupled modules are absent rather than guessed at. */
export function measurePurposeUsage(): MeasuredPurpose[] {
  const chatHistory = Array.from({ length: CHAT_HISTORY_TURNS }, (_, index) =>
    index % 2 === 0
      ? { role: "user", content: ROUND.question }
      : { role: "assistant", content: ROUND.answer },
  );

  const measurements: [string, { role: string; content: string }[], string][] = [
    [
      "chat",
      [
        { role: "system", content: buildTeachingSystemPrompt() },
        ...chatHistory,
        { role: "user", content: ROUND.question },
      ],
      REPLIES.chat,
    ],
    [
      "knowledge-tree",
      buildExtractionMessages(treeNodes, ROUND.question, ROUND.answer),
      REPLIES.knowledgeTree,
    ],
    [
      "interest",
      buildInterestMessages(
        treeNodes.slice(0, 2).map((node) => ({ nodeId: node.id, label: node.label })),
        ROUND.question,
        ROUND.answer,
      ),
      REPLIES.interest,
    ],
    ["knowledge-edges", buildEdgeJudgeMessages(edgePairs, { casual: true }), REPLIES.edges],
    [
      "self-report-mapping",
      buildSelfReportMessages("我学过高中数学，集合和函数那部分比较熟", treeLabels),
      REPLIES.selfReport,
    ],
    ["goal-planning", buildGoalMappingMessages("通过考研数学一", treeLabels), REPLIES.goalPlanning],
    [
      "factcheck",
      buildClaimExtractionMessages(ROUND.question, ROUND.answer),
      REPLIES.factcheckClaims,
    ],
    ["compare-align", buildAlignmentJudgeMessages(alignPairs), REPLIES.compareAlign],
    [
      "map-naming",
      buildContinentNamingMessages([
        { id: "c0", memberLabels: treeLabels.slice(0, 8) },
        { id: "c1", memberLabels: treeLabels.slice(8, 15) },
        { id: "c2", memberLabels: treeLabels.slice(15, 21) },
      ]),
      REPLIES.mapNaming,
    ],
    [
      "term-marking",
      buildTermMarkingMessages(LONG_ANSWER, treeLabels.slice(0, 20), treeLabels.slice(20, 26)),
      REPLIES.termMarking,
    ],
    [
      "diglot-weave",
      buildLlmRefineMessages({
        sourceLang: "中文",
        targetLang: "English",
        content: ROUND.answer.slice(0, 300),
        replacements: [
          { lemma: "变化", surface: "变化", target: "change" },
          { lemma: "极限", surface: "极限", target: "limit" },
          { lemma: "定义", surface: "定义", target: "definition" },
        ],
      }),
      REPLIES.diglot,
    ],
    ["focus-explain", buildWordExplainMessages(LONG_ANSWER, "瞬时变化率"), REPLIES.focusExplain],
  ];

  return measurements.map(([purpose, messages, reply]) => ({
    purpose,
    inputTokens: estimateMessageTokens(messages),
    outputTokens: estimateTokens(reply),
  }));
}
