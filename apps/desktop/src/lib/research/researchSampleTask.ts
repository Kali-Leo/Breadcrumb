/**
 * Purpose: the bundled demo research task — one project-signed task that
 * exercises the full pipeline end to end (three whitelisted stat calls, a matching display
 * template). Side effect: none, this is a static payload only.
 * Main exports: SIGNED_RESEARCH_TASKS, DEMO_RESEARCH_TASK_TEXT.
 */

// Signed with packages/feature-research/scripts/signResearchTask.mjs against
// RESEARCH_SIGNING_PRIVATE_KEY (dev key in .env); verifies against the public key baked
// into @breadcrumb/feature-research's taskSignature.ts. Every optional field on the payload
// is spelled out explicitly so the signed bytes never depend on Zod default-filling.
const DEMO_RESEARCH_TASK = {
  payload: {
    id: "breadcrumb-demo-task",
    institution: "Breadcrumb 项目组",
    title: "示例研究：概念接触与学习活跃度的关联",
    purpose:
      "内置的示例研究任务，用于演示研究课题平台的完整链路：项目方签名的任务在本机计算三项聚合统计。",
    ethicsNote: "真实任务的伦理审查备注会显示在此处。",
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
      { kind: "text", text: "以下三项统计均在本机聚合计算，只输出聚合结果。" },
      { kind: "stat", label: "认识的概念数", callIndex: 0 },
      { kind: "bars", label: "各概念的接触次数分布", callIndex: 1 },
      {
        kind: "stat",
        label: "「每天接触概念的次数」和「每天遇到外语词的次数」是否一起变化",
        callIndex: 2,
      },
    ],
    expiresAt: "2030-01-01",
  },
  signature:
    "80397e0770a3abe41e7c0ecadd75531774b9e7098d5c4f820ca84b5ea66ad16e25151edeeb266acd1edecda15a7e557f9ced6846298afb4fe7934562da5d380d",
};

/** The demo task's own user-visible text. It is *content*, not interface copy: the bytes are
 * covered by the publisher's signature, so it cannot be translated — a real task carries its
 * own wording in its own language. Exported so the copy gate can still scan it. */
export const DEMO_RESEARCH_TASK_TEXT: readonly string[] = [
  DEMO_RESEARCH_TASK.payload.title,
  DEMO_RESEARCH_TASK.payload.purpose,
  DEMO_RESEARCH_TASK.payload.ethicsNote,
  ...DEMO_RESEARCH_TASK.payload.display.flatMap((item) =>
    ["text" in item ? item.text : undefined, "label" in item ? item.label : undefined].filter(
      (value): value is string => typeof value === "string",
    ),
  ),
];

/** Raw candidates the executor validates and verifies itself — never trusted as-is. */
export const SIGNED_RESEARCH_TASKS: unknown[] = [DEMO_RESEARCH_TASK];
