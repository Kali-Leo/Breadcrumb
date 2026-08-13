/**
 * Purpose: pressure-lexicon gate over every user-visible research-task-platform string (spec
 * 036 acceptance) — RESEARCH_COPY's values plus the bundled demo task's display text must
 * scan clean against the pressure lexicon, and none of it may contain praise words.
 */
import { RESEARCH_COPY } from "@breadcrumb/plugin-research";
import { describe, expect, it } from "vitest";
import { findPressureLexiconHits, loadPressureLexicon } from "./pressureLexicon";

const PRAISE_WORDS = ["真棒", "太棒", "厉害", "加油", "优秀", "了不起", "真聪明"];

// The bundled demo task's user-visible strings (purpose, ethics note, display template
// text/labels) — kept in sync by hand with apps/desktop/src/lib/researchSampleTask.ts.
// simlab does not depend on the desktop app, so the strings are duplicated here rather
// than imported.
const DEMO_TASK_TEXT = [
  "这是内置的示例研究任务,用于演示研究课题平台的完整链路:项目方签名的任务在本地计算三项聚合统计,结果只增加,你可以随时删除。它不对应任何真实机构的数据需求。",
  "示例任务,无需伦理审查;真实任务的伦理审查备注会显示在这个位置。",
  "以下三项统计全部为本地聚合计算,只输出聚合结果,不包含任何单条记录。",
  "认识的概念数",
  "各概念相遇次数分布",
  "「每日相遇次数」与「每日织入词事件数」的相关系数",
];

describe("research task platform copy gates", () => {
  const lexicon = loadPressureLexicon();
  const allCopy = [...Object.values(RESEARCH_COPY), ...DEMO_TASK_TEXT];

  it("hits zero pressure-lexicon entries", () => {
    for (const text of allCopy) {
      expect(findPressureLexiconHits(text, lexicon)).toEqual([]);
    }
  });

  it("contains no praise words (plain statements only)", () => {
    for (const text of allCopy) {
      for (const praise of PRAISE_WORDS) {
        expect(text).not.toContain(praise);
      }
    }
  });
});
