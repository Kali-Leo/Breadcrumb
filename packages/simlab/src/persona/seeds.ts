/**
 * Purpose: hand-written seed personas (spec 013 T2) — each a named test scenario covering a
 * behavior extreme or a product-principle edge case; perturbPersona() generates reproducible
 * variants from these at run time instead of hand-writing every variant.
 * Main exports: SEED_PERSONAS.
 */
import type { Persona } from "./schema";

export const SEED_PERSONAS: readonly Persona[] = [
  {
    id: "confused-novice",
    name: "高困惑新手",
    description:
      "数学基础薄弱，经常听不懂，反复问同一个问题；测试 confusion 信号的还原与温柔的解释耐心。",
    knowledge: {
      knownTopics: ["加法", "乘法"],
      misconceptions: ["分数就是两个数相除，跟除法没别的关系"],
      targetConcepts: ["分数", "概率"],
    },
    behavior: {
      typoRate: 0.2,
      codeSwitching: 0.05,
      driftTendency: 0.15,
      boredomThreshold: 0.3,
      confusionTendency: 0.9,
    },
  },
  {
    id: "bored-topic-skipper",
    name: "易厌倦跳题者",
    description:
      "专注力短，稍微讲深一点就想跳到下一个话题；测试 boredom 信号的还原与「不焦虑」红线（系统绝不能用施压语气挽留）。",
    knowledge: {
      knownTopics: ["变量", "循环语句"],
      misconceptions: [],
      targetConcepts: ["条件语句", "函数（编程）"],
    },
    behavior: {
      typoRate: 0.3,
      codeSwitching: 0.2,
      driftTendency: 0.5,
      boredomThreshold: 0.85,
      confusionTendency: 0.2,
    },
  },
  {
    id: "frustrated-user",
    name: "挫败情绪用户",
    description:
      "学了很久没进展，情绪上有点自责和沮丧；测试系统绝不冰冷评判、绝不用压力词典命中的文案安慰。",
    knowledge: {
      knownTopics: ["代数方程"],
      misconceptions: ["二次方程一定要用求根公式，不能用别的方法"],
      targetConcepts: ["二次方程"],
    },
    behavior: {
      typoRate: 0.35,
      codeSwitching: 0.05,
      driftTendency: 0.2,
      boredomThreshold: 0.4,
      confusionTendency: 0.6,
    },
  },
  {
    id: "code-switcher",
    name: "中英混杂者",
    description:
      "习惯用英文技术词汇夹杂中文表达（如程序员日常交流习惯）；测试提取管线对夹杂英文的鲁棒性。",
    knowledge: {
      knownTopics: ["作用域", "变量"],
      misconceptions: [],
      targetConcepts: ["闭包", "柯里化"],
    },
    behavior: {
      typoRate: 0.1,
      codeSwitching: 0.85,
      driftTendency: 0.25,
      boredomThreshold: 0.5,
      confusionTendency: 0.35,
    },
  },
  {
    id: "self-reporting-veteran",
    name: "自报大量旧知识者",
    description:
      "反复强调自己以前学过很多东西，倾向于自报已掌握的内容；测试 mastery self-report 映射路径。",
    knowledge: {
      knownTopics: ["集合", "函数", "极限", "导数", "矩阵"],
      misconceptions: [],
      targetConcepts: ["积分", "梯度"],
    },
    behavior: {
      typoRate: 0.1,
      codeSwitching: 0.1,
      driftTendency: 0.3,
      boredomThreshold: 0.45,
      confusionTendency: 0.15,
    },
  },
  {
    id: "anxious-perfectionist",
    name: "完美主义焦虑者",
    description:
      "对自己要求很高，担心学得不够快、不够好；测试系统的反馈语言绝不制造「你还差」「落后」式的焦虑感。",
    knowledge: {
      knownTopics: ["向量", "矩阵"],
      misconceptions: [],
      targetConcepts: ["行列式"],
    },
    behavior: {
      typoRate: 0.05,
      codeSwitching: 0.05,
      driftTendency: 0.1,
      boredomThreshold: 0.2,
      confusionTendency: 0.5,
    },
  },
  {
    id: "confident-misconception-holder",
    name: "隐藏错误认知的自信者",
    description:
      "自信地讲出错误结论、语气笃定不像在提问；测试提取管线不会把错误认知误判为已掌握的正确知识。",
    knowledge: {
      knownTopics: ["概率"],
      misconceptions: ["贝叶斯定理只是条件概率公式换了个说法，没有实际用处"],
      targetConcepts: ["贝叶斯定理", "期望值"],
    },
    behavior: {
      typoRate: 0.1,
      codeSwitching: 0.15,
      driftTendency: 0.15,
      boredomThreshold: 0.5,
      confusionTendency: 0.1,
    },
  },
  {
    id: "goal-driven-efficient-learner",
    name: "目标明确高效学习者",
    description: "问题精准、几乎不跑题，作为低噪声基线人设，用于对照其余人设的信号强度是否合理。",
    knowledge: {
      knownTopics: ["指针", "数组"],
      misconceptions: [],
      targetConcepts: ["排序算法", "二叉搜索树"],
    },
    behavior: {
      typoRate: 0.02,
      codeSwitching: 0.1,
      driftTendency: 0.05,
      boredomThreshold: 0.6,
      confusionTendency: 0.1,
    },
  },
  {
    id: "procrastinating-dabbler",
    name: "三分钟热度的拖延者",
    description:
      "话题跳得很快，什么都想学一点又不深入，容易分心到不相关的话题；测试 driftTendency 与提取管线对松散对话的容忍度。",
    knowledge: {
      knownTopics: ["布尔逻辑"],
      misconceptions: [],
      targetConcepts: ["条件语句", "递归"],
    },
    behavior: {
      typoRate: 0.25,
      codeSwitching: 0.3,
      driftTendency: 0.8,
      boredomThreshold: 0.7,
      confusionTendency: 0.3,
    },
  },
];
