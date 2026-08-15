/**
 * Purpose: the demo seed's deep-subtree bucket (spec 049 testing needs) — a multi-level
 * branch under the existing 数组高阶函数 kingdom so the third-level network view has a
 * real tree to render: two freshly-met nodes, the rest untouched (empty offsets = no
 * sightings, an honest "未接触").
 * Main exports: DEEP_TREE.
 */
import type { ConceptSpec } from "./conceptSpecTypes";

const js = (
  label: string,
  parentLabel: string,
  summary: string,
  offsetsDays: readonly number[] = [],
): ConceptSpec => ({ label, domain: "js", parentLabel, summary, offsetsDays });

export const DEEP_TREE: readonly ConceptSpec[] = [
  // Level 2 — the kingdom's three main lines.
  js("map映射", "数组高阶函数", "把数组逐项变换成等长的新数组。", [3]),
  js("filter筛选", "数组高阶函数", "按条件挑出数组中的一部分。"),
  js("reduce归约", "数组高阶函数", "把整个数组折叠成一个值。"),
  // Level 3.
  js("链式调用", "map映射", "map/filter 连着写,数据像流水线一样过。", [2]),
  js("稀疏数组的坑", "map映射", "空位不会被 map 访问,结果常出乎意料。"),
  js("谓词函数", "filter筛选", "返回真假的判断函数,是 filter 的心脏。"),
  js("真值判定", "filter筛选", "JS 里哪些值算「真」,哪些算「假」。"),
  js("累加器模式", "reduce归约", "用一个不断更新的累加器收集结果。"),
  js("初始值的选择", "reduce归约", "reduce 的第二个参数决定第一轮怎么开始。"),
  js("reduce实现map", "reduce归约", "用 reduce 写出 map,理解归约的表达力。"),
  // Level 4.
  js("分组统计groupBy", "累加器模式", "按键把元素分进不同的组。"),
  js("对象累加", "累加器模式", "累加器是对象时的合并写法。"),
  js("惰性求值的取舍", "链式调用", "链式好读,但每步都产生中间数组。"),
  js("组合谓词", "谓词函数", "用与、或把多个判断拼成一个。"),
  // Level 5.
  js("Map还是对象", "分组统计groupBy", "分组容器选 Map 还是普通对象。"),
];
