/**
 * Purpose: pure builder of the ESCO-derived 知识与技能 branch (spec 027) — essential/optional
 * sections of fine-grained ESCO concepts, with directly-listed broad concepts expanded one
 * narrower level as sub-nodes. Verbatim official data (CC BY 4.0), no LLM anywhere.
 * Main exports: EscoOccupationEntry, EscoConceptDict, buildEscoKnowledgeBranch.
 */
import type { ProfileItemDefinition } from "./profileSchema";

/** One concept reference in an occupation's skill list; children are narrower concept ids
 * that are not themselves directly listed for the occupation (deduped at extraction). */
export interface EscoConceptRef {
  id: string;
  children?: string[];
}

export interface EscoOccupationEntry {
  /** Which ESCO occupations the O*NET code mapped through, with the crosswalk match type. */
  via: { title: string; matchType: string }[];
  essential: EscoConceptRef[];
  optional: EscoConceptRef[];
}

export type EscoConceptDict = Record<
  string,
  { label: string; type: string; aliases: string[] } | undefined
>;

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function conceptIdOf(label: string): string {
  return `c:${label.normalize("NFKC").toLowerCase().replace(/\s+/gu, "")}`;
}

/**
 * Builds the flat item list of the branch (root item key "esco"). Every leaf cites ESCO and
 * the crosswalk path it arrived through, so a wrong-occupation mapping stays inspectable
 * (spec 027 三问). Concepts are deduped across the whole branch — a narrower concept shown
 * under one parent never repeats under another.
 */
export function buildEscoKnowledgeBranch(
  entry: EscoOccupationEntry,
  concepts: EscoConceptDict,
): ProfileItemDefinition[] {
  const via = entry.via.map((v) => `${v.matchType}→${v.title}`).join("、");
  const source = clip(`ESCO v1.2.1（欧盟，CC BY 4.0）· 官方对照 ${via}`, 200);
  const items: ProfileItemDefinition[] = [];
  items.push({
    key: "esco",
    parentKey: null,
    label: "知识与技能",
    aliases: [],
    sourceRef: source,
    conceptId: null,
    kind: "structure",
  });

  const used = new Set<string>();
  const leaf = (id: string, parentKey: string, note: string): void => {
    const concept = concepts[id];
    if (concept === undefined || used.has(id)) return;
    used.add(id);
    items.push({
      key: `esco-${id}`,
      parentKey,
      label: clip(concept.label, 60),
      aliases: concept.aliases.filter((a) => a.length > 0 && a.length <= 60).slice(0, 12),
      sourceRef: clip(
        `${source} · ${concept.type === "knowledge" ? "知识概念" : "技能概念"} · ${note}`,
        300,
      ),
      conceptId: conceptIdOf(concept.label),
      kind: "knowledge",
    });
  };

  const section = (
    key: string,
    label: string,
    refs: readonly EscoConceptRef[],
    note: string,
  ): void => {
    if (refs.length === 0) return;
    items.push({
      key,
      parentKey: "esco",
      label,
      aliases: [],
      sourceRef: clip(`${source} · ${note}`, 300),
      conceptId: null,
      kind: "structure",
    });
    for (const ref of refs) {
      const parentConcept = concepts[ref.id];
      const childIds = (ref.children ?? []).filter(
        (id) => concepts[id] !== undefined && !used.has(id),
      );
      if (parentConcept !== undefined && childIds.length > 0 && !used.has(ref.id)) {
        // Broad concept with surviving narrower children — becomes a sub-node so the tree
        // keeps its outline shape instead of one long flat list.
        used.add(ref.id);
        const groupKey = `esco-${ref.id}`;
        items.push({
          key: groupKey,
          parentKey: key,
          label: clip(parentConcept.label, 60),
          aliases: [],
          sourceRef: clip(`${source} · ${note} · 下级为 ESCO narrower 概念`, 300),
          conceptId: null,
          kind: "structure",
        });
        for (const childId of childIds) {
          leaf(childId, groupKey, `「${clip(parentConcept.label, 40)}」的下级概念`);
        }
      } else {
        // Plain leaf; if the parent was already shown elsewhere its surviving children
        // still land here — nothing is silently dropped.
        leaf(ref.id, key, note);
        for (const childId of childIds) leaf(childId, key, note);
      }
    }
  };

  section("esco-ess", "必备", entry.essential, "ESCO essential（必备）");
  section("esco-opt", "可选", entry.optional, "ESCO optional（可选）");
  return items.length > 1 ? items : [];
}
