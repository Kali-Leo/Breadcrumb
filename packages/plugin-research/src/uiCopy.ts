/**
 * Purpose: every user-visible string of the research task platform in one place (spec 036) —
 * plain statements only (product principle 1: no praise, no performed warmth, no guilt-trip
 * retention); simlab scans this module against the pressure lexicon and a praise-word blacklist.
 * Main exports: RESEARCH_COPY.
 */

export const RESEARCH_COPY = {
  panelTitle: "🔬 研究课题平台",
  panelIntro:
    "这里的统计结果都是这台电脑自己算出来的;研究任务经过审查、来源可查,数据不会自动离开这台设备,也不产生任何费用。",
  offNotice: "研究任务已关闭:不会再运行新的任务。已有结果仍然保留,可以逐条查看或删除。",
  loading: "加载中…",
  emptyTitle: "还没有研究结果",
  emptyHint: "应用空闲时会本地计算已验签的研究任务,算完会出现在这里。",

  cardInstitutionLabel: "机构",
  cardPurposeLabel: "研究目的",
  cardEthicsLabel: "伦理备注",
  cardComputedAtLabel: "计算时间",

  deleteAction: "删除此结果",
  deleteConfirmPrompt: "删除后这条结果不可恢复,确认删除?",
  deleteConfirmAction: "确认删除",
  deleteCancelAction: "取消",

  settingsRowTitle: "🔬 研究课题平台",
  settingsRowHint: "在本地运行经审查的研究任务并展示结果;数据不会自动离开设备,也不产生费用",

  /** Shown once, the moment the user turns the switch off — spec 036's four required
   * elements (what it does / data never leaves automatically / value to research / what
   * turning it off changes), stated plainly with no guilt-trip retention and no praise. */
  closeConfirmTitle: "关闭研究课题平台",
  closeConfirmWhatItDoes:
    "研究课题平台在本地运行经审查、经项目方签名的研究任务,把统计结果算出来并展示给你。",
  closeConfirmDataStaysLocal: "全部计算在本地完成,数据不会自动离开这台设备。",
  closeConfirmResearchValue:
    "这类本地聚合统计,是研究者了解学习规律、且不需要收集个人数据的少数途径之一,对条件有限地区的教育研究有实际价值。",
  closeConfirmWhatChanges:
    "关闭后不会再运行任何研究任务,也不会再询问是否关闭。已有结果不受影响,仍可在面板中查看或删除。",
  closeConfirmAction: "确认关闭",
  closeCancelAction: "取消",
} as const;
