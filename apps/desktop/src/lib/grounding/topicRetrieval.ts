/**
 * Purpose: putting the topic's source material in front of a 学习模式 round, and deciding
 * whether this round needs new material at all.
 *
 * The order is: is this still the same topic? — if yes, reuse what is already in the prompt
 * (a follow-up costs no requests and no seconds); if no, ask the evidence layer about the
 * learner's question and take the top passages. What the providers are actually asked is
 * topicQueries' business (a whole question is too long a conjunction for a full-text index);
 * this retrieval is per topic, not per claim, so there is no extraction and no model call in
 * the path.
 *
 * A failure of any kind — no providers reachable here, the network switch off, every search
 * blocked — degrades to no material, which the round handles by teaching without a source
 * block rather than by refusing to answer.
 * Main exports: prepareRoundMaterial, openRoundMaterial.
 */
import type { ChatMessage } from "@breadcrumb/core-llm";
import { prefixTopicEntities } from "@breadcrumb/core-retrieval";
import type { EvidenceProvider } from "@breadcrumb/feature-factcheck";
import {
  buildTopicPassages,
  formatPassageBlock,
  gatherTopicEvidence,
  TOPIC_PASSAGE_COUNT,
  type TopicPassage,
  topicEntities,
  topicQueries,
  topicStillCovered,
} from "@breadcrumb/feature-factcheck";
import { type TopicMaterial, useGroundingStore } from "../../stores/groundingStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { currentEvidenceProviders } from "../factcheck/evidenceProviders";
import { embedTexts } from "../platform/embeddings";
import { degradeSilently } from "../platform/failureLog";

/** The material this round should be taught against, or null when there is none to be had. */
export async function prepareRoundMaterial(
  conversationId: string,
  question: string,
): Promise<TopicMaterial | null> {
  const settings = useSettingsStore.getState();
  if (!settings.networkEnabled) return null;
  const providers = currentEvidenceProviders(settings);

  // The question is only embedded when there is something to compare it against: on the first
  // question of a conversation the answer is "fetch" whatever the vector says, and asking for
  // one anyway would put a first-run model load in front of the very first reply.
  //
  // What is compared is the question with the topic's own entity words pasted in front of it,
  // never the bare question. An elliptical follow-up — 「那它有多高」 — shares no words and
  // almost no direction with the material it is actually about, so a bare comparison calls it
  // a new topic and sends a subject-less query to the index. That is the measured 53% loss,
  // and the first stage is where it becomes permanent. The paste is unconditional: pasting
  // only when the question "looks like" it is missing a word recovers 76% against 92%.
  const held = useGroundingStore.getState().materialByConversation.get(conversationId) ?? null;
  const retrievalQuestion = held === null ? question : prefixTopicEntities(question, held.entities);
  if (held !== null && topicStillCovered(await embedOne(retrievalQuestion), held.vectors ?? [])) {
    // With no source reachable from here there is nothing to fetch either way.
    if (providers.length === 0) return held;
    // Same topic. Passages already in hand are this topic's material; a follow-up costs
    // nothing. With none in hand (an earlier search found nothing) the rewritten question is
    // what gets asked, because it is the one that carries the subject.
    if (held.passages.length > 0) return held;
    return fetchMaterial(conversationId, question, retrievalQuestion, providers);
  }
  if (providers.length === 0) return held;
  // Drifted: the previous topic's words would be contamination, so the new subject goes to the
  // index exactly as the reader wrote it.
  return fetchMaterial(conversationId, question, question, providers);
}

async function fetchMaterial(
  conversationId: string,
  question: string,
  retrievalQuestion: string,
  providers: readonly EvidenceProvider[],
): Promise<TopicMaterial | null> {
  const store = useGroundingStore.getState();
  store.setGathering(conversationId, true);
  try {
    const found = await gatherTopicEvidence(
      providers,
      topicQueries(retrievalQuestion),
      TOPIC_PASSAGE_COUNT,
    );
    const passages = buildTopicPassages(found);
    // A search that came back with nothing is not a reason to throw away material that is
    // still on screen: the previous topic's passages are wrong for this question, but so is
    // an empty block, and the answer is labelled against whatever it was actually shown.
    if (passages.length === 0) return null;
    const material: TopicMaterial = {
      question,
      passages,
      vectors: null,
      entities: topicEntities(passages),
    };
    useGroundingStore.getState().setMaterial(conversationId, material);
    // The passage vectors are only ever read by the NEXT round's drift check, so nothing here
    // waits for them. Waiting put a model load — on the browser edition, a model load that
    // cannot succeed — in front of every first answer, which is the one place the learner is
    // watching an empty bubble.
    void attachVectors(conversationId, material);
    return material;
  } catch (error) {
    void degradeSilently("grounding-retrieval", error);
    return null;
  } finally {
    useGroundingStore.getState().setGathering(conversationId, false);
  }
}

/** Fills in a stored topic's passage vectors once the embedder answers. Writes nothing if the
 * conversation has moved on to other material in the meantime. */
async function attachVectors(conversationId: string, material: TopicMaterial): Promise<void> {
  const vectors = await embedTexts(material.passages.map((passage) => passage.text));
  if (vectors === null) return;
  const current = useGroundingStore.getState().materialByConversation.get(conversationId);
  if (current !== material) return;
  useGroundingStore.getState().setMaterial(conversationId, { ...material, vectors });
}

/** One vector for one text, or null — the drift check treats null as "re-fetch". */
async function embedOne(text: string): Promise<number[] | null> {
  const vectors = await embedTexts([text]);
  return vectors?.[0] ?? null;
}

/**
 * The round's source block, ready to unshift onto the history, plus the passages it names.
 * Empty on every round that is not a 学习模式 chat round, and on every one where no source was
 * reachable — the caller then sends exactly the prompt it sent before this feature existed.
 *
 * The block goes at index 0 of the history: attention over a long context is strongest at its
 * head, and the block only changes when the topic does, so it is a stable cacheable prefix
 * rather than per-round volatility.
 */
export async function openRoundMaterial(params: {
  isChatRound: boolean;
  studyMode: boolean;
  conversationId: string;
  question: string;
}): Promise<{ passages: TopicPassage[]; messages: ChatMessage[] }> {
  if (!params.isChatRound || !params.studyMode) return { passages: [], messages: [] };
  const material = await prepareRoundMaterial(params.conversationId, params.question);
  const passages = material?.passages ?? [];
  if (passages.length === 0) return { passages: [], messages: [] };
  return {
    passages,
    messages: [{ role: "system", content: formatPassageBlock(passages) }],
  };
}
