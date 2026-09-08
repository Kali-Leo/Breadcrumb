/**
 * Purpose: test-only lookup between the demo seed's stable concept ids and the node ids a
 * given seeding run produced. The seed deliberately carries no words in its specs — labels
 * come from the reader's language — so a test that wants to say "array-reduce" has to walk
 * back through the language's label for it. Kept out of the test file itself so that file
 * stays about the assertion it is making.
 * Main exports: DEMO_NOW, ConceptIndex, conceptIndex.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { CONCEPT_IDS, type ConceptId, demoTextFor } from "@breadcrumb/demo-seed";

/** A fixed instant so mastery/interest decay — and therefore every ranking below — is the
 * same on every machine and every day. */
export const DEMO_NOW = new Date(2026, 7, 13, 9, 0, 0);

export interface ConceptIndex {
  /** Throws for a concept the seed did not insert: a silent undefined would make an
   * assertion about it pass by comparing two nothings. */
  nodeOf(conceptId: ConceptId): string;
  /** The concept id behind a node id, or the raw id when it is not a demo node — so a
   * failure message names something a human can look up. */
  conceptOf(nodeId: string): string;
  isDemoConcept(nodeId: string): boolean;
}

export function conceptIndex(nodes: readonly KnowledgeNodeRow[], language = "zh-CN"): ConceptIndex {
  const text = demoTextFor(language);
  const idByLabel = new Map(nodes.map((node) => [node.label, node.id]));
  const nodeIdByConcept = new Map<ConceptId, string>();
  const conceptByNodeId = new Map<string, ConceptId>();
  for (const conceptId of CONCEPT_IDS) {
    const nodeId = idByLabel.get(text.concepts[conceptId][0]);
    if (nodeId === undefined) continue;
    nodeIdByConcept.set(conceptId, nodeId);
    conceptByNodeId.set(nodeId, conceptId);
  }

  return {
    nodeOf(conceptId) {
      const nodeId = nodeIdByConcept.get(conceptId);
      if (nodeId === undefined) throw new Error(`the demo seed inserted no node for ${conceptId}`);
      return nodeId;
    },
    conceptOf(nodeId) {
      return conceptByNodeId.get(nodeId) ?? nodeId;
    },
    isDemoConcept(nodeId) {
      return conceptByNodeId.has(nodeId);
    },
  };
}
