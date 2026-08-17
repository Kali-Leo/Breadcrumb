/**
 * Purpose: read what a feed entry's enclosures say about it — RSS enclosures, Atom enclosure
 * links and JSON Feed attachments all arrive here as the same small shape. They answer three
 * questions: is there a cover picture, is there a playable audio file, and what kind of item is
 * this really (an audio enclosure outranks whatever the catalog guessed).
 * Main exports: AttachmentLike, imageUrlFromAttachments, audioUrlFromAttachments,
 * kindFromAttachments.
 */
import type { CandidateItemKind } from "./candidateItem";
import { firstNonEmptyText } from "./feedText";

export interface AttachmentLike {
  url?: string;
  type?: string;
}

export function imageUrlFromAttachments(attachments: ReadonlyArray<AttachmentLike>): string | null {
  return firstNonEmptyText(attachments.find((one) => one.type?.startsWith("image/"))?.url);
}

/** The audio file itself, which is what an in-app player needs: an episode page cannot be
 * played, and most podcast feeds publish both. */
export function audioUrlFromAttachments(attachments: ReadonlyArray<AttachmentLike>): string | null {
  return firstNonEmptyText(attachments.find((one) => one.type?.startsWith("audio/"))?.url);
}

/** An audio or video enclosure is the strongest statement a feed makes about its own kind. */
export function kindFromAttachments(
  attachments: ReadonlyArray<AttachmentLike>,
  defaultKind: CandidateItemKind,
): CandidateItemKind {
  for (const attachment of attachments) {
    if (attachment.type?.startsWith("audio/")) return "podcast";
    if (attachment.type?.startsWith("video/")) return "video";
  }
  return defaultKind;
}
