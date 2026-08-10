/**
 * Purpose: pure builder turning one internalized O*NET occupation record into a comparison
 * profile (spec 026) — three kind-typed branches: 工作任务 (practice leaves, one per core
 * task statement, self-attested), 工具与技术 (tool leaves, anchor-matched), 知识领域
 * (knowledge/skill descriptors, anchor-matched). No LLM anywhere: rows are copied verbatim
 * from the official dataset, so the evidence chain is intrinsic.
 * Main exports: OnetOccupation, buildOccupationProfile, occupationProfileId,
 * TimelinessPatchItem, MAX_PRACTICE_TASKS.
 */
import type { ProfileDefinition, ProfileItemDefinition } from "./profileSchema";

export interface OnetOccupation {
  code: string;
  title: string;
  description: string;
  alt: string[];
  tasks: { id: string; text: string; core: boolean }[];
  tech: { name: string; hot: boolean }[];
  knowledge: { name: string; importance: number }[];
  skills: { name: string; importance: number }[];
}

/** A timeliness-patch entry aggregated from real job postings (spec 026 §4). */
export interface TimelinessPatchItem {
  label: string;
  /** How many distinct postings mentioned it. */
  postings: number;
  /** One verbatim sample quote from a posting. */
  sampleQuote: string;
  fetchedAt: string;
}

export const MAX_PRACTICE_TASKS = 30;

export function occupationProfileId(code: string): string {
  return `occ-${code}`;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Builds the profile. Core tasks come first (all of them, capped); when an occupation has
 * no core-flagged tasks the supplemental ones stand in. The timeliness patch, when present,
 * becomes a fourth branch labeled with its fetch date — a patch beside the official
 * skeleton, never a replacement (三角互证).
 */
export function buildOccupationProfile(
  occupation: OnetOccupation,
  patch: readonly TimelinessPatchItem[] = [],
): ProfileDefinition {
  const id = occupationProfileId(occupation.code);
  const source = `O*NET 30.2 · ${occupation.code}`;
  const items: ProfileItemDefinition[] = [];
  const item = (entry: ProfileItemDefinition): void => {
    items.push(entry);
  };

  const coreTasks = occupation.tasks.filter((task) => task.core);
  const tasks = (coreTasks.length > 0 ? coreTasks : occupation.tasks).slice(0, MAX_PRACTICE_TASKS);
  item({
    key: "tasks",
    parentKey: null,
    label: "工作任务（自评）",
    aliases: [],
    sourceRef: `${source} · Task Statements（在职者调查）`,
    conceptId: null,
    kind: "structure",
  });
  for (const task of tasks) {
    item({
      key: `task-${task.id}`,
      parentKey: "tasks",
      label: clip(task.text, 60),
      aliases: [],
      sourceRef: clip(`任务原文：「${task.text}」 · ${source} · Task ${task.id}`, 300),
      conceptId: null,
      kind: "practice",
    });
  }

  const tech = occupation.tech;
  if (tech.length > 0) {
    item({
      key: "tech",
      parentKey: null,
      label: "工具与技术",
      aliases: [],
      sourceRef: `${source} · Technology Skills`,
      conceptId: null,
      kind: "structure",
    });
    tech.forEach((entry, index) => {
      item({
        key: `tech-${index}`,
        parentKey: "tech",
        label: clip(entry.name, 60),
        aliases: [],
        sourceRef: `${source} · Technology Skills${entry.hot ? " · Hot Technology" : ""}`,
        conceptId: `c:${entry.name.normalize("NFKC").toLowerCase().replace(/\s+/gu, "")}`,
        kind: "tool",
      });
    });
  }

  const descriptors = [...occupation.knowledge, ...occupation.skills];
  const seen = new Set<string>();
  const unique = descriptors.filter((entry) => {
    const key = entry.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (unique.length > 0) {
    item({
      key: "knowledge",
      parentKey: null,
      label: "知识领域",
      aliases: [],
      sourceRef: `${source} · Knowledge / Skills（重要度 ≥3 的描述符）`,
      conceptId: null,
      kind: "structure",
    });
    unique.forEach((entry, index) => {
      item({
        key: `know-${index}`,
        parentKey: "knowledge",
        label: clip(entry.name, 60),
        aliases: [],
        sourceRef: `${source} · 重要度 ${entry.importance.toFixed(2)}/5`,
        conceptId: `c:${entry.name.normalize("NFKC").toLowerCase().replace(/\s+/gu, "")}`,
        kind: "knowledge",
      });
    });
  }

  if (patch.length > 0) {
    const fetchedAt = patch[0]?.fetchedAt ?? "";
    item({
      key: "patch",
      parentKey: null,
      label: `近期真实岗位要求（${fetchedAt.slice(0, 10)}）`,
      aliases: [],
      sourceRef: "时效补丁：真实招聘帖聚合，官方标准的补充而非替代（可能滞后于官方，也可能领先）",
      conceptId: null,
      kind: "structure",
    });
    patch.forEach((entry, index) => {
      item({
        key: `patch-${index}`,
        parentKey: "patch",
        label: clip(entry.label, 60),
        aliases: [],
        sourceRef: clip(
          `${entry.postings} 个真实岗位提及 · 抓取 ${entry.fetchedAt.slice(0, 10)} · 样例：「${entry.sampleQuote}」`,
          300,
        ),
        conceptId: `c:${entry.label.normalize("NFKC").toLowerCase().replace(/\s+/gu, "")}`,
        kind: "tool",
      });
    });
  }

  return {
    id,
    title: occupation.title,
    description: clip(occupation.description, 200),
    sourceNote: `O*NET 30.2 Database（U.S. Department of Labor，CC BY 4.0）· ${occupation.code} · 任务句为在职者调查原文；官方数据存在年级滞后，工具层以时效补丁三角互证`,
    items,
    category: "occupation",
  };
}
