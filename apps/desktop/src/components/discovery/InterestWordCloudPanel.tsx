/**
 * Purpose: the word cloud of what the user opened — words from the titles, size by how often
 * they came up, colour by how the content felt. Placement is computed in the module; this
 * file owns the canvas, the font it measures with, and redrawing when the column resizes.
 * Main exports: InterestWordCloudPanel.
 */
import { layoutWordCloud, wordFontWeight } from "@breadcrumb/feature-browsing-interest";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBrowsingInterestStore, WORD_CLOUD_WINDOWS } from "../../stores/browsingInterestStore";
import { InterestPanel, InterestPanelEmptyLine, InterestSegmentedControl } from "./InterestPanel";

const CANVAS_HEIGHT = 380;
const FONT_FAMILY = 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';

export function InterestWordCloudPanel() {
  const { t } = useTranslation("discovery");
  const cloud = useBrowsingInterestStore((state) => state.wordCloud);
  const days = useBrowsingInterestStore((state) => state.wordCloudDays);
  const setDays = useBrowsingInterestStore((state) => state.setWordCloudDays);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0;
      if (width > 0) setCanvasWidth(width);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const words = cloud?.words ?? [];
    if (!canvas || canvasWidth === 0) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * ratio;
    canvas.height = CANVAS_HEIGHT * ratio;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, canvasWidth, CANVAS_HEIGHT);
    const fontOf = (size: number) => `${wordFontWeight(size)} ${size}px ${FONT_FAMILY}`;
    const placed = layoutWordCloud({
      words,
      width: canvasWidth,
      height: CANVAS_HEIGHT,
      measureWidth: (text, size) => {
        context.font = fontOf(size);
        return context.measureText(text).width;
      },
    });
    for (const word of placed) {
      context.font = fontOf(word.fontSize);
      context.fillStyle = word.color;
      if (word.vertical) {
        context.save();
        context.translate(word.x + word.fontSize * 0.28, word.y + 2);
        context.rotate(Math.PI / 2);
        context.fillText(word.text, 0, 0);
        context.restore();
      } else {
        context.fillText(word.text, word.x, word.y + word.height * 0.82);
      }
    }
  }, [cloud, canvasWidth]);

  return (
    <InterestPanel
      title={t("wordCloud.title")}
      controls={
        <InterestSegmentedControl
          options={WORD_CLOUD_WINDOWS.map((value) => ({
            value,
            label: t(`wordCloud.window${value}` as const),
          }))}
          value={days}
          onChange={(next) => void setDays(next)}
        />
      }
    >
      {cloud && cloud.words.length === 0 && (
        <InterestPanelEmptyLine>{t("wordCloud.empty")}</InterestPanelEmptyLine>
      )}
      <canvas
        ref={canvasRef}
        className={`block w-full ${cloud && cloud.words.length === 0 ? "hidden" : ""}`}
        style={{ height: CANVAS_HEIGHT }}
      />
    </InterestPanel>
  );
}
