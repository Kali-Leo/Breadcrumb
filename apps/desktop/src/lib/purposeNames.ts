/**
 * Purpose: the single source of user-facing names for metering purposes (llm_calls.purpose)
 * — shared by the status bar breakdown and the billing settings page.
 * Main exports: PURPOSE_NAMES.
 */
export const PURPOSE_NAMES: Record<string, string> = {
  chat: "对话",
  "knowledge-tree": "知识树",
  trail: "轨迹总结",
  factcheck: "求真核查",
  "knowledge-edges": "知识关系",
  interest: "兴趣画像",
  "self-report-mapping": "自报映射",
  "goal-planning": "目标规划",
  // The ladder module was removed (2026-08-12); these two labels stay so historical
  // llm_calls rows still read as words instead of raw purpose keys.
  ladder: "排位榜",
  "ladder-naming": "排位起名",
  "compare-profile": "对比画像",
  "compare-align": "对比对齐",
  "map-naming": "板块起名",
  "diglot-weave": "织入·智能替换",
  "teach-quality": "回讲判读",
  "companion-chat": "伙伴会话",
  "companion-memory": "伙伴记忆",
  "companion-script": "回讲脚本",
  "focus-explain": "专注解释",
};
