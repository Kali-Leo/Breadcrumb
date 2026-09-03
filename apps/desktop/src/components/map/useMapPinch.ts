/**
 * Purpose: attaches the two-finger grammar (mapPinch) to the live canvas while the screen is
 * finger-driven, and takes it off again when a mouse takes over or the map unmounts. Bound
 * only under coarse input so a trackpad's ctrl+wheel keeps its old, wheel-only meaning.
 * Main exports: useMapPinch.
 */
import { type RefObject, useEffect } from "react";
import type { MapController } from "./mapController";
import { bindMapPinch } from "./mapPinch";

export function useMapPinch(input: {
  ready: boolean;
  coarse: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  controllerRef: RefObject<MapController | null>;
}): void {
  const { ready, coarse, containerRef, controllerRef } = input;
  useEffect(() => {
    if (!ready || !coarse) return undefined;
    const canvas = containerRef.current?.querySelector("canvas");
    const controller = controllerRef.current;
    if (!canvas || controller === null) return undefined;
    return bindMapPinch(canvas, {
      open: (clientX, clientY) => controller.navigation.enterAt(clientX, clientY),
      close: () => controller.navigation.back(),
    });
  }, [ready, coarse, containerRef, controllerRef]);
}
