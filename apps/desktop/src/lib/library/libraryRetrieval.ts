/**
 * Purpose: the app's end of `retrieve` — what the generation layer calls when it wants
 * passages from the reader's own material.
 *
 * Three things happen here that the headless package deliberately does not know about: where
 * the vectors live (SQLite, read whole and packed once per query, because this is a personal
 * library of thousands of passages and a brute-force dot product over it is milliseconds),
 * where the reranker lives (a Rust command that may not have its model yet), and what language
 * the question is in.
 *
 * The reranker is wired as a hook rather than a step. It is worth a great deal — macro
 * nDCG@10 0.476 → 0.750 — and costs about five seconds for fifty candidates on a desktop
 * processor, so whether to spend it is a policy decision, and the policy lives with the
 * conversation (createRerankPolicy), not here.
 *
 * A scope — the documents one conversation is tied to — narrows both routes at the source:
 * the keyword index and the vector table are asked for those documents only, so a passage
 * from an unlinked book cannot reach the fusion stage at all.
 * Main exports: retrieveFromLibrary, libraryRetrievalDeps, LibraryRetrieveOptions.
 */
import {
  type RetrievalDeps,
  type RetrievedPassage,
  type RetrieveOptions,
  retrieve,
} from "@breadcrumb/core-retrieval";
import { loadStemmer } from "@breadcrumb/core-text";
import { invoke } from "@tauri-apps/api/core";
import { getRepos } from "../platform/db";
import { embedTexts } from "../platform/embeddings";
import { degradeSilently } from "../platform/failureLog";
import { EMBEDDING_MODEL, rankByCosine } from "./libraryVectors";

/**
 * The stored vectors are read BEFORE the question is embedded, and that order is the whole
 * point. A library whose vectors have not been computed yet has nothing for a question vector
 * to be compared against, so embedding it would be a model download — minutes, on a first run
 * — spent to rank an empty list. Reading the rows first means search in that window costs one
 * cheap query and answers on keywords alone, which is exactly what it is supposed to do.
 */
async function vectorSearch(
  question: string,
  limit: number,
  documentIds: readonly string[] | undefined,
): Promise<string[]> {
  const repos = await getRepos();
  const rows = await repos.library.listPassageVectors(EMBEDDING_MODEL, documentIds);
  if (rows.length === 0) return [];
  const vectors = await embedTexts([question]);
  const query = vectors?.[0];
  if (query === undefined) return [];
  return rankByCosine(query, rows, limit);
}

async function keywordSearch(
  match: string,
  limit: number,
  documentIds: readonly string[] | undefined,
): Promise<string[]> {
  const repos = await getRepos();
  const hits = await repos.library.searchKeyword(match, limit, documentIds);
  return hits.map((hit) => hit.passage_id);
}

/** Child id -> the parent block to read. A child whose parent has gone (a half-deleted
 * document) is dropped rather than returned without its text. */
async function resolveParents(childIds: readonly string[]): Promise<Map<string, RetrievedPassage>> {
  const repos = await getRepos();
  const children = await repos.library.getPassages(childIds);
  const parentIds = [...new Set(children.map((child) => child.parent_id ?? child.id))];
  const parents = new Map(
    (await repos.library.getPassages(parentIds)).map((parent) => [
      parent.id,
      {
        id: parent.id,
        documentId: parent.document_id,
        headingPath: parent.heading_path,
        body: parent.body,
      },
    ]),
  );
  const byChild = new Map<string, RetrievedPassage>();
  for (const child of children) {
    const parent = parents.get(child.parent_id ?? child.id);
    if (parent !== undefined) byChild.set(child.id, parent);
  }
  return byChild;
}

/** One score per passage, in the order given. Null on any failure — the caller treats a
 * missing reranker as "no second stage", which is a good answer rather than no answer. */
async function rerank(
  question: string,
  passages: readonly RetrievedPassage[],
): Promise<readonly number[]> {
  return invoke<number[]>("rerank_pairs", {
    query: question,
    passages: passages.map((passage) => `${passage.headingPath}\n${passage.body}`),
    allowDownload: false,
  });
}

export interface LibraryRetrieveOptions extends RetrieveOptions {
  /** Only these documents are searched. Undefined means the whole library. */
  documentIds?: readonly string[];
}

export async function libraryRetrievalDeps(
  language: string,
  documentIds?: readonly string[],
): Promise<RetrievalDeps> {
  return {
    keywordSearch: (match, limit) => keywordSearch(match, limit, documentIds),
    vectorSearch: (question, limit) => vectorSearch(question, limit, documentIds),
    resolveParents,
    rerank,
    language,
    // Both sides of the index have to cut words in the same places, so the query is stemmed
    // with the same stemmer the passages were.
    stem: await loadStemmer(),
  };
}

/**
 * The call the generation layer makes. Every failure degrades to an empty list rather than
 * throwing: an answer without the reader's own material is a worse answer, and an error where
 * an answer should be is not an answer at all.
 */
export async function retrieveFromLibrary(
  question: string,
  language: string,
  options: LibraryRetrieveOptions = {},
): Promise<RetrievedPassage[]> {
  try {
    const deps = await libraryRetrievalDeps(language, options.documentIds);
    return await retrieve(question, deps, options);
  } catch (error) {
    void degradeSilently("libraryRetrieval", error);
    return [];
  }
}
