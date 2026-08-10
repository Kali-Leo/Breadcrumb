/**
 * Purpose: the 必修 skeleton of the 高中数学 comparison profile (spec 023/025) — themes and
 * units transcribed verbatim from 《普通高中数学课程标准（2017年版2020年修订）》表1
 * (pp.13-14). The fine-grained level below the units is pipeline-generated with verbatim
 * verification (see data/generated/fineItems.ts) — hand-authored depth was removed so the
 * fine layer has a single source. Main exports: GAOZHONG_MATH_BIXIU_ITEMS, gaozhongMathItem,
 * GAOZHONG_MATH_STANDARD.
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
  return { key, parentKey, label, aliases, sourceRef, conceptId: null };
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
  item("b-logic", "b-prep", "常用逻辑用语", [], `${S} 必修·预备知识·常用逻辑用语（第15-16页）`),
  item(
    "b-ineq",
    "b-prep",
    "相等关系与不等关系",
    [],
    `${S} 必修·预备知识·相等关系与不等关系（第16页）`,
  ),
  item(
    "b-quad",
    "b-prep",
    "从函数观点看一元二次方程和一元二次不等式",
    [],
    `${S} 必修·预备知识（第17页）`,
  ),

  item("b-func-concept", "b-func", "函数概念与性质", [], `${S} 必修·函数·函数概念与性质（第19页）`),
  item("b-func-elem", "b-func", "幂函数、指数函数、对数函数", [], `${S} 必修·函数（第20页）`),
  item("b-func-trig", "b-func", "三角函数", [], `${S} 必修·函数·三角函数（第21页）`),
  item("b-func-apply", "b-func", "函数应用", [], `${S} 必修·函数·函数应用（第22页）`),

  item("b-geo-vector", "b-geo", "平面向量及其应用", ["平面向量"], `${S} 表1 · 主题三（第24页）`),
  item("b-geo-complex", "b-geo", "复数", [], `${S} 表1 · 主题三（第27页）`),
  item("b-geo-solid", "b-geo", "立体几何初步", ["立体几何"], `${S} 表1 · 主题三（第28页）`),

  item("b-prob-prob", "b-prob", "概率", [], `${S} 必修·概率与统计·概率（第31页）`),
  item("b-prob-stat", "b-prob", "统计", [], `${S} 必修·概率与统计·统计（第32页）`),
];
