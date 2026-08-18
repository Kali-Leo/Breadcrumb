/**
 * Purpose: the first-run panel's material (spec 053 §6) — the fields the reader takes a position
 * on before the first cards land, in the groups the panel shows them in, and the three positions
 * themselves. Kept out of the component so the fields and the cycle can be checked without a DOM.
 * Main exports: OnboardingStance, OnboardingFieldGroup, ONBOARDING_FIELD_GROUPS,
 * ONBOARDING_FIELDS, nextStance, stanceLabel.
 */

/** 想看 / 一般 / 不想看. 一般 is where every field starts: the reader is answering about
 * themselves before seeing anything, and "no opinion" is the honest default. */
export type OnboardingStance = "want" | "neutral" | "avoid";

export interface OnboardingFieldGroup {
  /** A few characters, shown above the block. It only breaks the list into pieces the eye can
   * take in at a glance; nothing is chosen or written at group level. */
  readonly name: string;
  readonly fields: readonly string[];
}

/**
 * Every label below is a category name a mainstream Chinese content app already puts in front of
 * its own readers, so nobody has to learn our vocabulary to answer: 科学与技术 and 人文 follow
 * bilibili's 知识 area (科学科普 / 人文历史 / 社科·法律·心理) and 微信读书's shelves
 * (历史 / 哲学 / 心理 / 文学 / 外语); 商业与职场 follows 得到 (经济 / 金融 / 管理 / 职场 / 创业);
 * 生活 follows 小红书 and 知乎 (美食 / 旅行 / 家居 / 穿搭 / 育儿 / 宠物 / 汽车 / 运动 / 健康);
 * 艺术与娱乐 follows bilibili's areas (影视 / 音乐 / 游戏 / 动画) plus 摄影 / 设计 / 艺术.
 *
 * Each label also has to work as a search term on its own, because these are the words the first
 * fetches go looking for (see discoveryRecallTerms).
 */
export const ONBOARDING_FIELD_GROUPS: readonly OnboardingFieldGroup[] = [
  {
    name: "科学与技术",
    fields: ["编程", "人工智能", "科学", "数学", "物理", "生物", "天文", "数码"],
  },
  {
    name: "人文",
    fields: ["历史", "哲学", "心理学", "文学", "社会", "法律", "外语"],
  },
  {
    name: "商业与职场",
    fields: ["经济", "金融", "管理", "职场", "创业"],
  },
  {
    name: "生活",
    fields: ["健康", "运动", "美食", "旅行", "家居", "穿搭", "育儿", "宠物", "汽车"],
  },
  {
    name: "艺术与娱乐",
    fields: ["电影", "音乐", "游戏", "动画", "摄影", "设计", "艺术"],
  },
];

/** The same fields as one flat list, in the order the panel shows them. What the panel writes,
 * and the vocabulary recall is allowed to search for, both read this. */
export const ONBOARDING_FIELDS: readonly string[] = ONBOARDING_FIELD_GROUPS.flatMap(
  (group) => group.fields,
);

const STANCE_CYCLE: readonly OnboardingStance[] = ["neutral", "want", "avoid"];

/** One tap moves to the next position and wraps around, so every position is reachable without
 * a menu and nothing is ever stuck. */
export function nextStance(stance: OnboardingStance): OnboardingStance {
  const index = STANCE_CYCLE.indexOf(stance);
  return STANCE_CYCLE[(index + 1) % STANCE_CYCLE.length] ?? "neutral";
}

export function stanceLabel(stance: OnboardingStance): string {
  if (stance === "want") return "想看";
  if (stance === "avoid") return "不想看";
  return "一般";
}
