/**
 * Purpose: the memory palace page — one persistent Pixi renderer, discrete level
 * jumps (world → island → kingdom → village) on the wheel with exact-fit framing,
 * no free zoom or panning. StrictMode-safe; DEV keys 0 demo, 1..4 level jumps.
 * Main exports: MapView.
 */
import { buildWorldModel } from "@breadcrumb/plugin-map";
import { Application } from "pixi.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { useKnowledgeStore } from "../../stores/knowledgeStore";
import { useMemoryStore } from "../../stores/memoryStore";
import { demoKnowledgeNodes, demoRetentionByNode, demoSessionTrail } from "./demoWorld";
import { applyReveals, drawFootprintTrail } from "./livingMap";
import { loadMapArt, resetMapArt } from "./mapArtAssets";
import { createMapController, type MapController } from "./mapController";
import { mapTheme } from "./mapTheme";

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<MapController | null>(null);
  const trailIdsRef = useRef<readonly string[]>([]);
  const previousIdsRef = useRef(new Map<string, ReadonlySet<string>>());
  const [ready, setReady] = useState(false);

  const storeNodes = useKnowledgeStore((state) => state.nodes);
  const storeSessionNodeIds = useKnowledgeStore((state) => state.sessionNodeIds);
  const storeRetention = useMemoryStore((state) => state.retentionByNode);
  const [demoMode, setDemoMode] = useState(false);

  // Fog data should be fresh whenever the palace opens.
  useEffect(() => {
    void useMemoryStore.getState().refresh();
  }, []);

  const nodes = demoMode ? demoKnowledgeNodes : storeNodes;
  const retentionByNode = demoMode ? demoRetentionByNode : storeRetention;
  const world = useMemo(() => buildWorldModel(nodes), [nodes]);
  trailIdsRef.current = demoMode ? demoSessionTrail : storeSessionNodeIds;

  // One Application for the component's whole life — scenes rebuild, it never does.
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
      const controller = createMapController(created, art);
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
    })();
    return () => {
      cancelled = true;
      setReady(false);
      controllerRef.current?.destroy();
      controllerRef.current = null;
      app?.destroy(true, { children: true });
      app = null;
      resetMapArt();
    };
  }, []);

  // Scene rebuilds on data changes; the renderer and camera model stay alive.
  useEffect(() => {
    if (!ready) return;
    controllerRef.current?.setWorld(
      world,
      retentionByNode,
      (() => {
        const datasetKey = demoMode ? "demo" : "real";
        const currentIds: ReadonlySet<string> = new Set(
          world.islands.flatMap((island) => island.memberNodeIds),
        );
        const previousIds = previousIdsRef.current.get(datasetKey);
        previousIdsRef.current.set(datasetKey, currentIds);
        return previousIds === undefined
          ? new Set<string>()
          : new Set([...currentIds].filter((id) => !previousIds.has(id)));
      })(),
    );
  }, [ready, world, retentionByNode, demoMode]);

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "0") {
        setDemoMode((value) => !value);
        return;
      }
      const jump = ["1", "2", "3", "4"].indexOf(event.key);
      if (jump >= 0) controllerRef.current?.devJump(jump);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (world.islands.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-stone-50 text-stone-400">
        <span className="text-4xl">🏛️</span>
        <p className="text-sm">你的记忆宫殿还是一片海——去聊聊天，第一座岛屿会浮现</p>
        {import.meta.env.DEV && <p className="text-xs text-stone-300">DEV：按 0 载入演示海图</p>}
      </div>
    );
  }
  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}
