/**
 * Purpose: one realistic learner scenario, used to measure what each metered LLM purpose
 * actually costs. The numbers in core-llm's purpose catalogue come from running the real
 * prompt builders over these fixtures — nothing in that catalogue is guessed.
 *
 * The scenario is deliberately mid-sized rather than best or worst case: a learner about
 * three months in, whose tree has grown past the point where prompts stop being trivially
 * small, having one ordinary study-mode exchange. Concept labels are taken from the app's
 * own canonical concept data so the token counts reflect real Chinese terminology rather
 * than invented filler.
 *
 * Main exports: SCENARIO, treeNodes, treeLabels, ROUND, LONG_ANSWER.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { CANONICAL_CONCEPTS } from "../data/generated/canonicalConcepts";

/** How the scenario is described wherever a measurement is shown or documented. */
export const SCENARIO =
  "学了约三个月的学习者：知识树 80 个节点，一轮学习模式问答（提问 ~40 字，回答 ~600 字）";

/** Nodes in the tree at measurement time. 80 is past the point where the tree stops being a
 * rounding error in the prompt and before it dominates — the shape most rounds see. */
const TREE_SIZE = 80;

/** A tree that is mostly two levels deep, which is what extraction actually produces: a
 * handful of roots with children hanging off them. */
export const treeNodes: KnowledgeNodeRow[] = CANONICAL_CONCEPTS.slice(0, TREE_SIZE).map(
  (concept, index) => ({
    id: `n${index}`,
    label: concept.label,
    summary: `${concept.label}的一句话说明，来自这一轮对话里学到的内容。`,
    // Every fifth node is a root; the rest hang off the most recent root.
    parent_id: index % 5 === 0 ? null : `n${index - (index % 5)}`,
    kind: "concept",
    created_at: "2026-06-01T00:00:00.000Z",
  }),
);

export const treeLabels: string[] = treeNodes.map((node) => node.label);

/** An ordinary study-mode exchange: a real question, and an answer of the length the
 * teaching contract actually produces. */
export const ROUND = {
  question: "导数的定义里为什么一定要取极限？直接用平均变化率不行吗？",
  answer: `平均变化率算的是一段区间上的整体变化，导数要的是某一点上的瞬时变化，这两件事不是一回事。

先看平均变化率：在区间 [x₀, x₀+Δx] 上，函数值改变了 f(x₀+Δx) − f(x₀)，自变量改变了 Δx，两者相除得到的是这段区间上"平均每单位自变量变化带来多少函数值变化"。它描述的是整段区间的总体趋势，区间内部具体怎么起伏，这个数字看不出来。

但我们经常想问的是另一个问题：就在 x₀ 这一点，函数变化得有多快？直接把 Δx 取成 0 是不行的——分母为零，这个式子没有意义。取一个很小但不为零的 Δx 也不行，因为"很小"没有标准，取 0.01 和取 0.001 会得到不同的答案，那这个"瞬时变化率"就不是一个确定的数。

极限正是用来解决这个困境的：不去问"Δx 等于 0 时商是多少"，而是问"当 Δx 无限接近 0 时，这个商无限接近哪个数"。如果存在这样一个确定的数，就把它定义为 f 在 x₀ 处的导数。极限让我们绕开了"除以零"，同时又抓住了"无限接近某一点"这件事。

所以顺序是：平均变化率是可以直接算的，瞬时变化率不能直接算，极限是把前者推到后者的那座桥。

反过来也说明了为什么不是所有函数在每一点都有导数——如果那个商在 Δx 趋于 0 时不趋向任何确定的数（比如从左边趋近和从右边趋近得到不同的结果），极限不存在，导数也就不存在。绝对值函数在原点就是这样。`,
};

/** A single long answer, for purposes that only see the model's output (term marking, focus
 * stations) rather than a whole round. */
export const LONG_ANSWER = ROUND.answer;
