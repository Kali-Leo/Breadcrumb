/**
 * Purpose: one picture per opening slide, keyed the way the slide table names them.
 * Main exports: SLIDE_ILLUSTRATIONS.
 */
import type { ComponentType } from "react";
import { ChatIllustration } from "./ChatIllustration";
import { CompanionIllustration } from "./CompanionIllustration";
import { DiscoveryIllustration } from "./DiscoveryIllustration";
import { LibraryIllustration } from "./LibraryIllustration";
import { MapIllustration } from "./MapIllustration";
import { MemoryIllustration } from "./MemoryIllustration";
import { StartIllustration } from "./StartIllustration";

export const SLIDE_IDS = [
  "chat",
  "map",
  "discovery",
  "library",
  "companions",
  "memory",
  "start",
] as const;

export type SlideId = (typeof SLIDE_IDS)[number];

export const SLIDE_ILLUSTRATIONS: Record<SlideId, ComponentType> = {
  chat: ChatIllustration,
  map: MapIllustration,
  discovery: DiscoveryIllustration,
  library: LibraryIllustration,
  companions: CompanionIllustration,
  memory: MemoryIllustration,
  start: StartIllustration,
};
