/**
 * Purpose: built-in comparison profile "高中数学（中国）" (spec 023) — transcribed from
 * 《普通高中数学课程标准（2017年版2020年修订）》: themes/units verbatim from 表1 (必修,
 * pp.13-14) and 表2 (选择性必修, pp.36-37); aliases only from the units'【内容要求】
 * "内容包括" lists on the cited pages, verified against the official PDF on 2026-08-09.
 * Units named identically in both tracks are disambiguated with a （选择性必修）suffix and
 * carry no aliases, so a user's node matches the basic (必修) unit only.
 * Main exports: GAOZHONG_MATH_PROFILE.
 */
import type { ProfileDefinition, ProfileItemDefinition } from "@breadcrumb/plugin-compare";

const STANDARD = "《普通高中数学课程标准（2017年版2020年修订）》";
const NOTICE_URL = "http://www.moe.gov.cn/srcsite/A26/s8001/202006/t20200603_462199.html";

function item(
  key: string,
  parentKey: string | null,
  label: string,
  aliases: string[],
  sourceRef: string,
): ProfileItemDefinition {
  return { key, parentKey, label, aliases, sourceRef };
}

export const GAOZHONG_MATH_PROFILE: ProfileDefinition = {
  id: "builtin-gaozhong-math",
  title: "高中数学（中国）",
  description: "以教育部普通高中数学课程标准为蓝本的高中数学知识范围（必修 + 选择性必修）",
  sourceNote: `${STANDARD}，中华人民共和国教育部制定；发布通知：${NOTICE_URL}；表1/表2 与各单元内容要求逐页检索核实于 2026-08-09`,
  items: [
    item("bixiu", null, "必修课程", [], `${STANDARD} 表1（必修课程课时分配建议表，第13-14页）`),
    item(
      "xuanbi",
      null,
      "选择性必修课程",
      [],
      `${STANDARD} 表2（选择性必修课程课时分配表，第36-37页）`,
    ),

    item("b-prep", "bixiu", "预备知识", [], `${STANDARD} 表1 · 主题一`),
    item("b-func", "bixiu", "函数", [], `${STANDARD} 表1 · 主题二`),
    item("b-geo", "bixiu", "几何与代数", [], `${STANDARD} 表1 · 主题三`),
    item("b-prob", "bixiu", "概率与统计", [], `${STANDARD} 表1 · 主题四`),
    item(
      "b-model",
      "bixiu",
      "数学建模活动与数学探究活动",
      ["数学建模"],
      `${STANDARD} 表1 · 主题五`,
    ),

    item(
      "b-sets",
      "b-prep",
      "集合",
      ["集合的概念与表示", "集合的基本关系", "集合的基本运算"],
      `${STANDARD} 必修·预备知识·集合（第15页）`,
    ),
    item(
      "b-logic",
      "b-prep",
      "常用逻辑用语",
      ["充要条件", "全称量词与存在量词"],
      `${STANDARD} 必修·预备知识·常用逻辑用语（第15-16页）`,
    ),
    item(
      "b-ineq",
      "b-prep",
      "相等关系与不等关系",
      ["等式与不等式的性质", "基本不等式"],
      `${STANDARD} 必修·预备知识·相等关系与不等关系（第16页）`,
    ),
    item(
      "b-quad",
      "b-prep",
      "从函数观点看一元二次方程和一元二次不等式",
      ["一元二次方程", "一元二次不等式"],
      `${STANDARD} 必修·预备知识（第17页）`,
    ),

    item(
      "b-func-concept",
      "b-func",
      "函数概念与性质",
      ["函数概念", "函数性质"],
      `${STANDARD} 必修·函数·函数概念与性质（第19页）`,
    ),
    item(
      "b-func-elem",
      "b-func",
      "幂函数、指数函数、对数函数",
      ["幂函数", "指数函数", "对数函数"],
      `${STANDARD} 表1 · 主题二`,
    ),
    item("b-func-trig", "b-func", "三角函数", [], `${STANDARD} 表1 · 主题二`),
    item("b-func-apply", "b-func", "函数应用", [], `${STANDARD} 表1 · 主题二`),

    item("b-geo-vector", "b-geo", "平面向量及其应用", ["平面向量"], `${STANDARD} 表1 · 主题三`),
    item("b-geo-complex", "b-geo", "复数", [], `${STANDARD} 表1 · 主题三`),
    item("b-geo-solid", "b-geo", "立体几何初步", ["立体几何"], `${STANDARD} 表1 · 主题三`),

    item(
      "b-prob-prob",
      "b-prob",
      "概率",
      ["随机事件与概率", "随机事件的独立性"],
      `${STANDARD} 必修·概率与统计·概率（第31页）`,
    ),
    item(
      "b-prob-stat",
      "b-prob",
      "统计",
      ["抽样", "统计图表", "用样本估计总体"],
      `${STANDARD} 必修·概率与统计·统计（第32页）`,
    ),

    item("x-func", "xuanbi", "函数", [], `${STANDARD} 表2 · 主题一`),
    item("x-geo", "xuanbi", "几何与代数", [], `${STANDARD} 表2 · 主题二`),
    item("x-prob", "xuanbi", "概率与统计", [], `${STANDARD} 表2 · 主题三`),
    item(
      "x-model",
      "xuanbi",
      "数学建模活动与数学探究活动（选择性必修）",
      [],
      `${STANDARD} 表2 · 主题四`,
    ),

    item(
      "x-seq",
      "x-func",
      "数列",
      ["数列概念", "等差数列", "等比数列", "数学归纳法"],
      `${STANDARD} 选择性必修·函数·数列（第38页）`,
    ),
    item(
      "x-deriv",
      "x-func",
      "一元函数导数及其应用",
      ["导数", "导数概念及其意义", "导数运算", "导数在研究函数中的应用"],
      `${STANDARD} 选择性必修·函数·一元函数导数及其应用（第39页）`,
    ),

    item("x-geo-space", "x-geo", "空间向量与立体几何", ["空间向量"], `${STANDARD} 表2 · 主题二`),
    item("x-geo-analytic", "x-geo", "平面解析几何", ["解析几何"], `${STANDARD} 表2 · 主题二`),

    item("x-count", "x-prob", "计数原理", [], `${STANDARD} 表2 · 主题三`),
    item("x-prob-prob", "x-prob", "概率（选择性必修）", [], `${STANDARD} 表2 · 主题三`),
    item("x-prob-stat", "x-prob", "统计（选择性必修）", [], `${STANDARD} 表2 · 主题三`),
  ],
};
