/**
 * Purpose: the bundled demo research task (spec 036 #6) — one project-signed task that
 * exercises the full pipeline end to end (three whitelisted stat calls, a matching display
 * template). Side effect: none, this is a static payload only.
 * Main exports: SIGNED_RESEARCH_TASKS.
 */

// Signed with packages/plugin-research/scripts/signResearchTask.mjs against
// RESEARCH_SIGNING_PRIVATE_KEY (dev key in .env); verifies against the public key baked
// into @breadcrumb/plugin-research's taskSignature.ts. Every optional field on the payload
// is spelled out explicitly so the signed bytes never depend on Zod default-filling.
const DEMO_RESEARCH_TASK = {
  payload: {
    id: "breadcrumb-demo-task",
    institution: "Breadcrumb 项目组",
    title: "示例研究:相遇分布与学习活跃度关联",
    purpose:
      "这是内置的示例研究任务,用于演示研究课题平台的完整链路:项目方签名的任务在本地计算三项聚合统计,结果只增加,你可以随时删除。它不对应任何真实机构的数据需求。",
    ethicsNote: "示例任务,无需伦理审查;真实任务的伦理审查备注会显示在这个位置。",
    calls: [
      { fn: "count", metric: "concepts_known" },
      { fn: "histogram", metric: "encounters_per_node", bucketCount: 6 },
      {
        fn: "correlation",
        xMetric: "daily_encounters",
        yMetric: "daily_word_events",
        windowDays: 60,
      },
    ],
    display: [
      { kind: "text", text: "以下三项统计全部为本地聚合计算,只输出聚合结果,不包含任何单条记录。" },
      { kind: "stat", label: "认识的概念数", callIndex: 0 },
      { kind: "bars", label: "各概念相遇次数分布", callIndex: 1 },
      { kind: "stat", label: "「每日相遇次数」与「每日织入词事件数」的相关系数", callIndex: 2 },
    ],
    expiresAt: "2030-01-01",
  },
  signature:
    "30161b2a0d2d46355bd7a7e9827ac5d571390a923897a3bc0ffe83c5275efbd4e15df5a0ee77d6a0b76625d4b3a400c2bf08f9b5f0b2124f75a8bbdd2721440f",
};

/** Raw candidates the executor validates and verifies itself — never trusted as-is. */
export const SIGNED_RESEARCH_TASKS: unknown[] = [DEMO_RESEARCH_TASK];
