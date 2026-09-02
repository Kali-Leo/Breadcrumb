/**
 * Purpose: built-in comparison profile "前端工程师" (spec 023) — transcribed from the MDN
 * Curriculum, Mozilla's official front-end developer curriculum. Every module name and
 * every alias below was verified against the live pages on 2026-08-09; aliases exist ONLY
 * where the cited page explicitly names the concept (e.g. scope in Functions, prototypes
 * in Custom JS objects). Main exports: FRONTEND_MDN_PROFILE.
 */
import type { ProfileDefinition, ProfileItemDefinition } from "@breadcrumb/feature-compare";
import { MDN_FINE_ITEMS } from "./generated/fineItems";

const CURRICULUM = "https://developer.mozilla.org/en-US/curriculum/";
const JS = `${CURRICULUM}core/javascript-fundamentals/`;

function item(
  key: string,
  parentKey: string | null,
  label: string,
  aliases: string[],
  sourceRef: string,
): ProfileItemDefinition {
  return { key, parentKey, label, aliases, sourceRef, conceptId: null };
}

export const FRONTEND_MDN_PROFILE: ProfileDefinition = {
  id: "builtin-frontend-mdn",
  title: "前端工程师",
  description: "以 Mozilla 官方 MDN Curriculum 为蓝本的前端开发者知识范围",
  sourceNote: `MDN Curriculum（Mozilla 官方前端开发课程大纲），${CURRICULUM}；模块清单与学习要点逐页检索核实于 2026-08-09`,
  items: [
    item("start", null, "入门模块", [], `${CURRICULUM} · Getting started modules`),
    item("core", null, "核心模块", [], `${CURRICULUM} · Core modules`),
    item("ext", null, "扩展模块", [], `${CURRICULUM} · Extensions modules`),

    item(
      "start-soft",
      "start",
      "软技能",
      ["Soft skills"],
      `${CURRICULUM}getting-started/soft-skills/`,
    ),
    item(
      "start-env",
      "start",
      "环境准备",
      ["Environment setup"],
      `${CURRICULUM}getting-started/environment-setup/`,
    ),

    item(
      "core-standards",
      "core",
      "网页标准",
      ["Web standards"],
      `${CURRICULUM}core/web-standards/`,
    ),
    item(
      "core-html",
      "core",
      "语义化 HTML",
      ["Semantic HTML", "HTML"],
      `${CURRICULUM}core/semantic-html/`,
    ),
    item(
      "core-css-fund",
      "core",
      "CSS 基础",
      ["CSS fundamentals", "CSS"],
      `${CURRICULUM}core/css-fundamentals/`,
    ),
    item(
      "core-css-text",
      "core",
      "CSS 文本样式",
      ["CSS text styling"],
      `${CURRICULUM}core/css-text-styling/`,
    ),
    item("core-css-layout", "core", "CSS 布局", ["CSS layout"], `${CURRICULUM}core/css-layout/`),
    item("core-js", "core", "JavaScript 基础", ["JavaScript fundamentals", "JavaScript"], JS),
    item("core-a11y", "core", "无障碍", ["Accessibility"], `${CURRICULUM}core/accessibility/`),
    item(
      "core-design",
      "core",
      "面向开发者的设计",
      ["Design for developers"],
      `${CURRICULUM}core/design-for-developers/`,
    ),
    item("core-vcs", "core", "版本控制", ["Version control"], `${CURRICULUM}core/version-control/`),

    item("js-variables", "core-js", "变量", ["Variables"], `${JS} · 6.1 Variables`),
    item("js-math", "core-js", "数学运算", ["Math"], `${JS} · 6.2 Math`),
    item("js-text", "core-js", "文本处理", ["Text"], `${JS} · 6.3 Text`),
    item("js-arrays", "core-js", "数组", ["Arrays"], `${JS} · 6.4 Arrays`),
    item("js-conditionals", "core-js", "条件语句", ["Conditionals"], `${JS} · 6.5 Conditionals`),
    item("js-loops", "core-js", "循环", ["Loops"], `${JS} · 6.6 Loops`),
    // Scope is explicitly a learning outcome of 6.7 ("global scope and function/block scope").
    item(
      "js-functions",
      "core-js",
      "函数",
      ["Functions", "作用域", "Scope"],
      `${JS} · 6.7 Functions`,
    ),
    // "Object scope, and this" is an explicit learning outcome of 6.8.
    item(
      "js-objects",
      "core-js",
      "对象基础",
      ["JavaScript object basics", "对象", "this"],
      `${JS} · 6.8 JavaScript object basics`,
    ),
    item("js-dom", "core-js", "DOM 脚本", ["DOM scripting", "DOM"], `${JS} · 6.9 DOM scripting`),
    item("js-events", "core-js", "事件", ["Events"], `${JS} · 6.10 Events`),
    // Promises and async/await are explicit learning outcomes of 6.11.
    item(
      "js-async",
      "core-js",
      "异步基础",
      ["Async JavaScript basics", "异步", "Promise", "async/await"],
      `${JS} · 6.11 Async JavaScript basics`,
    ),
    item(
      "js-fetch",
      "core-js",
      "fetch 网络请求",
      ["Network requests with fetch()", "fetch"],
      `${JS} · 6.12 Network requests with fetch()`,
    ),
    item(
      "js-json",
      "core-js",
      "JSON 处理",
      ["Working with JSON", "JSON"],
      `${JS} · 6.13 Working with JSON`,
    ),
    item(
      "js-libs",
      "core-js",
      "库与框架",
      ["Libraries and frameworks"],
      `${JS} · 6.14 Libraries and frameworks`,
    ),
    item(
      "js-debug",
      "core-js",
      "调试",
      ["Debugging JavaScript"],
      `${JS} · 6.15 Debugging JavaScript`,
    ),

    item(
      "ext-css-anim",
      "ext",
      "CSS 变换与动画",
      ["Transform & animate CSS"],
      `${CURRICULUM}extensions/transform-and-animate-css/`,
    ),
    // "Object prototypes" and "JavaScript class syntax" are explicit learning outcomes.
    item(
      "ext-js-objects",
      "ext",
      "自定义 JS 对象",
      ["Custom JS objects", "原型", "对象原型", "类"],
      `${CURRICULUM}extensions/custom-js-objects/`,
    ),
    item("ext-web-apis", "ext", "Web API", ["Web APIs"], `${CURRICULUM}extensions/web-apis/`),
    item("ext-perf", "ext", "网页性能", ["Performance"], `${CURRICULUM}extensions/performance/`),
    item(
      "ext-security",
      "ext",
      "安全与隐私",
      ["Security and privacy"],
      `${CURRICULUM}extensions/security-and-privacy/`,
    ),
    item("ext-testing", "ext", "测试", ["Testing"], `${CURRICULUM}extensions/testing/`),
    item(
      "ext-frameworks",
      "ext",
      "JavaScript 框架",
      ["JavaScript frameworks"],
      `${CURRICULUM}extensions/a-practical-understanding-of-javascript-frameworks/`,
    ),
    item(
      "ext-css-tooling",
      "ext",
      "CSS 工具链",
      ["CSS tooling"],
      `${CURRICULUM}extensions/css-tooling/`,
    ),
    item(
      "ext-other-tooling",
      "ext",
      "其他工具",
      ["Other tooling types"],
      `${CURRICULUM}extensions/other-tooling-types/`,
    ),
    ...MDN_FINE_ITEMS,
  ],
};
