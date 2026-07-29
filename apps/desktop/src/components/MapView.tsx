/**
 * Purpose: the ink nautical chart — canvas rendering of knowledge places (rough.js
 * hand-drawn style), wheel zoom with empty-sea bounce, drag panning, two LOD levels.
 * Main exports: MapView.
 */
import { useEffect, useRef, useState } from "react";
import { useMapStore } from "../stores/mapStore";
import { type Camera, drawMap, findPlaceAt } from "./mapRender";

export function MapView() {
  const places = useMapStore((state) => state.places);
  const unchartedCount = useMapStore((state) => state.unchartedCount);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, scale: 0.8 });
  const [, forceRender] = useState(0);
  const dragRef = useRef<{ startX: number; startY: number; camX: number; camY: number } | null>(
    null,
  );

  useEffect(() => {
    void useMapStore.getState().refresh();
  }, []);

  // Repaint on container resize so shapes never stretch with the window.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => forceRender((tick) => tick + 1));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // No dependency array on purpose: redraw after every render (camera lives in a ref).
    const canvas = canvasRef.current;
    if (canvas) drawMap(canvas, places, cameraRef.current);
  });

  function repaint() {
    forceRender((tick) => tick + 1);
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
      repaint();
      setTimeout(() => {
        camera.scale /= 1.06;
        repaint();
      }, 110);
      return;
    }
    const factor = zoomingIn ? 1.15 : 1 / 1.15;
    const next = Math.min(3.2, Math.max(0.25, camera.scale * factor));
    camera.scale = next;
    repaint();
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const camera = cameraRef.current;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      camX: camera.x,
      camY: camera.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const camera = cameraRef.current;
    camera.x = drag.camX - (event.clientX - drag.startX) / camera.scale;
    camera.y = drag.camY - (event.clientY - drag.startY) / camera.scale;
    repaint();
  }

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: "#f6efe0" }}>
      <canvas
        ref={canvasRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => {
          dragRef.current = null;
        }}
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
    </div>
  );
}
