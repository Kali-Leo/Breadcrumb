/**
 * Purpose: turning a set of documents a conversation has actually used into a saved
 * collection — reusing one that already holds exactly that set, or creating one under the
 * name the titles give it (collectionName.ts), in the interface's language.
 * Main exports: findOrCreateCollection.
 */
import type { LibraryDocumentRow } from "@breadcrumb/core-db";
import { sameDocumentSet } from "@breadcrumb/core-db";
import i18next from "i18next";
import type { Repos } from "../platform/db";
import { newId, nowIso } from "../platform/time";
import { autoCollectionName } from "./collectionName";

function titlesOf(documents: readonly LibraryDocumentRow[], documentIds: readonly string[]) {
  return documentIds.map((id) => documents.find((document) => document.id === id)?.title ?? "");
}

/** The id of the collection holding exactly `documentIds`, created if there was none. */
export async function findOrCreateCollection(
  repos: Pick<Repos, "library" | "libraryCollections">,
  documentIds: readonly string[],
): Promise<string> {
  const existing = (await repos.libraryCollections.listCollections()).find((collection) =>
    sameDocumentSet(collection.documentIds, documentIds),
  );
  if (existing !== undefined) return existing.id;
  const titles = titlesOf(await repos.library.listDocuments(), documentIds);
  const name = autoCollectionName(titles, {
    pair: (first, second) => i18next.t("chat:links.autoName.pair", { first, second }),
    more: (first, second, count) => i18next.t("chat:links.autoName.more", { first, second, count }),
  });
  const now = nowIso();
  const id = newId();
  await repos.libraryCollections.createCollection(
    { id, name, created_at: now, updated_at: now },
    documentIds,
  );
  return id;
}
