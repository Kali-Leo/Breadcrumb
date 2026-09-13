/**
 * Purpose: labelling a finished answer against the material it was taught from — twice, and
 * the second time is the optional one.
 *
 * Why twice. The marks are only worth anything while the reader is still on the sentence they
 * belong to, so they have to be there when the answer stops moving, not seconds later. Two of
 * the three alignment routes (token overlap and a shared measurement) are pure string work and
 * cost nothing, so the first pass runs on them alone and publishes immediately. The vector
 * route is the one that needs a model, and a model is exactly the thing that can be slow, not
 * downloaded, or — as on this machine while the browser edition's model repository answers
 * 401 — never going to arrive at all. So it is never waited for: the embedder is asked in
 * parallel, and if it answers, the labels are recomputed and published as an upgrade. If it
 * does not, nothing was lost but the paraphrase route.
 *
 * Answer sentences and source sentences are embedded in ONE call, in one array, so both sides
 * of every comparison come from the same model run and the single call is the cheaper ask.
 * Main exports: annotateFinishedAnswer.
 */
import { annotateAnswer, answerSentencesOf, passageSentences } from "@breadcrumb/feature-factcheck";
import { useGroundingStore } from "../../stores/groundingStore";
import { normalizeMathDelimiters } from "../chat/markdownMath";
import { embedTexts } from "../platform/embeddings";
import { degradeSilently } from "../platform/failureLog";

export async function annotateFinishedAnswer(
  conversationId: string,
  messageId: string,
  answer: string,
): Promise<void> {
  const material = useGroundingStore.getState().materialByConversation.get(conversationId);
  if (material === undefined || material.passages.length === 0) return;
  try {
    // The display source, not the stored one: the marks are placed by offset into the string
    // the renderer walks, and math normalisation is the one thing that shifts those offsets.
    const shown = normalizeMathDelimiters(answer);
    const answerSentences = answerSentencesOf(shown);
    if (answerSentences.length === 0) return;
    const sources = passageSentences(material.passages);
    const label = (vectors: number[][] | null) =>
      annotateAnswer({
        answer: shown,
        question: material.question,
        passages: material.passages,
        answerVectors: vectors === null ? null : vectors.slice(0, answerSentences.length),
        sourceVectors: vectors === null ? null : vectors.slice(answerSentences.length),
      });

    useGroundingStore.getState().setAnnotation(messageId, label(null));

    const vectors = await embedTexts([
      ...answerSentences.map((sentence) => sentence.text),
      ...sources.map((sentence) => sentence.text),
    ]);
    if (vectors !== null) useGroundingStore.getState().setAnnotation(messageId, label(vectors));
  } catch (error) {
    // A missing annotation shows the answer with no marks, which is what every non-学习模式
    // round looks like. Never a reason to surface an error over a reply that arrived fine.
    void degradeSilently("grounding-annotation", error);
  }
}
