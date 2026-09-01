/**
 * Purpose: bucket 1 of the demo seed's node landscape (spec 035 T7b) — 8 nodes with >= 4
 * spaced encounters ending very recently, so computeSettled/systemGauge see real
 * retention >= 0.9 and a healthy reencounter sample.
 * Main exports: MASTERED.
 */
import { ASTRO_ROOT, type ConceptSpec, JS_ROOT } from "./conceptSpecTypes";

export const MASTERED: readonly ConceptSpec[] = [
  {
    label: ASTRO_ROOT,
    domain: "astro",
    parentLabel: null,
    summary: "观测方法与测量工具的框架。",
    offsetsDays: [66, 51, 36, 21, 0],
  },
  {
    label: "恒星光谱分类",
    domain: "astro",
    parentLabel: ASTRO_ROOT,
    summary: "按谱线特征给恒星分类。",
    offsetsDays: [64, 49, 34, 19, 0],
  },
  {
    label: JS_ROOT,
    domain: "js",
    parentLabel: null,
    summary: "运行时调度代码执行的底层规则。",
    offsetsDays: [62, 47, 32, 17, 0],
  },
  {
    label: "视差测距法",
    domain: "astro",
    parentLabel: ASTRO_ROOT,
    summary: "用地球公转基线测算恒星距离。",
    offsetsDays: [60, 45, 30, 15, 3],
  },
  {
    label: "闭包与作用域链",
    domain: "js",
    parentLabel: JS_ROOT,
    summary: "函数保留其定义时的变量环境。",
    offsetsDays: [58, 43, 28, 13, 1],
  },
  {
    label: "系外行星凌日法",
    domain: "astro",
    parentLabel: ASTRO_ROOT,
    summary: "行星掠过恒星前方造成的掉光。",
    offsetsDays: [56, 41, 26, 11, 5],
  },
  {
    label: "事件循环与微任务",
    domain: "js",
    parentLabel: JS_ROOT,
    summary: "协调同步代码与微任务的执行顺序。",
    offsetsDays: [54, 39, 24, 9, 6],
  },
  {
    label: "Promise链式调用",
    domain: "js",
    parentLabel: JS_ROOT,
    summary: "用 then 串联多个异步步骤。",
    offsetsDays: [52, 37, 22, 10, 4],
  },
];
