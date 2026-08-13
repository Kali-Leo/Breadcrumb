/**
 * Purpose: bucket 3 of the demo seed's node landscape (spec 035 T7b) — 8 nodes met for the
 * first time within the last two weeks, one of them today, feeding dailyBite/smallWins.
 * Main exports: FRESH.
 */
import { ASTRO_ROOT, type ConceptSpec, JS_ROOT } from "./conceptSpecTypes";

export const FRESH: readonly ConceptSpec[] = [
  {
    label: "引力透镜",
    domain: "astro",
    parentLabel: ASTRO_ROOT,
    summary: "大质量天体弯曲背景光路径的现象。",
    offsetsDays: [0],
  },
  {
    label: "防抖与节流",
    domain: "js",
    parentLabel: JS_ROOT,
    summary: "限制高频事件触发频率的两种手法。",
    offsetsDays: [1],
  },
  {
    label: "白矮星",
    domain: "astro",
    parentLabel: ASTRO_ROOT,
    summary: "恒星耗尽核燃料后的致密残骸。",
    offsetsDays: [3],
  },
  {
    label: "模块化与ES Modules",
    domain: "js",
    parentLabel: JS_ROOT,
    summary: "用 import/export 组织依赖关系。",
    offsetsDays: [5],
  },
  {
    label: "中子星",
    domain: "astro",
    parentLabel: ASTRO_ROOT,
    summary: "超新星爆发后留下的致密星体。",
    offsetsDays: [6],
  },
  {
    label: "递归与调用栈",
    domain: "js",
    parentLabel: JS_ROOT,
    summary: "函数调用自身,依赖调用栈保存状态。",
    offsetsDays: [9],
  },
  {
    label: "宇宙微波背景辐射",
    domain: "astro",
    parentLabel: ASTRO_ROOT,
    summary: "大爆炸残留的均匀微波辐射。",
    offsetsDays: [11],
  },
  {
    label: "正则表达式捕获组",
    domain: "js",
    parentLabel: JS_ROOT,
    summary: "用括号在正则里截取匹配子串。",
    offsetsDays: [13],
  },
];
