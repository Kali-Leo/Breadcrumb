/**
 * Purpose: the single source of user-facing names for metering purposes (llm_calls.purpose)
 * — shared by the status bar breakdown and the billing settings page.
 * Main exports: PURPOSE_NAMES.
 */
export const PURPOSE_NAMES: Record<string, string> = {
  chat: "对话",
  "knowledge-tree": "知识树",
  trail: "对话摘要",
  factcheck: "事实核查",
  "knowledge-edges": "知识关系",
  interest: "兴趣画像",
  "self-report-mapping": "「我学过」识别",
  "goal-planning": "目标规划",
  // The ladder module was removed (2026-08-12); these two labels stay so historical
  // llm_calls rows still read as words instead of raw purpose keys.
  ladder: "排位榜",
  "ladder-naming": "排位起名",
  "compare-profile": "对比资料构建",
  "compare-align": "对比匹配",
  "map-naming": "地图起名",
  "diglot-weave": "语言学习·智能替换",
  "teach-quality": "讲解反馈",
  "companion-chat": "伙伴聊天",
  "companion-memory": "伙伴记忆",
  "companion-script": "伙伴预习",
  "focus-explain": "专注讲解",
  "term-marking": "生词标注",
  "discovery-cards": "发现页新卡片",
  "discovery-article": "发现页正文",
};
