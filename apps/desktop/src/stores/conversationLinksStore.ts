/**
 * Purpose: zustand store for which of the reader's documents a conversation is answered
 * from, and the remembered sets of documents — collections — those ties are made from.
 *
 * The null key is the new-conversation composer: its links live here only, and move onto the
 * conversation the first message creates (adoptNewConversation). Everything else is written
 * through to the database as it changes, because the round reads the row, not this store.
 *
 * A collection is never saved by an explicit act. Once a conversation tied to two or more
 * documents has sent a message, that set is a combination the reader has actually used, so it
 * is remembered under a name the titles give it (rememberCollection, on chat:messageSent). A
 * set that already exists is reused rather than saved twice. Changing the material of a
 * conversation that came from a collection does not touch the collection: the panel shows
 * the difference and asks, and updateBoundCollection / setBinding are the two answers.
 * Main exports: useConversationLinksStore.
 */
import type { LibraryCollection } from "@breadcrumb/core-db";
import { create } from "zustand";
import { findOrCreateCollection } from "../lib/library/collectionRemember";
import { getRepos } from "../lib/platform/db";
import { degradeSilently } from "../lib/platform/failureLog";
import { nowIso } from "../lib/platform/time";
import { appEventBus } from "./chatStore";
import { useGroundingStore } from "./groundingStore";

type Key = string | null;

interface ConversationLinksState {
  linksByConversation: ReadonlyMap<Key, readonly string[]>;
  /** The collection a conversation's links came from; absent or null when picked by hand. */
  collectionByConversation: ReadonlyMap<Key, string | null>;
  collections: LibraryCollection[];
  /** Reads a conversation's links and binding from the row, and the collection list. */
  load(conversationId: Key): Promise<void>;
  loadCollections(): Promise<void>;
  linkedDocumentIds(conversationId: Key): readonly string[];
  boundCollectionId(conversationId: Key): string | null;
  /** Replaces the links by hand. The binding stays: the panel reads the drift from it. */
  setLinks(conversationId: Key, documentIds: readonly string[]): Promise<void>;
  /** Links become the collection's members, and the conversation is bound to it. */
  applyCollection(conversationId: Key, collectionId: string): Promise<void>;
  /** Null unbinds: the conversation keeps its links as its own. */
  setBinding(conversationId: Key, collectionId: string | null): Promise<void>;
  /** The bound collection's members become the conversation's current links. Conversations
   * already made from it keep what they have; later ones get the new set. */
  updateBoundCollection(conversationId: Key): Promise<void>;
  renameCollection(collectionId: string, name: string): Promise<void>;
  deleteCollection(collectionId: string): Promise<void>;
  /** Moves the new-conversation composer's links onto the conversation just born. */
  adoptNewConversation(conversationId: string): Promise<void>;
  /** Saves the conversation's set as a collection if it is one worth remembering. */
  rememberCollection(conversationId: string): Promise<void>;
}

function withEntry<V>(map: ReadonlyMap<Key, V>, key: Key, value: V): Map<Key, V> {
  return new Map(map).set(key, value);
}

export const useConversationLinksStore = create<ConversationLinksState>((set, get) => {
  async function persistLinks(conversationId: Key, documentIds: readonly string[]) {
    set((state) => ({
      linksByConversation: withEntry(state.linksByConversation, conversationId, documentIds),
    }));
    if (conversationId === null) return;
    useGroundingStore.getState().clearMaterial(conversationId);
    const repos = await getRepos();
    await repos.libraryCollections.setLinks(conversationId, documentIds, nowIso());
  }

  async function persistBinding(conversationId: Key, collectionId: string | null) {
    set((state) => ({
      collectionByConversation: withEntry(
        state.collectionByConversation,
        conversationId,
        collectionId,
      ),
    }));
    if (conversationId === null) return;
    const repos = await getRepos();
    await repos.conversations.setLibraryCollection(conversationId, collectionId);
  }

  return {
    linksByConversation: new Map(),
    collectionByConversation: new Map(),
    collections: [],

    async load(conversationId) {
      await get().loadCollections();
      if (conversationId === null) return;
      const repos = await getRepos();
      const [documentIds, row] = await Promise.all([
        repos.libraryCollections.listLinkedDocumentIds(conversationId),
        repos.conversations.getById(conversationId),
      ]);
      set((state) => ({
        linksByConversation: withEntry(state.linksByConversation, conversationId, documentIds),
        collectionByConversation: withEntry(
          state.collectionByConversation,
          conversationId,
          row?.library_collection_id ?? null,
        ),
      }));
    },

    async loadCollections() {
      const repos = await getRepos();
      set({ collections: await repos.libraryCollections.listCollections() });
    },

    linkedDocumentIds(conversationId) {
      return get().linksByConversation.get(conversationId) ?? [];
    },

    boundCollectionId(conversationId) {
      return get().collectionByConversation.get(conversationId) ?? null;
    },

    async setLinks(conversationId, documentIds) {
      await persistLinks(conversationId, documentIds);
    },

    async applyCollection(conversationId, collectionId) {
      const collection = get().collections.find((entry) => entry.id === collectionId);
      if (collection === undefined) return;
      await persistLinks(conversationId, collection.documentIds);
      await persistBinding(conversationId, collectionId);
    },

    async setBinding(conversationId, collectionId) {
      await persistBinding(conversationId, collectionId);
    },

    async updateBoundCollection(conversationId) {
      const collectionId = get().boundCollectionId(conversationId);
      if (collectionId === null) return;
      const repos = await getRepos();
      const members = get().linkedDocumentIds(conversationId);
      await repos.libraryCollections.setMembers(collectionId, members, nowIso());
      await get().loadCollections();
    },

    async renameCollection(collectionId, name) {
      const trimmed = name.trim();
      if (trimmed === "") return;
      const repos = await getRepos();
      await repos.libraryCollections.renameCollection(collectionId, trimmed, nowIso());
      await get().loadCollections();
    },

    async deleteCollection(collectionId) {
      const repos = await getRepos();
      await repos.libraryCollections.deleteCollection(collectionId);
      const unbound = new Map(get().collectionByConversation);
      for (const [key, bound] of unbound) if (bound === collectionId) unbound.set(key, null);
      set({ collectionByConversation: unbound });
      await get().loadCollections();
    },

    async adoptNewConversation(conversationId) {
      const documentIds = get().linkedDocumentIds(null);
      const collectionId = get().boundCollectionId(null);
      set((state) => {
        const links = new Map(state.linksByConversation);
        const bindings = new Map(state.collectionByConversation);
        links.delete(null);
        bindings.delete(null);
        return { linksByConversation: links, collectionByConversation: bindings };
      });
      if (documentIds.length === 0) return;
      await persistLinks(conversationId, documentIds);
      await persistBinding(conversationId, collectionId);
    },

    async rememberCollection(conversationId) {
      const documentIds = get().linkedDocumentIds(conversationId);
      if (documentIds.length < 2 || get().boundCollectionId(conversationId) !== null) return;
      const collectionId = await findOrCreateCollection(await getRepos(), documentIds);
      await persistBinding(conversationId, collectionId);
      await get().loadCollections();
    },
  };
});

appEventBus.on("chat:messageSent", ({ conversationId }) => {
  useConversationLinksStore
    .getState()
    .rememberCollection(conversationId)
    .catch((error: unknown) => void degradeSilently("conversationLinks", error));
});
