/**
 * Purpose: the knowledge map page — PixiJS world with kinetic pan/zoom, semantic zoom
 * bands, click-to-fly labels, gentle empty state. StrictMode-safe lifecycle; DEV keys
 * 1..5 = zoom presets, 0 = demo dataset toggle.
 * Main exports: MapView.
 */
import { buildWorldModel, type WorldModel } from "@breadcrumb/plugin-map";
import { Application, type Container, Point } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { useEffect, useMemo, useRef, useState } from "react";
import { useKnowledgeStore } from "../../stores/knowledgeStore";
import { useMemoryStore } from "../../stores/memoryStore";
import { demoKnowledgeNodes, demoRetentionByNode } from "./demoWorld";
import { mapTheme, ZOOM_PRESETS } from "./mapTheme";
import { buildWorldScene, type FlyRequest } from "./sceneBuild";
import { bandVisibility } from "./semanticZoom";

interface CameraMemory {
  x: number;
  y: number;
  scale: number;
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
  const zoomPresetRef = useRef<((scale: number) => void) | null>(null);

  const storeNodes = useKnowledgeStore((state) => state.nodes);
  const storeRetention = useMemoryStore((state) => state.retentionByNode);
  const [demoMode, setDemoMode] = useState(false);

  // Fog data should be fresh whenever the map opens.
  useEffect(() => {
    void useMemoryStore.getState().refresh();
  }, []);

  const nodes = demoMode ? demoKnowledgeNodes : storeNodes;
  const retentionByNode = demoMode ? demoRetentionByNode : storeRetention;
  const world = useMemo(() => buildWorldModel(nodes), [nodes]);

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "0") {
        cameraRef.current = null;
        setDemoMode((value) => !value);
        return;
      }
      const presetIndex = ["1", "2", "3", "4", "5"].indexOf(event.key);
      if (presetIndex >= 0) zoomPresetRef.current?.(ZOOM_PRESETS[presetIndex] ?? 0.7);
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
      const scene = buildWorldScene(world, retentionByNode, fly);
      viewport.addChild(scene.root);

      const savedCamera = cameraRef.current;
      if (savedCamera === null) {
        fitWholeWorld(viewport, world);
      } else {
        viewport.setZoom(savedCamera.scale, true);
        viewport.moveCenter(savedCamera.x, savedCamera.y);
      }
      zoomPresetRef.current = (scale) => {
        viewport.animate({ scale, time: 700, ease: "easeInOutSine" });
      };

      created.ticker.add(() => {
        const visibility = bandVisibility(viewport.scale.x);
        applyBandAlpha(scene.geoParts, visibility.geo);
        applyBandAlpha(scene.kingdomParts, visibility.kingdom);
        applyBandAlpha(scene.villageParts, visibility.village);
        cameraRef.current = { x: viewport.center.x, y: viewport.center.y, scale: viewport.scale.x };
      });
    })();

    return () => {
      cancelled = true;
      zoomPresetRef.current = null;
      app?.destroy(true, { children: true });
      app = null;
    };
  }, [world, retentionByNode]);

  if (world.islands.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-stone-50 text-stone-400">
        <span className="text-4xl">🧭</span>
        <p className="text-sm">海图待展开——去聊聊天，第一座岛屿会浮现</p>
        {import.meta.env.DEV && <p className="text-xs text-stone-300">DEV：按 0 载入演示海图</p>}
      </div>
    );
  }
  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}
