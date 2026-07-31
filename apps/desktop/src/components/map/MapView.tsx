/**
 * Purpose: the knowledge map page — PixiJS world with kinetic pan/zoom, semantic zoom
 * bands, click-to-fly labels, gentle empty state. StrictMode-safe lifecycle; DEV keys
 * 1..5 = zoom presets, 0 = demo dataset toggle.
 * Main exports: MapView.
 */
import { buildWorldModel, type WorldModel, type WorldPoint } from "@breadcrumb/plugin-map";
import { Application, type Container, Point } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { useEffect, useMemo, useRef, useState } from "react";
import { useKnowledgeStore } from "../../stores/knowledgeStore";
import { useMemoryStore } from "../../stores/memoryStore";
import { demoKnowledgeNodes, demoRetentionByNode, demoSessionTrail } from "./demoWorld";
import { applyReveals, drawFootprintTrail } from "./livingMap";
import { loadMapArt } from "./mapArtAssets";
import { counterScaleLabels } from "./mapLabels";
import { mapTheme, ZOOM_PRESETS } from "./mapTheme";
import { buildWorldScene, type FlyRequest } from "./sceneBuild";
import { bandVisibility } from "./semanticZoom";

interface CameraMemory {
  x: number;
  y: number;
  scale: number;
  /** Which dataset the camera belongs to — switching datasets refits the view. */
  dataset: "real" | "demo";
}

function fitWholeWorld(viewport: Viewport, world: WorldModel): void {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const island of world.islands) {
    minX = Math.min(minX, island.center.x - island.radius * 1.6);
    minY = Math.min(minY, island.center.y - island.radius * 1.6);
    maxX = Math.max(maxX, island.center.x + island.radius * 1.6);
    maxY = Math.max(maxY, island.center.y + island.radius * 1.6);
  }
  const scale = Math.min(
    viewport.screenWidth / Math.max(maxX - minX, 1),
    viewport.screenHeight / Math.max(maxY - minY, 1),
  );
  viewport.setZoom(Math.min(Math.max(scale, 0.05), 0.9), true);
  viewport.moveCenter((minX + maxX) / 2, (minY + maxY) / 2);
}

