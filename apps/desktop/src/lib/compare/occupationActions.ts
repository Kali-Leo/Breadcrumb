/**
 * Purpose: occupation-profile actions (spec 026) — normalize free input against the
 * internalized O*NET directory (candidate confirmation, no guessing), and build the chosen
 * occupation's profile fully offline from the bundled dataset (plus its timeliness patch
 * when one exists), registering tool/knowledge leaf concepts so the anchor sweep can judge
 * them. Main exports: searchOccupations, createOccupationProfile, openPracticeConversation,
 * practiceConversationTitle, OccupationHit.
 */
import type { CanonicalConceptRow } from "@breadcrumb/core-db";
import {
  buildOccupationProfile,
  type EscoConceptDict,
  type EscoOccupationEntry,
  normalizeLabel,
  type OnetOccupation,
  type TimelinessPatchItem,
} from "@breadcrumb/feature-compare";
import i18next from "i18next";
import { CANONICAL_MOUNTS } from "../../data/canonicalMounts";
import { bundledContentMatches } from "../../data/contentLanguage";
import timelinessPatches from "../../data/generated/timelinessPatches.json";
import { asStoredText } from "../../i18n/storedText";
import { getRepos } from "../platform/db";
import { newId, nowIso } from "../platform/time";
import { definitionToItemRows } from "./compareActions";

const PATCHES = timelinessPatches as Record<string, TimelinessPatchItem[]>;

interface EscoData {
  concepts: EscoConceptDict;
  occupations: Record<string, EscoOccupationEntry | undefined>;
}

/** The two reference datasets are 13.8 MB of JSON that only the occupation page ever reads.
 * Loading them through `await import()` keeps them out of the startup chunk — on a slow
 * machine that parse cost is paid once, on demand, instead of before the first paint. Same
 * cached-promise shape as the bundled language pack in diglotWeave.ts. */
let onetPromise: Promise<readonly OnetOccupation[]> | null = null;
let escoPromise: Promise<EscoData> | null = null;

function loadOccupations(): Promise<readonly OnetOccupation[]> {
  onetPromise ??= import("../../data/generated/onetDataset.json").then(
    (module) => (module.default as unknown as { occupations: OnetOccupation[] }).occupations,
  );
  return onetPromise;
}

function loadEsco(): Promise<EscoData> {
  escoPromise ??= import("../../data/generated/escoDataset.json").then(
    (module) => module.default as unknown as EscoData,
  );
  return escoPromise;
}

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
export async function searchOccupations(query: string, limit = 6): Promise<OccupationHit[]> {
  // The directory is Chinese material; in another interface language the search finds
  // nothing and the page falls through to "build a comparison with the AI", which works in
  // any language (spec 058 §3).
  if (!bundledContentMatches()) return [];
  const needle = normalizeLabel(query);
  if (needle.length < 2) return [];
  const occupations = await loadOccupations();
  const hits: OccupationHit[] = [];
  for (const occupation of occupations) {
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
  const occupations = await loadOccupations();
  const occupation = occupations.find((candidate) => candidate.code === code);
  if (occupation === undefined) return null;
  const patch = PATCHES[code] ?? [];
  const esco = await loadEsco();
  const escoEntry = esco.occupations[code];
  const definition = buildOccupationProfile(
    occupation,
    patch,
    escoEntry === undefined
      ? null
      : {
          entry: escoEntry,
          concepts: esco.concepts,
          mounts: bundledContentMatches() ? CANONICAL_MOUNTS : new Map(),
        },
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

/** The title a practice conversation is stored under — and the string
 * openPracticeConversation compares against to decide whether one already exists. It is that
 * comparison that makes the isolates unacceptable here: an invisible character is enough to
 * make an existing conversation look like a different one and be created a second time. */
export function practiceConversationTitle(label: string): string {
  return asStoredText(i18next.t("palace:frontier.practiceTitle", { label }));
}

/**
 * Finds or creates the saved-but-sidebar-hidden discussion for a practice item. A new
 * conversation is seeded with one opener message quoting the task's verbatim citation, so
 * both the learner and the model know exactly which practice this is about.
 */
export async function openPracticeConversation(label: string, sourceRef: string): Promise<string> {
  const repos = await getRepos();
  const title = practiceConversationTitle(label);
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
    content: asStoredText(i18next.t("palace:frontier.practiceOpener", { sourceRef })),
    created_at: nowIso(),
    teaching_mode: null,
    parent_id: null,
  });
  return conversationId;
}
