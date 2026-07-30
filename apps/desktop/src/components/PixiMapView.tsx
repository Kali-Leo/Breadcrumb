/**
 * Purpose: the living map — PixiJS renderer with kinetic pan/zoom (pixi-viewport),
 * three-layer semantic zoom with cross-fades, ink fade-ins, chimney smoke, and
 * click-to-anchor at the deepest zoom.
 * Main exports: PixiMapView.
 */
import type { LayerCluster } from "@breadcrumb/plugin-map";
import { Application, Container } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { useEffect, useRef, useState } from "react";
import { useKnowledgeStore } from "../stores/knowledgeStore";
import { useMapStore } from "../stores/mapStore";
import { useMemoryStore } from "../stores/memoryStore";
import { startSmoke } from "./pixiMap/smoke";
import { loadMapTextures, type MapTextures } from "./pixiMap/textures";
import { buildWorld, updateLayerFades, type WorldHandles } from "./pixiMap/world";

/** StrictMode double-mounts spawn a throwaway app whose teardown can race Pixi internals. */
function safeDestroy(app: Application) {
  try {
    app.destroy(true, { children: true });
  } catch (error) {
    console.warn("pixi destroy race (dev-only):", error);
  }
}

interface PixiMapViewProps {
  onJumpToChat(): void;
}

export function PixiMapView({ onJumpToChat }: PixiMapViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const layered = useMapStore((state) => state.layered);
  const unchartedCount = useMapStore((state) => state.unchartedCount);
  const chartError = useMapStore((state) => state.chartError);
  const nodes = useKnowledgeStore((state) => state.nodes);
  const retentionByNode = useMemoryStore((state) => state.retentionByNode);

  const appRef = useRef<Application | null>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const worldRootRef = useRef<Container | null>(null);
  const handlesRef = useRef<WorldHandles | null>(null);
  const stopSmokeRef = useRef<(() => void) | null>(null);
  const readyRef = useRef(false);
  const texturesRef = useRef<MapTextures | null>(null);
  const [debugText, setDebugText] = useState("");

  useEffect(() => {
    void useMapStore.getState().refresh();
    void useMemoryStore.getState().refresh();
    void document.fonts.load('20px "Ma Shan Zheng"');
  }, []);

  // Engine boot: application, viewport, texture atlas — once per mount.
  // biome-ignore lint/correctness/useExhaustiveDependencies: engine boots once per mount
  useEffect(() => {
    let disposed = false;
    let initialized = false;
    const host = hostRef.current;
    if (!host) return;
    const app = new Application();
    void (async () => {
      await app.init({ background: "#ffffff", resizeTo: host, antialias: true });
      initialized = true;
      texturesRef.current = await loadMapTextures();
      if (disposed) {
        safeDestroy(app);
        return;
      }
      host.appendChild(app.canvas);
      const viewport = new Viewport({
        events: app.renderer.events,
        worldWidth: 4000,
        worldHeight: 4000,
      });
      viewport.drag().pinch().wheel({ smooth: 4 }).decelerate({ friction: 0.93 });
      viewport.clampZoom({ minScale: 0.18, maxScale: 3.6 });
      viewport.moveCenter(0, 0);
      viewport.setZoom(1.35, true);
      app.stage.addChild(viewport);
      const worldRoot = new Container();
      viewport.addChild(worldRoot);
      app.ticker.add(() => {
        const handles = handlesRef.current;
        if (handles) updateLayerFades(handles, viewport.scale.x);
      });
      appRef.current = app;
      viewportRef.current = viewport;
      worldRootRef.current = worldRoot;
      readyRef.current = true;
      rebuild();
    })();
    return () => {
      disposed = true;
      readyRef.current = false;
      stopSmokeRef.current?.();
      // Destroying before init() resolves crashes Pixi — the async block handles that case.
      if (initialized) safeDestroy(app);
      appRef.current = null;
    };
  }, []);

  function rebuild() {
    const worldRoot = worldRootRef.current;
    const currentLayered = useMapStore.getState().layered;
    if (!readyRef.current || !worldRoot || !currentLayered) return;
    const knowledge = useKnowledgeStore.getState();
    const labels = new Map(knowledge.nodes.map((node) => [node.id, node.label]));
    stopSmokeRef.current?.();
    const textures = texturesRef.current;
    if (!textures) return;
    const handles = buildWorld(
      worldRoot,
      textures,
      currentLayered,
      useMemoryStore.getState().retentionByNode,
      labels,
      {
        onVillageTap: (cluster: LayerCluster) => {
          const viewport = viewportRef.current;
          if (!viewport) return;
          if (viewport.scale.x < 2.1) {
            viewport.animate({
              position: { x: cluster.x, y: cluster.y },
              scale: 2.4,
              time: 700,
              ease: "easeInOutSine",
            });
          }
        },
        onNodeTap: (nodeId: string) => {
          const store = useKnowledgeStore.getState();
          if (store.anchoredNodeId !== nodeId) store.toggleAnchor(nodeId);
          onJumpToChat();
        },
      },
    );
    handlesRef.current = handles;
    stopSmokeRef.current = startSmoke(handles.layers.village, handles.villageSprites);
    const viewport = viewportRef.current;
    setDebugText(
      `村${currentLayered.village.length} 国${currentLayered.kingdom.length} ` +
        `地${currentLayered.geo.length} 精灵${handles.villageSprites.size} ` +
        `scale=${viewport?.scale.x.toFixed(2)}`,
    );
  }

  // Rebuild the world whenever knowledge, memory or layout change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: rebuild reads stores directly
  useEffect(() => {
    rebuild();
  }, [layered, nodes, retentionByNode]);

  const isEmpty = !layered || layered.village.length === 0;
  return (
    <div className="relative h-full w-full overflow-hidden bg-white">
      <div ref={hostRef} className="h-full w-full" />
      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-stone-400">
          <span className="text-4xl">🗺️</span>
          <p className="text-sm">这片世界还是空白——去学点什么，第一座小屋就会出现</p>
        </div>
      )}
      {unchartedCount > 0 && (
        <p className="absolute bottom-3 right-4 text-xs text-stone-400">
          ✍️ 还有 {unchartedCount} 个知识点正在测绘…
        </p>
      )}
      {chartError && (
        <p className="absolute top-3 left-4 max-w-md rounded bg-white/80 px-3 py-2 text-xs text-red-800">
          测绘遇到问题：{chartError}
        </p>
      )}
      <p className="absolute bottom-3 left-4 text-xs text-stone-400">
        滚轮缩放穿越三层世界 · 点击村落飞入 · 最深处点击知识点可锚定去聊
      </p>
      {debugText && (
        <p className="absolute top-3 right-4 rounded bg-black/70 px-2 py-1 text-xs text-white">
          {debugText}
        </p>
      )}
    </div>
  );
}
