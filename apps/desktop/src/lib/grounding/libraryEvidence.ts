/**
 * Purpose: the reader's own library as one more evidence source for a 学习模式 round — the
 * one the resources page promises is searched first.
 *
 * The library speaks in RetrievedPassage (a parent block under its heading path); the topic
 * material speaks in EvidenceItem (a titled, addressed snippet from a provider). This is the
 * translation, and the choices in it are the ones the rest of the grounding layer reads back:
 *  - `source` is the fixed LIBRARY_SOURCE id, which the catalogue turns into 「我的资料」 and the
 *    sentence marks use to know that the title is a heading path rather than a page name;
 *  - `title` is that heading path, "书名 → 章 → 节", because a quote from the reader's own
 *    book is only identifiable by which book and which chapter;
 *  - `url` is an internal address built from the passage id. Nothing opens it; it is the key
 *    the passage builder de-duplicates on, and a passage id is unique where a heading path
 *    is not (two chapters can carry the same name).
 * The reranker is asked for only when the caller says the subject changed — see
 * core-retrieval's rerankPolicy for why it is not every turn — and the browser edition, which
 * has no reranker at all, comes back in fused order rather than with an error.
 * Main exports: libraryEvidence, gatherLibraryEvidence.
 */
import type { RetrievedPassage } from "@breadcrumb/core-retrieval";
import {
  type EvidenceItem,
  LIBRARY_SOURCE,
  TOPIC_PASSAGE_COUNT,
} from "@breadcrumb/feature-factcheck";
import i18next from "i18next";
import { retrieveFromLibrary } from "../library/libraryRetrieval";

/** One library passage in the shape the topic material is built from. */
export function libraryEvidence(passage: RetrievedPassage): EvidenceItem {
  return {
    source: LIBRARY_SOURCE,
    title: passage.headingPath,
    url: `library:${passage.id}`,
    snippet: passage.body,
  };
}

/**
 * The library's best passages for one question, at most a full topic's worth. An empty
 * library, a library still being indexed, or any failure underneath comes back as an empty
 * list — the round then fills the whole budget from the network instead.
 */
export async function gatherLibraryEvidence(
  question: string,
  rerank: boolean,
): Promise<EvidenceItem[]> {
  const passages = await retrieveFromLibrary(question, i18next.language, {
    topK: TOPIC_PASSAGE_COUNT,
    rerank,
  });
  return passages.map(libraryEvidence);
}
