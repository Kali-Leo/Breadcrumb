/**
 * Purpose: occupation-profile actions (spec 026) — normalize free input against the
 * internalized O*NET directory (candidate confirmation, no guessing), and build the chosen
 * occupation's profile fully offline from the bundled dataset (plus its timeliness patch
 * when one exists), registering tool/knowledge leaf concepts so the anchor sweep can judge
 * them. Main exports: searchOccupations, createOccupationProfile, openPracticeConversation,
 * OccupationHit.
 */
import type { CanonicalConceptRow } from "@breadcrumb/core-db";
import {
  buildOccupationProfile,
  type EscoConceptDict,
  type EscoOccupationEntry,
  normalizeLabel,
  type OnetOccupation,
  type TimelinessPatchItem,
} from "@breadcrumb/plugin-compare";
import escoDataset from "../data/generated/escoDataset.json";
import onetDataset from "../data/generated/onetDataset.json";
import timelinessPatches from "../data/generated/timelinessPatches.json";
import { definitionToItemRows } from "./compareActions";
import { getRepos } from "./db";
import { newId, nowIso } from "./time";

const OCCUPATIONS = (onetDataset as { occupations: OnetOccupation[] }).occupations;
const PATCHES = timelinessPatches as Record<string, TimelinessPatchItem[]>;
const ESCO = escoDataset as unknown as {
  concepts: EscoConceptDict;
  occupations: Record<string, EscoOccupationEntry | undefined>;
};

export interface OccupationHit {
  code: string;
  title: string;
  /** The alternate title that matched, when the official title didn't. */
  matchedAlt: string | null;
}

/**
 * Normalizes free input against the internalized directory: substring match over official
 * titles first, then alternate titles. Deterministic, local, zero cost — the confirmation
 * UI shows these候选 and only an explicit pick builds anything.
 */
export function searchOccupations(query: string, limit = 6): OccupationHit[] {
  const needle = normalizeLabel(query);
  if (needle.length < 2) return [];
  const hits: OccupationHit[] = [];
  for (const occupation of OCCUPATIONS) {
    if (normalizeLabel(occupation.title).includes(needle)) {
      hits.push({ code: occupation.code, title: occupation.title, matchedAlt: null });
      continue;
    }
    const alt = occupation.alt.find((title) => normalizeLabel(title).includes(needle));
    if (alt !== undefined) {
      hits.push({ code: occupation.code, title: occupation.title, matchedAlt: alt });
    }
  }
  hits.sort((a, b) => (a.matchedAlt === null ? 0 : 1) - (b.matchedAlt === null ? 0 : 1));
  return hits.slice(0, limit);
}

/**
 * Builds and stores the occupation's profile — entirely offline (spec 026: the whole
 * directory ships with the app). Tool/knowledge leaf concepts are registered so the anchor
 * sweep can judge user nodes against them later. Returns the profile id.
 */
export async function createOccupationProfile(code: string): Promise<string | null> {
  const occupation = OCCUPATIONS.find((candidate) => candidate.code === code);
  if (occupation === undefined) return null;
  const patch = PATCHES[code] ?? [];
  const escoEntry = ESCO.occupations[code];
  const definition = buildOccupationProfile(
    occupation,
    patch,
    escoEntry === undefined ? null : { entry: escoEntry, concepts: ESCO.concepts },
  );
  const repos = await getRepos();
  await repos.comparisons.replaceProfile(
    {
      id: definition.id,
      title: definition.title,
      origin: "builtin",
      description: definition.description,
      source_note: definition.sourceNote,
      created_at: nowIso(),
      category: "occupation",
    },
    definitionToItemRows(definition),
  );

  const createdAt = nowIso();
  const conceptRows: CanonicalConceptRow[] = [];
  const seen = new Set<string>();
  for (const item of definition.items) {
    if (item.conceptId === null || seen.has(item.conceptId)) continue;
    seen.add(item.conceptId);
    conceptRows.push({
      id: item.conceptId,
      label: item.label,
      // ESCO altLabels ride along as aliases (spec 027) — they widen the free string/alias
      // pass so fewer pairs ever reach the paid semantic judge.
      aliases_json: JSON.stringify(item.aliases),
      source_ref: item.sourceRef,
      created_at: createdAt,
    });
  }
  if (conceptRows.length > 0) await repos.canonical.upsertConcepts(conceptRows);
  return definition.id;
}

/**
 * Finds or creates the saved-but-sidebar-hidden discussion for a practice item. A new
 * conversation is seeded with one opener message quoting the task's verbatim citation, so
 * both the learner and the model know exactly which practice this is about.
 */
export async function openPracticeConversation(label: string, sourceRef: string): Promise<string> {
  const repos = await getRepos();
  const title = `【实践】${label}`;
  const existing = (await repos.conversations.listByKind("practice")).find(
    (conversation) => conversation.title === title,
  );
  if (existing !== undefined) return existing.id;
  const conversationId = newId();
  await repos.conversations.create({
    id: conversationId,
    title,
    created_at: nowIso(),
    updated_at: nowIso(),
    kind: "practice",
  });
  await repos.messages.append({
    id: newId(),
    conversation_id: conversationId,
    role: "assistant",
    content: `这里探讨怎么完成这条实践——${sourceRef}。先说说你目前做到哪一步，或者手头有什么环境，从那里开始。`,
    created_at: nowIso(),
  });
  return conversationId;
}
