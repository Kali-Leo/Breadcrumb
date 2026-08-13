/**
 * Purpose: the memory palace's Pixi lifecycle — one Application per MapView mount: renderer
 * init, art loading, controller creation, the shared ticker (ink reveals + footprint trail),
 * and teardown. Init failure is caught and surfaced as state so the page can say so instead
 * of staying blank behind a console error.
 * Main exports: useMapApplication.
 */
import { Application } from "pixi.js";
import { useEffect, useRef, useState } from "react";
import { applyReveals, drawFootprintTrail } from "./livingMap";
import { loadMapArt, resetMapArt } from "./mapArtAssets";
import { createMapController, type MapController, type MapHooks } from "./mapController";
import { mapTheme } from "./mapTheme";

export interface MapApplication {
  /** Mount target for the Pixi canvas. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** The imperative controller once ready — scene owner, camera, hover. */
  controllerRef: React.RefObject<MapController | null>;
  /** Session-trail node ids the ticker reads every frame to draw footprints. */
  trailIdsRef: React.RefObject<readonly string[]>;
  /** True once the controller exists and scenes can be set. */
  ready: boolean;
  /** True when init threw (renderer or art) — the page shows a plain message instead. */
  initFailed: boolean;
}

export function useMapApplication(hooks: MapHooks): MapApplication {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<MapController | null>(null);
  const trailIdsRef = useRef<readonly string[]>([]);
  const hooksRef = useRef(hooks);
  hooksRef.current = hooks;
  const [ready, setReady] = useState(false);
  const [initFailed, setInitFailed] = useState(false);

  // One Application for the mount's whole life — scenes rebuild, it never does.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;
    let cancelled = false;
    let app: Application | null = null;
    void (async () => {
      const created = new Application();
      await created.init({
        background: mapTheme.parchment,
        antialias: true,
        resizeTo: container,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      const art = await loadMapArt();
      if (cancelled) {
        created.destroy(true, { children: true });
        return;
      }
      app = created;
      container.appendChild(created.canvas);
      const controller = createMapController(created, art, {
        onHover: (info) => hooksRef.current.onHover(info),
        onLevel: (level) => hooksRef.current.onLevel(level),
      });
      controllerRef.current = controller;

      created.ticker.add((ticker) => {
        const deltaSeconds = ticker.deltaMS / 1000;
        controller.tick(deltaSeconds);
        const scene = controller.scene;
        if (scene !== null) {
          scene.revealTargets = applyReveals(scene.revealTargets, deltaSeconds);
          controller.footprintPhase += deltaSeconds * 14;
          const trailPath = trailIdsRef.current
            .map((nodeId) => scene.placePositions.get(nodeId))
            .filter((point): point is NonNullable<typeof point> => point !== undefined);
          drawFootprintTrail(scene.footprintLayer, trailPath, controller.footprintPhase);
        }
      });
      setReady(true);
    })().catch((error: unknown) => {
      console.error("memory palace init failed", error);
      if (!cancelled) setInitFailed(true);
    });
    return () => {
      cancelled = true;
      setReady(false);
      setInitFailed(false);
      controllerRef.current?.destroy();
      controllerRef.current = null;
      app?.destroy(true, { children: true });
      app = null;
      resetMapArt();
    };
  }, []);

  return { containerRef, controllerRef, trailIdsRef, ready, initFailed };
}
