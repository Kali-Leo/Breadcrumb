/**
 * Purpose: built-in comparison profile "高中数学（中国）" (spec 023/025) — the 必修 +
 * 选择性必修 skeleton transcribed verbatim from 《普通高中数学课程标准（2017年版2020年
 * 修订）》(表1/表2), with the fine-grained concept layer appended from the verbatim-verified
 * canonical pipeline output (data/generated/fineItems.ts).
 * Main exports: GAOZHONG_MATH_PROFILE.
 */
import type { ProfileDefinition } from "@breadcrumb/feature-compare";
import {
  GAOZHONG_MATH_BIXIU_ITEMS,
  GAOZHONG_MATH_STANDARD,
  gaozhongMathItem,
} from "./gaozhongMathBixiuItems";
import { MATH_FINE_ITEMS } from "./generated/fineItems";

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
  item("x-deriv", "x-func", "一元函数导数及其应用", [], `${S} 选择性必修·函数（第39页）`),

  item("x-geo-space", "x-geo", "空间向量与立体几何", ["空间向量"], `${S} 表2 · 主题二（第40页）`),
  item("x-geo-analytic", "x-geo", "平面解析几何", ["解析几何"], `${S} 表2 · 主题二（第42页）`),

  item("x-count", "x-prob", "计数原理", [], `${S} 表2 · 主题三（第45页）`),
  item("x-prob-prob", "x-prob", "概率（选择性必修）", [], `${S} 表2 · 主题三（第46页）`),
  item("x-prob-stat", "x-prob", "统计（选择性必修）", [], `${S} 表2 · 主题三（第48页）`),
];

export const GAOZHONG_MATH_PROFILE: ProfileDefinition = {
  id: "builtin-gaozhong-math",
  title: "高中数学（中国）",
  description:
    "以教育部普通高中数学课程标准为蓝本的高中数学知识范围（必修 + 选择性必修，细粒层由逐字校验管线生成）",
  sourceNote: `${S}，中华人民共和国教育部制定；发布通知：${NOTICE_URL}；骨架逐页检索核实于 2026-08-09，细粒层由逐字校验管线生成于 2026-08-10`,
  items: [...GAOZHONG_MATH_BIXIU_ITEMS, ...XUANBI_ITEMS, ...MATH_FINE_ITEMS],
};
