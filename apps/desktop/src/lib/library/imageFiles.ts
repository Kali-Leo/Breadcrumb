/**
 * Purpose: a PNG or JPEG someone imported — a photographed page, a screenshot of a slide —
 * turned into the same pixels a rendered PDF page becomes, so one recognizer reads both.
 *
 * The browser decodes it: `createImageBitmap` handles every format a file input can hand
 * over, on both editions, and a canvas hands the pixels back. A photograph from a phone can
 * be four thousand pixels on a side, which is the detector's ceiling, so anything larger is
 * scaled down to fit; text on a page that size is still far taller than the model needs.
 * Main exports: decodeImageFile, MAX_IMAGE_SIDE.
 */
import type { PageImage } from "@breadcrumb/core-ingest";

/** The text detector's own limit on the long side of an image. */
export const MAX_IMAGE_SIDE = 4000;

export async function decodeImageFile(bytes: Uint8Array): Promise<PageImage> {
  const bitmap = await createImageBitmap(new Blob([bytes as unknown as BlobPart]));
  try {
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("the canvas has no 2d context to decode into");
    // White underneath: a PNG with transparency is otherwise black text on black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    canvas.width = 0;
    canvas.height = 0;
    return { width, height, rgba: new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.length) };
  } finally {
    bitmap.close();
  }
}
