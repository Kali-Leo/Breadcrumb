/**
 * Purpose: turning a file someone owns into something the app can search — parse, cut into
 * passages, analyze, and write both the passages and the keyword index in one transaction.
 *
 * The order matters and it is the whole design. The keyword index is built during the import,
 * so a book is searchable the moment the progress line disappears — seconds, not minutes. The
 * vectors are not: they are queued and filled in behind the reader's back (libraryEmbedding),
 * and until they arrive search runs on one route instead of two. That is a worse search, not a
 * broken one, and it gets better on its own while the reader is reading.
 *
 * A scanned PDF, or a photograph of a page, has no text to index until something reads it.
 * That happens here, page by page, through the recognizer the platform provides
 * (lib/platform/ocr.ts), and the caller is told which page is being read so the screen can
 * say so — a book takes a second or two a page, which is minutes, and minutes need a line.
 * Main exports: importFile, LIBRARY_MEDIA_TYPES, mediaTypeOf, ImportProgress.
 */
import type { LibraryDocumentRow, LibraryMediaType, PassageInsert } from "@breadcrumb/core-db";
import {
  type ChunkPair,
  chunkBlocks,
  type DocumentBlock,
  type PageImage,
  parseMarkdown,
  parsePdf,
  titleFromMarkdown,
  withHeadingPath,
} from "@breadcrumb/core-ingest";
import { analyze, analyzedFields, loadStemmer } from "@breadcrumb/core-text";
import i18next from "i18next";
import { asStoredText } from "../../i18n/storedText";
import { getRepos } from "../platform/db";
import { recognizePage } from "../platform/ocr";
import { nowIso } from "../platform/time";
import { decodeImageFile } from "./imageFiles";
import { ensurePdfWorker } from "./pdfWorker";

/** What the file picker offers and what the parser knows. Four kinds: the ones a bought
 * e-book, a course handout, one's own notes, and a photographed page actually arrive as. */
export const LIBRARY_MEDIA_TYPES: Readonly<Record<string, LibraryMediaType>> = {
  pdf: "pdf",
  md: "markdown",
  markdown: "markdown",
  txt: "text",
  text: "text",
  png: "image",
  jpg: "image",
  jpeg: "image",
};

export function mediaTypeOf(fileName: string): LibraryMediaType | null {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return LIBRARY_MEDIA_TYPES[extension] ?? null;
}

export interface ImportInput {
  fileName: string;
  bytes: Uint8Array;
  /** The reader's interface language: picks a stemmer for Latin script, and the recognizer
   * for a scanned page. */
  language: string;
  /** Called before each scanned page is read: which one, of how many. */
  onProgress?: (progress: ImportProgress) => void;
}

export interface ImportProgress {
  page: number;
  pageCount: number;
}

export interface ImportResult {
  document: LibraryDocumentRow;
  passageCount: number;
}

function documentId(): string {
  return `lib_${crypto.randomUUID()}`;
}

/** The recognizer, with the progress line wired in. */
function recognizer(input: ImportInput) {
  return async (image: PageImage, page: { number: number; count: number }) => {
    input.onProgress?.({ page: page.number, pageCount: page.count });
    return recognizePage(image, input.language);
  };
}

async function blocksOf(input: ImportInput, title: string): Promise<DocumentBlock[]> {
  const mediaType = mediaTypeOf(input.fileName);
  if (mediaType === "image") {
    const lines = await recognizer(input)(await decodeImageFile(input.bytes), {
      number: 1,
      count: 1,
    });
    return [{ headings: [title], text: lines.join("\n") }];
  }
  if (mediaType !== "pdf") {
    return parseMarkdown(new TextDecoder().decode(input.bytes), title);
  }
  await ensurePdfWorker();
  return parsePdf(input.bytes, title, {
    recognize: recognizer(input),
    // The heading a recognized page goes under, in the reader's language: "第 12 页". It is
    // written into the heading path and indexed, so the isolates t() draws with come off.
    pageLabel: (pageNumber) => asStoredText(i18next.t("library:page", { page: pageNumber })),
  });
}

function titleOf(input: ImportInput): string {
  const base = input.fileName.replace(/\.[^.]+$/, "");
  if (mediaTypeOf(input.fileName) !== "markdown" && mediaTypeOf(input.fileName) !== "text") {
    return base;
  }
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
