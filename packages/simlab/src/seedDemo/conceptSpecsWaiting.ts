/**
 * Purpose: bucket 2 of the demo seed's node landscape (spec 035 T7b) — 8 nodes with a single
 * sighting old enough (~66-80 days) that the stock FSRS scheduler's retrievability has
 * genuinely dropped below the 0.6 reunion-waiting threshold.
 * Main exports: WAITING.
 */
import { ASTRO_ROOT, type ConceptSpec, JS_ROOT } from "./conceptSpecTypes";

export const WAITING: readonly ConceptSpec[] = [
  {
    label: "黑洞事件视界",
    domain: "astro",
    parentLabel: ASTRO_ROOT,
    summary: "光也无法逃逸的边界。",
    offsetsDays: [66],
  },
  {
    label: "async/await语法",
    domain: "js",
    parentLabel: JS_ROOT,
    summary: "用同步写法表达异步流程的语法糖。",
    offsetsDays: [68],
  },
  {
    label: "潮汐锁定",
    domain: "astro",
    parentLabel: ASTRO_ROOT,
    summary: "自转周期与公转周期相等的现象。",
    offsetsDays: [70],
  },
  {
    label: "原型链继承",
    domain: "js",
    parentLabel: JS_ROOT,
    summary: "对象沿原型链向上查找属性。",
    offsetsDays: [72],
  },
  {
    label: "开普勒定律",
    domain: "astro",
    parentLabel: ASTRO_ROOT,
    summary: "行星轨道形状与公转周期的关系。",
    offsetsDays: [74],
  },
  {
    label: "解构赋值",
    domain: "js",
    parentLabel: JS_ROOT,
    summary: "按结构从数组或对象里取值。",
    offsetsDays: [76],
  },
  {
    label: "星等标尺",
    domain: "astro",
    parentLabel: ASTRO_ROOT,
    summary: "衡量天体亮度的对数标尺。",
    offsetsDays: [78],
  },
  {
    label: "数组高阶函数",
    domain: "js",
    parentLabel: JS_ROOT,
    summary: "接受函数作为参数的数组方法。",
    offsetsDays: [80],
  },
];
