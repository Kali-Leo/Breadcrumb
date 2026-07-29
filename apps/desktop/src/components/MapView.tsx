/**
 * Purpose: the living ink nautical chart — a ~30fps draw loop (only while mounted)
 * renders places, smoke, cats and waves; wheel zoom with empty-sea bounce, drag panning,
 * click-to-fly, click a node to anchor and jump to chat.
 * Main exports: MapView.
 */
import { useEffect, useRef } from "react";
import { useKnowledgeStore } from "../stores/knowledgeStore";
import { useMapStore } from "../stores/mapStore";
import { useMemoryStore } from "../stores/memoryStore";
import { type Camera, CLOSE_UP_SCALE, drawMap, findNodeAt, findPlaceAt } from "./mapRender";

interface MapViewProps {
  onJumpToChat(): void;
}

export function MapView({ onJumpToChat }: MapViewProps) {
  const places = useMapStore((state) => state.places);
  const unchartedCount = useMapStore((state) => state.unchartedCount);
  const chartError = useMapStore((state) => state.chartError);
  const nodes = useKnowledgeStore((state) => state.nodes);
  const retentionByNode = useMemoryStore((state) => state.retentionByNode);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, scale: 0.8 });
  const flyRef = useRef<number | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    camX: number;
    camY: number;
    moved: boolean;
  } | null>(null);

  // Latest data for the draw loop without re-subscribing it.
  const sceneRef = useRef({
    places,
    nodeLabels: new Map<string, string>(),
    retentionByNode: retentionByNode as ReadonlyMap<string, number>,
  });
  sceneRef.current = {
    places,
    nodeLabels: new Map(nodes.map((node) => [node.id, node.label])),
    retentionByNode,
  };

  useEffect(() => {
    void useMapStore.getState().refresh();
    void useMemoryStore.getState().refresh();
    // Canvas text does not trigger lazy font loading — request the handwriting face now.
    void document.fonts.load('16px "Ma Shan Zheng"');
  }, []);

  // The heartbeat: ~30fps while the map is open, zero cost once unmounted.
  useEffect(() => {
    let frameId: number;
    let lastDraw = 0;
    const loop = (now: number) => {
      if (now - lastDraw >= 33) {
        lastDraw = now;
        const canvas = canvasRef.current;
        if (canvas) {
          drawMap(
            canvas,
            sceneRef.current.places,
            cameraRef.current,
            sceneRef.current.nodeLabels,
            now,
            sceneRef.current.retentionByNode,
          );
        }
      }
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, []);

  /** Smoothly animates the camera to a target position/zoom (~0.5s ease-out). */
  function flyTo(targetX: number, targetY: number, targetScale: number) {
    if (flyRef.current !== null) cancelAnimationFrame(flyRef.current);
    const camera = cameraRef.current;
    const from = { ...camera };
    const start = performance.now();
    const duration = 500;
    function step(now: number) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      camera.x = from.x + (targetX - from.x) * eased;
      camera.y = from.y + (targetY - from.y) * eased;
      camera.scale = from.scale + (targetScale - from.scale) * eased;
      if (progress < 1) flyRef.current = requestAnimationFrame(step);
    }
    flyRef.current = requestAnimationFrame(step);
  }

  function handleWheel(event: React.WheelEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const camera = cameraRef.current;
    const zoomingIn = event.deltaY < 0;
    const rect = canvas.getBoundingClientRect();
    const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const overPlace = findPlaceAt(places, camera, canvas, pointer.x, pointer.y) !== null;

    // Zooming into empty sea: a playful bounce instead of a zoom (Leo's design).
    if (zoomingIn && !overPlace && camera.scale > 1.1) {
      camera.scale *= 1.06;
      setTimeout(() => {
        camera.scale /= 1.06;
      }, 110);
      return;
    }
    const factor = zoomingIn ? 1.15 : 1 / 1.15;
    camera.scale = Math.min(3.2, Math.max(0.25, camera.scale * factor));
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const camera = cameraRef.current;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      camX: camera.x,
      camY: camera.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.hypot(deltaX, deltaY) > 6) drag.moved = true;
    if (!drag.moved) return;
    const camera = cameraRef.current;
    camera.x = drag.camX - deltaX / camera.scale;
    camera.y = drag.camY - deltaY / camera.scale;
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.moved) return; // a drag, not a click
    const canvas = canvasRef.current;
    if (!canvas) return;
    const camera = cameraRef.current;
    const rect = canvas.getBoundingClientRect();
    const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };

    // Close-up: clicking a knowledge node anchors it and jumps back to the chat.
    const hit = findNodeAt(places, camera, canvas, pointer.x, pointer.y);
    if (hit) {
      const knowledge = useKnowledgeStore.getState();
      if (knowledge.anchoredNodeId !== hit.nodeId) knowledge.toggleAnchor(hit.nodeId);
      onJumpToChat();
      return;
    }
    // Far view: clicking a place flies into it.
    const place = findPlaceAt(places, camera, canvas, pointer.x, pointer.y);
    if (place && camera.scale < CLOSE_UP_SCALE) {
      flyTo(place.x, place.y, Math.max(CLOSE_UP_SCALE + 0.2, camera.scale));
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: "#f6efe0" }}>
      <canvas
        ref={canvasRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
      {places.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-stone-400">
          <span className="text-4xl">🗺️</span>
          <p className="text-sm">这片海图还是空白——去学点什么，第一座小房子就会出现</p>
        </div>
      )}
      {unchartedCount > 0 && (
        <p className="absolute bottom-3 right-4 text-xs text-stone-400">
          ✍️ 还有 {unchartedCount} 个知识点正在测绘…
        </p>
      )}
      {chartError && (
        <p className="absolute top-3 left-4 max-w-md rounded bg-white/70 px-3 py-2 text-xs text-red-800">
          测绘遇到问题：{chartError}
        </p>
      )}
      <p className="absolute bottom-3 left-4 text-xs text-stone-400">
        点击地点飞入 · 近景点击知识点可锚定去聊
      </p>
    </div>
  );
}
