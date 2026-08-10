/**
 * Purpose: pure builder of the ESCO-derived 知识与技能 branch (spec 027/028) — essential/
 * optional sections where knowledge-type concepts become UNSCORED hubs (MATLAB-class
 * entities never take binary scores; canonical subtrees mount under them where available)
 * and skill/competence phrases become attestation-scored practice items. Verbatim official
 * data (CC BY 4.0), no LLM anywhere.
 * Main exports: EscoOccupationEntry, EscoConceptDict, buildEscoKnowledgeBranch.
 */
import type { ProfileItemDefinition } from "./profileSchema";
import { type MountableSubtree, mountSubtreeUnder } from "./subtreeMount";

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

function normalized(label: string): string {
  return label.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");
}

/**
 * Builds the flat item list of the branch (root item key "esco"). Knowledge-type concepts
 * are hubs: no conceptId, no binary score — their only paths to a number are a mounted
 * canonical subtree (here) or on-demand decomposition (spec 028 §3). Skill/competence
 * phrases carry conceptId only for 线索 anchoring; they score by attestation. Every item
 * cites ESCO and the crosswalk path it arrived through (spec 027 三问).
 */
export function buildEscoKnowledgeBranch(
  entry: EscoOccupationEntry,
  concepts: EscoConceptDict,
  mounts: ReadonlyMap<string, MountableSubtree> = new Map(),
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
  const mountedSubtrees = new Set<string>();

  const emit = (id: string, parentKey: string, note: string): void => {
    const concept = concepts[id];
    if (concept === undefined || used.has(id)) return;
    used.add(id);
    const isHub = concept.type === "knowledge";
    const key = `esco-${id}`;
    const aliases = concept.aliases.filter((a) => a.length > 0 && a.length <= 60).slice(0, 12);
    const mount = isHub ? mounts.get(normalized(concept.label)) : undefined;
    const mountable = mount !== undefined && !mountedSubtrees.has(mount.id);
    items.push({
      key,
      parentKey,
      label: clip(concept.label, 60),
      aliases,
      sourceRef: clip(
        isHub
          ? `${source} · 知识概念（整域，不做二元计分）· ${note}${mountable ? ` · 已挂载：${mount.note}` : ""}`
          : `${source} · 技能条目（自陈计分）· ${note}`,
        300,
      ),
      conceptId: `c:${normalized(concept.label)}`,
      kind: isHub ? "hub" : "practice",
    });
    if (mountable) {
      mountedSubtrees.add(mount.id);
      items.push(...mountSubtreeUnder(key, mount));
    }
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
        // Broad concept with surviving narrower children — its narrower concepts nest
        // under it, keeping the outline shape (children are hubs/practice themselves).
        emit(ref.id, key, note);
        const groupKey = `esco-${ref.id}`;
        for (const childId of childIds) {
          emit(childId, groupKey, `「${clip(parentConcept.label, 40)}」的下级概念`);
        }
      } else {
        emit(ref.id, key, note);
        for (const childId of childIds) leafFallback(childId, key, note);
      }
    }
  };
  // A child whose parent was already shown elsewhere still lands in the section directly.
  const leafFallback = (id: string, parentKey: string, note: string): void => {
    emit(id, parentKey, note);
  };

  section("esco-ess", "必备", entry.essential, "ESCO essential（必备）");
  section("esco-opt", "可选", entry.optional, "ESCO optional（可选）");
  return items.length > 1 ? items : [];
}
