/**
 * Purpose: turning a file someone owns into something the app can search — parse, cut into
 * passages, analyze, and write both the passages and the keyword index in one transaction.
 *
 * The order matters and it is the whole design. The keyword index is built during the import,
 * so a book is searchable the moment the progress line disappears — seconds, not minutes. The
 * vectors are not: they are queued and filled in behind the reader's back (libraryEmbedding),
 * and until they arrive search runs on one route instead of two. That is a worse search, not a
 * broken one, and it gets better on its own while the reader is reading.
 * Main exports: importFile, LIBRARY_MEDIA_TYPES, mediaTypeOf.
 */
import type { LibraryDocumentRow, LibraryMediaType, PassageInsert } from "@breadcrumb/core-db";
import {
  type ChunkPair,
  chunkBlocks,
  type DocumentBlock,
  parseMarkdown,
  parsePdf,
  titleFromMarkdown,
  withHeadingPath,
} from "@breadcrumb/core-ingest";
import { analyze, analyzedFields, loadStemmer } from "@breadcrumb/core-text";
import { getRepos } from "../platform/db";
import { nowIso } from "../platform/time";
import { ensurePdfWorker } from "./pdfWorker";

/** What the file picker offers and what the parser knows. Deliberately three formats: they are
 * the ones a bought e-book, a course handout and one's own notes actually arrive as. */
export const LIBRARY_MEDIA_TYPES: Readonly<Record<string, LibraryMediaType>> = {
  pdf: "pdf",
  md: "markdown",
  markdown: "markdown",
  txt: "text",
  text: "text",
};

export function mediaTypeOf(fileName: string): LibraryMediaType | null {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return LIBRARY_MEDIA_TYPES[extension] ?? null;
}

export interface ImportInput {
  fileName: string;
  bytes: Uint8Array;
  /** The reader's interface language, used only to pick a stemmer for Latin script. */
  language: string;
}

export interface ImportResult {
  document: LibraryDocumentRow;
  passageCount: number;
}

function documentId(): string {
  return `lib_${crypto.randomUUID()}`;
}

async function blocksOf(input: ImportInput, title: string): Promise<DocumentBlock[]> {
  if (mediaTypeOf(input.fileName) !== "pdf") {
    return parseMarkdown(new TextDecoder().decode(input.bytes), title);
  }
  await ensurePdfWorker();
  return parsePdf(input.bytes, title);
}

function titleOf(input: ImportInput): string {
  const base = input.fileName.replace(/\.[^.]+$/, "");
  if (mediaTypeOf(input.fileName) === "pdf") return base;
  return titleFromMarkdown(new TextDecoder().decode(input.bytes), base);
}

/**
 * Reads the file, writes the document. Throws on an unsupported extension or an unreadable
 * file; the caller turns that into one sentence, because there is nothing the reader can do
 * about a corrupt PDF except try another one.
 */
export async function importFile(input: ImportInput): Promise<ImportResult> {
  const mediaType = mediaTypeOf(input.fileName);
  if (mediaType === null) throw new Error(`unsupported file type: ${input.fileName}`);
  const title = titleOf(input);
  const chunked = chunkBlocks(await blocksOf(input, title));
  if (chunked.length === 0) throw new Error("this file has no text in it");

  const stem = await loadStemmer();
  const createdAt = nowIso();
  const id = documentId();
  const passages: PassageInsert[] = [];
  let ordinal = 0;
  for (const chunk of chunked) {
    const parentId = `${id}_p${ordinal}`;
    passages.push({
      passage: {
        id: parentId,
        document_id: id,
        parent_id: null,
        ordinal,
        heading_path: chunk.parent.headingPath,
        body: chunk.parent.text,
        token_estimate: chunk.parent.tokens,
        created_at: createdAt,
      },
      // A parent is read, never searched: no index row, so it cannot compete with its own
      // children for the same question.
      ftsBody: "",
      ftsStems: "",
    });
    chunk.children.forEach((child: ChunkPair, childIndex: number) => {
      // The heading path is part of what gets indexed, not just of what gets shown: a passage
      // that says "it doubles every 18 months" never says what "it" is.
      const analyzed = analyze(withHeadingPath(child.headingPath, child.text), {
        language: input.language,
        stem,
      });
      const fields = analyzedFields(analyzed);
      passages.push({
        passage: {
          id: `${parentId}_c${childIndex}`,
          document_id: id,
          parent_id: parentId,
          ordinal,
          heading_path: child.headingPath,
          body: child.text,
          token_estimate: child.tokens,
          created_at: createdAt,
        },
        ftsBody: fields.body,
        ftsStems: fields.stems,
      });
    });
    ordinal += 1;
  }

  const document: LibraryDocumentRow = {
    id,
    title,
    origin: "upload",
    media_type: mediaType,
    language: input.language,
    passage_count: passages.length,
    created_at: createdAt,
  };
  const repos = await getRepos();
  await repos.library.importDocument(document, passages);
  return { document, passageCount: passages.length };
}