function applyBandAlpha(parts: readonly Container[], target: number): void {
  for (const part of parts) {
    part.alpha += (target - part.alpha) * 0.18;
    part.visible = part.alpha > 0.015;
  }
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<CameraMemory | null>(null);
  const zoomPresetRef = useRef<((presetIndex: number) => void) | null>(null);

  const storeNodes = useKnowledgeStore((state) => state.nodes);
  const storeSessionNodeIds = useKnowledgeStore((state) => state.sessionNodeIds);
  const storeRetention = useMemoryStore((state) => state.retentionByNode);
  const [demoMode, setDemoMode] = useState(false);
  const previousIdsRef = useRef(new Map<string, ReadonlySet<string>>());
  const trailIdsRef = useRef<readonly string[]>([]);

  // Fog data should be fresh whenever the map opens.
  useEffect(() => {
    void useMemoryStore.getState().refresh();
  }, []);

  const nodes = demoMode ? demoKnowledgeNodes : storeNodes;
  const retentionByNode = demoMode ? demoRetentionByNode : storeRetention;
  const world = useMemo(() => buildWorldModel(nodes), [nodes]);
  trailIdsRef.current = demoMode ? demoSessionTrail : storeSessionNodeIds;

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "0") {
        setDemoMode((value) => !value);
        return;
      }
      const presetIndex = ["1", "2", "3", "4", "5"].indexOf(event.key);
      if (presetIndex >= 0) zoomPresetRef.current?.(presetIndex);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null || world.islands.length === 0) return undefined;
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
      // StrictMode mounts effects twice — a cancelled init must fully self-destroy.
      if (cancelled) {
        created.destroy(true, { children: true });
        return;
      }
      app = created;
      container.appendChild(created.canvas);

      const viewport = new Viewport({
        screenWidth: created.screen.width,
        screenHeight: created.screen.height,
        events: created.renderer.events,
      });
      viewport
        .drag()
        .pinch()
        .wheel({ smooth: 5 })
        .decelerate()
        .clampZoom({ minScale: 0.05, maxScale: 6 });
      created.stage.addChild(viewport);
      created.renderer.on("resize", (width: number, height: number) => {
        viewport.resize(width, height);
      });

      const fly = (request: FlyRequest): void => {
        viewport.animate({
          position: new Point(request.position.x, request.position.y),
          scale: request.scale,
          time: 900,
          ease: "easeInOutSine",
        });
      };
      const art = await loadMapArt();
      if (cancelled) {
        created.destroy(true, { children: true });
        return;
      }
      const datasetKey: CameraMemory["dataset"] = demoMode ? "demo" : "real";
      // Ink reveal: only places learned while the palace is open fade in.
      const currentIds: ReadonlySet<string> = new Set(
        world.islands.flatMap((i) => i.memberNodeIds),
      );
      const previousIds = previousIdsRef.current.get(datasetKey);
      const newNodeIds =
        previousIds === undefined
          ? new Set<string>()
          : new Set([...currentIds].filter((id) => !previousIds.has(id)));
      previousIdsRef.current.set(datasetKey, currentIds);

      const scene = buildWorldScene(world, retentionByNode, art, newNodeIds, fly);
      viewport.addChild(scene.root);
      const savedCamera = cameraRef.current;
      if (savedCamera === null || savedCamera.dataset !== datasetKey) {
        fitWholeWorld(viewport, world);
      } else {
        viewport.setZoom(savedCamera.scale, true);
        viewport.moveCenter(savedCamera.x, savedCamera.y);
      }
      // Dev sweep presets: 1 refits the world, 3/4 visit the first island, 5 its
      // first village — so every zoom band lands on real content.
      zoomPresetRef.current = (presetIndex) => {
        if (presetIndex === 0) {
          fitWholeWorld(viewport, world);
          return;
        }
        const scale = ZOOM_PRESETS[presetIndex] ?? 0.7;
        const firstIsland = world.islands.at(0);
        let target: WorldPoint = { x: viewport.center.x, y: viewport.center.y };
        if (presetIndex >= 2 && firstIsland !== undefined) target = firstIsland.center;
        const firstVillage = firstIsland?.kingdoms.flatMap((kingdom) => kingdom.villages).at(0);
        if (presetIndex === 4 && firstVillage !== undefined) target = firstVillage.position;
        viewport.animate({
          position: new Point(target.x, target.y),
          scale,
          time: 700,
          ease: "easeInOutSine",
        });
      };

      let footprintPhase = 0;
      created.ticker.add((ticker) => {
        const visibility = bandVisibility(viewport.scale.x);
        applyBandAlpha(scene.geoParts, visibility.geo);
        applyBandAlpha(scene.kingdomParts, visibility.kingdom);
        applyBandAlpha(scene.villageParts, visibility.village);
        applyBandAlpha(scene.detailParts, 1 - visibility.geo);
        applyBandAlpha(scene.iconParts, visibility.village * (1 - visibility.plan));
        applyBandAlpha(scene.planParts, visibility.plan);
        counterScaleLabels(scene.labelSets, viewport.scale.x);
        const deltaSeconds = ticker.deltaMS / 1000;
        scene.revealTargets = applyReveals(scene.revealTargets, deltaSeconds);
        footprintPhase += deltaSeconds * 14;
        const trailPath = trailIdsRef.current
          .map((nodeId) => scene.placePositions.get(nodeId))
          .filter((point): point is NonNullable<typeof point> => point !== undefined);
        drawFootprintTrail(scene.footprintLayer, trailPath, footprintPhase);
        cameraRef.current = {
          x: viewport.center.x,
          y: viewport.center.y,
          scale: viewport.scale.x,
          dataset: datasetKey,
        };
      });
    })();

    return () => {
      cancelled = true;
      zoomPresetRef.current = null;
      app?.destroy(true, { children: true });
      app = null;
    };
  }, [world, retentionByNode, demoMode]);

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
