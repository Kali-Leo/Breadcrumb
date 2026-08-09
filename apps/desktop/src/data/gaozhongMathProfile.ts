/**
 * Purpose: built-in comparison profile "高中数学（中国）" (spec 023) — assembles the 必修
 * items (gaozhongMathBixiuItems.ts) with the 选择性必修 items below, all transcribed from
 * 《普通高中数学课程标准（2017年版2020年修订）》(表2 pp.36-37; unit "内容包括" lists on the
 * cited pages, verified against the official PDF 2026-08-09). Geometry/counting units whose
 * sub-item lists have not been transcribed yet remain unit-level leaves — leaf granularity
 * may only deepen with verified source text, never by invention.
 * Main exports: GAOZHONG_MATH_PROFILE.
 */
import type { ProfileDefinition } from "@breadcrumb/plugin-compare";
import {
  GAOZHONG_MATH_BIXIU_ITEMS,
  GAOZHONG_MATH_STANDARD,
  gaozhongMathItem,
} from "./gaozhongMathBixiuItems";

const S = GAOZHONG_MATH_STANDARD;
const NOTICE_URL = "http://www.moe.gov.cn/srcsite/A26/s8001/202006/t20200603_462199.html";
const item = gaozhongMathItem;

const XUANBI_ITEMS = [
  item("xuanbi", null, "选择性必修课程", [], `${S} 表2（选择性必修课程课时分配表，第36-37页）`),

  item("x-func", "xuanbi", "函数", [], `${S} 表2 · 主题一`),
  item("x-geo", "xuanbi", "几何与代数", [], `${S} 表2 · 主题二`),
  item("x-prob", "xuanbi", "概率与统计", [], `${S} 表2 · 主题三`),
  item("x-model", "xuanbi", "数学建模活动与数学探究活动（选择性必修）", [], `${S} 表2 · 主题四`),

  item("x-seq", "x-func", "数列", [], `${S} 选择性必修·函数·数列（第38页）`),
  item("x-seq-concept", "x-seq", "数列概念", ["数列"], `${S} 数列·内容包括（第38页）`),
  item("x-seq-arith", "x-seq", "等差数列", [], `${S} 数列·内容包括（第38页）`),
  item("x-seq-geom", "x-seq", "等比数列", [], `${S} 数列·内容包括（第38页）`),
  item("x-seq-induction", "x-seq", "数学归纳法", [], `${S} 数列·内容包括（第38页，*选学）`),

  item(
    "x-deriv",
    "x-func",
    "一元函数导数及其应用",
    [],
    `${S} 选择性必修·函数·一元函数导数及其应用（第39页）`,
  ),
  item(
    "x-deriv-concept",
    "x-deriv",
    "导数概念及其意义",
    ["导数", "导数概念"],
    `${S} 一元函数导数及其应用·内容包括（第39页）`,
  ),
  item("x-deriv-ops", "x-deriv", "导数运算", [], `${S} 一元函数导数及其应用·内容包括（第39页）`),
  item(
    "x-deriv-apply",
    "x-deriv",
    "导数在研究函数中的应用",
    [],
    `${S} 一元函数导数及其应用·内容包括（第39页）`,
  ),
  item(
    "x-deriv-history",
    "x-deriv",
    "微积分的创立与发展",
    [],
    `${S} 一元函数导数及其应用·内容包括（第39页，*选学）`,
  ),

  item("x-geo-space", "x-geo", "空间向量与立体几何", ["空间向量"], `${S} 表2 · 主题二`),
  item("x-geo-analytic", "x-geo", "平面解析几何", ["解析几何"], `${S} 表2 · 主题二`),

  item("x-count", "x-prob", "计数原理", [], `${S} 表2 · 主题三`),
  item("x-prob-prob", "x-prob", "概率（选择性必修）", [], `${S} 表2 · 主题三`),
  item("x-prob-stat", "x-prob", "统计（选择性必修）", [], `${S} 表2 · 主题三`),
];

export const GAOZHONG_MATH_PROFILE: ProfileDefinition = {
  id: "builtin-gaozhong-math",
  title: "高中数学（中国）",
  description: "以教育部普通高中数学课程标准为蓝本的高中数学知识范围（必修 + 选择性必修）",
  sourceNote: `${S}，中华人民共和国教育部制定；发布通知：${NOTICE_URL}；表1/表2 与各单元内容要求逐页检索核实于 2026-08-09`,
  items: [...GAOZHONG_MATH_BIXIU_ITEMS, ...XUANBI_ITEMS],
};
