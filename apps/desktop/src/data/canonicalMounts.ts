/**
 * Purpose: hand-curated crosswalk from ESCO hub labels to canonical curriculum subtrees
 * (spec 028) — small, inspectable, no AI: each entry states which evidence-backed subtree
 * may mount under which hub. A subtree mounts at most once per profile (enforced by the
 * branch builder via the subtree id). Main exports: CANONICAL_MOUNTS.
 */
import type { MountableSubtree, ProfileItemDefinition } from "@breadcrumb/plugin-compare";
import { FRONTEND_MDN_PROFILE } from "./frontendMdnProfile";
import { GAOZHONG_MATH_PROFILE } from "./gaozhongMathProfile";

/** Collects the given roots and all their descendants, re-rooting roots to parentKey null. */
function subtreeOf(
  items: readonly ProfileItemDefinition[],
  rootKeys: readonly string[],
): ProfileItemDefinition[] {
  const wanted = new Set(rootKeys);
  const collected: ProfileItemDefinition[] = [];
  let grew = true;
  while (grew) {
    grew = false;
    for (const item of items) {
      if (item.parentKey !== null && wanted.has(item.parentKey) && !wanted.has(item.key)) {
        wanted.add(item.key);
        grew = true;
      }
    }
  }
  for (const item of items) {
    if (!wanted.has(item.key)) continue;
    collected.push(rootKeys.includes(item.key) ? { ...item, parentKey: null } : item);
  }
  return collected;
}

const MDN = FRONTEND_MDN_PROFILE.items;
const MATH = GAOZHONG_MATH_PROFILE.items;

const CSS_SUBTREE: MountableSubtree = {
  id: "mdn-css",
  note: "MDN Curriculum 的 CSS 模块（Mozilla）",
  items: subtreeOf(MDN, [
    "core-css-fund",
    "core-css-layout",
    "core-css-text",
    "ext-css-anim",
    "ext-css-tooling",
  ]),
};

/** Normalized hub label → mountable subtree. "stylesheet languages" maps to the CSS
 * subtree because CSS is the style sheet language the MDN curriculum teaches — the shared
 * subtree id keeps it from mounting twice when both hubs appear. */
export const CANONICAL_MOUNTS: ReadonlyMap<string, MountableSubtree> = new Map([
  [
    "javascript",
    {
      id: "mdn-js",
      note: "MDN Curriculum 的 JavaScript 模块（Mozilla）",
      items: subtreeOf(MDN, ["core-js", "ext-js-objects"]),
    },
  ],
  [
    "html",
    {
      id: "mdn-html",
      note: "MDN Curriculum 的 HTML 模块（Mozilla）",
      items: subtreeOf(MDN, ["core-html"]),
    },
  ],
  ["css", CSS_SUBTREE],
  ["stylesheetlanguages", CSS_SUBTREE],
  [
    "mathematics",
    {
      id: "gz-math",
      note: "《普通高中数学课程标准》知识条目（子集：高中范围）",
      items: MATH,
    },
  ],
]);
