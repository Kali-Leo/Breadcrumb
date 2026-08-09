/**
 * Purpose: the 必修 half of the 高中数学 comparison profile (spec 023) — items transcribed
 * verbatim from 《普通高中数学课程标准（2017年版2020年修订）》表1 (pp.13-14) with each
 * unit's children taken from its【内容要求】"内容包括" list on the cited pages (verified
 * against the official PDF, 2026-08-09). Leaf granularity = the finest enumerated items the
 * source itself provides. Starred (*选学) items carry the mark in their sourceRef.
 * Main exports: GAOZHONG_MATH_BIXIU_ITEMS, gaozhongMathItem.
 */
import type { ProfileItemDefinition } from "@breadcrumb/plugin-compare";

export const GAOZHONG_MATH_STANDARD = "《普通高中数学课程标准（2017年版2020年修订）》";
const S = GAOZHONG_MATH_STANDARD;

export function gaozhongMathItem(
  key: string,
  parentKey: string | null,
  label: string,
  aliases: string[],
  sourceRef: string,
): ProfileItemDefinition {
  return { key, parentKey, label, aliases, sourceRef };
}
const item = gaozhongMathItem;

export const GAOZHONG_MATH_BIXIU_ITEMS: ProfileItemDefinition[] = [
  item("bixiu", null, "必修课程", [], `${S} 表1（必修课程课时分配建议表，第13-14页）`),

  item("b-prep", "bixiu", "预备知识", [], `${S} 表1 · 主题一`),
  item("b-func", "bixiu", "函数", [], `${S} 表1 · 主题二`),
  item("b-geo", "bixiu", "几何与代数", [], `${S} 表1 · 主题三`),
  item("b-prob", "bixiu", "概率与统计", [], `${S} 表1 · 主题四`),
  item("b-model", "bixiu", "数学建模活动与数学探究活动", ["数学建模"], `${S} 表1 · 主题五`),

  item("b-sets", "b-prep", "集合", [], `${S} 必修·预备知识·集合（第15页）`),
  item("b-sets-concept", "b-sets", "集合的概念与表示", [], `${S} 集合·内容包括（第15页）`),
  item("b-sets-relation", "b-sets", "集合的基本关系", [], `${S} 集合·内容包括（第15页）`),
  item("b-sets-ops", "b-sets", "集合的基本运算", [], `${S} 集合·内容包括（第15页）`),

  item("b-logic", "b-prep", "常用逻辑用语", [], `${S} 必修·预备知识·常用逻辑用语（第15-16页）`),
  item(
    "b-logic-cond",
    "b-logic",
    "必要条件、充分条件、充要条件",
    ["充要条件", "充分条件", "必要条件"],
    `${S} 常用逻辑用语·内容包括（第16页）`,
  ),
  item(
    "b-logic-quant",
    "b-logic",
    "全称量词与存在量词",
    [],
    `${S} 常用逻辑用语·内容包括（第16页）`,
  ),
  item(
    "b-logic-neg",
    "b-logic",
    "全称量词命题与存在量词命题的否定",
    [],
    `${S} 常用逻辑用语·内容包括（第16页）`,
  ),

  item(
    "b-ineq",
    "b-prep",
    "相等关系与不等关系",
    [],
    `${S} 必修·预备知识·相等关系与不等关系（第16页）`,
  ),
  item(
    "b-ineq-props",
    "b-ineq",
    "等式与不等式的性质",
    [],
    `${S} 相等关系与不等关系·内容包括（第16页）`,
  ),
  item("b-ineq-basic", "b-ineq", "基本不等式", [], `${S} 相等关系与不等关系·内容包括（第16-17页）`),

  item(
    "b-quad",
    "b-prep",
    "从函数观点看一元二次方程和一元二次不等式",
    [],
    `${S} 必修·预备知识（第17页）`,
  ),
  item(
    "b-quad-eq",
    "b-quad",
    "从函数观点看一元二次方程",
    ["一元二次方程"],
    `${S} 内容包括（第17页）`,
  ),
  item(
    "b-quad-ineq",
    "b-quad",
    "从函数观点看一元二次不等式",
    ["一元二次不等式"],
    `${S} 内容包括（第17页）`,
  ),

  item("b-func-concept", "b-func", "函数概念与性质", [], `${S} 必修·函数·函数概念与性质（第19页）`),
  item(
    "b-func-concept-def",
    "b-func-concept",
    "函数概念",
    [],
    `${S} 函数概念与性质·内容包括（第19页）`,
  ),
  item(
    "b-func-concept-props",
    "b-func-concept",
    "函数性质",
    [],
    `${S} 函数概念与性质·内容包括（第19页）`,
  ),
  item(
    "b-func-concept-history",
    "b-func-concept",
    "函数的形成与发展",
    [],
    `${S} 函数概念与性质·内容包括（第19页，*选学）`,
  ),

  item("b-func-elem", "b-func", "幂函数、指数函数、对数函数", [], `${S} 必修·函数（第20页）`),
  item("b-func-elem-power", "b-func-elem", "幂函数", [], `${S} 内容包括（第20页）`),
  item("b-func-elem-exp", "b-func-elem", "指数函数", [], `${S} 内容包括（第20页）`),
  item("b-func-elem-log", "b-func-elem", "对数函数", ["对数"], `${S} 内容包括（第20-21页）`),

  item("b-func-trig", "b-func", "三角函数", [], `${S} 必修·函数·三角函数（第21页）`),
  item("b-trig-angle", "b-func-trig", "角与弧度", ["弧度制"], `${S} 三角函数·内容包括（第21页）`),
  item(
    "b-trig-concept",
    "b-func-trig",
    "三角函数概念和性质",
    ["三角函数"],
    `${S} 三角函数·内容包括（第21页）`,
  ),
  item(
    "b-trig-identity",
    "b-func-trig",
    "同角三角函数的基本关系式",
    [],
    `${S} 三角函数·内容包括（第22页）`,
  ),
  item("b-trig-transform", "b-func-trig", "三角恒等变换", [], `${S} 三角函数·内容包括（第22页）`),
  item("b-trig-apply", "b-func-trig", "三角函数应用", [], `${S} 三角函数·内容包括（第22页）`),

  item("b-func-apply", "b-func", "函数应用", [], `${S} 必修·函数·函数应用（第22页）`),
  item(
    "b-apply-bisect",
    "b-func-apply",
    "二分法与求方程近似解",
    ["二分法"],
    `${S} 函数应用·内容包括（第22页）`,
  ),
  item("b-apply-model", "b-func-apply", "函数与数学模型", [], `${S} 函数应用·内容包括（第23页）`),

  item("b-geo-vector", "b-geo", "平面向量及其应用", ["平面向量"], `${S} 表1 · 主题三`),
  item("b-geo-complex", "b-geo", "复数", [], `${S} 表1 · 主题三`),
  item("b-geo-solid", "b-geo", "立体几何初步", ["立体几何"], `${S} 表1 · 主题三`),

  item("b-prob-prob", "b-prob", "概率", [], `${S} 必修·概率与统计·概率（第31页）`),
  item("b-prob-events", "b-prob-prob", "随机事件与概率", ["概率"], `${S} 概率·内容包括（第31页）`),
  item("b-prob-indep", "b-prob-prob", "随机事件的独立性", [], `${S} 概率·内容包括（第31页）`),

  item("b-prob-stat", "b-prob", "统计", [], `${S} 必修·概率与统计·统计（第32页）`),
  item(
    "b-stat-sources",
    "b-prob-stat",
    "获取数据的基本途径及相关概念",
    [],
    `${S} 统计·内容包括（第32页）`,
  ),
  item(
    "b-stat-sampling",
    "b-prob-stat",
    "抽样",
    ["简单随机抽样", "分层随机抽样"],
    `${S} 统计·内容包括（第32页）`,
  ),
  item("b-stat-charts", "b-prob-stat", "统计图表", [], `${S} 统计·内容包括（第32页）`),
  item("b-stat-estimate", "b-prob-stat", "用样本估计总体", [], `${S} 统计·内容包括（第32页）`),
];
