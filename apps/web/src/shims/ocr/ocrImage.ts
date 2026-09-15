/**
 * Purpose: the pixel work between a page and the two models — resizing the page for the
 * detector, and cutting each detected line out of it, straightened, at the recogniser's
 * height. Bilinear sampling throughout, which is what `cv2.resize` and `warpPerspective` do
 * at PaddleOCR's default interpolation; edges are clamped, which is `BORDER_REPLICATE`.
 *
 * Both functions hand back the three colour planes in BGR order, because that is the order
 * PaddleOCR's models were trained on: a canvas gives RGBA, and swapping the channels here
 * once is cheaper than remembering to everywhere else.
 * A third function cuts a region out of the page for the table model, which takes its crop
 * as RGBA and does its own resizing (ocrTable.ts).
 * Main exports: resizeRgbaToBgrPlanes, sampleQuadToBgrPlanes, cropRegion, TableCrop.
 */
import type { OcrBox } from "@desktop/lib/library/ocrPage";
import type { Quad } from "./ocrGeometry";

/** The colour at a fractional position, per channel, edges clamped. `x` and `y` are in
 * pixel-centre coordinates: 0 is the centre of the first pixel. */
function sampleInto(
  out: Uint8Array,
  outIndex: number,
  plane: number,
  rgba: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): void {
  const x0 = Math.min(width - 1, Math.max(0, Math.floor(x)));
  const y0 = Math.min(height - 1, Math.max(0, Math.floor(y)));
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = Math.min(1, Math.max(0, x - x0));
  const fy = Math.min(1, Math.max(0, y - y0));
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;
  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;
  // Planes are B, G, R; the source is R, G, B, A.
  for (let channel = 0; channel < 3; channel += 1) {
    const source = 2 - channel;
    const value =
      (rgba[i00 + source] as number) * w00 +
      (rgba[i10 + source] as number) * w10 +
      (rgba[i01 + source] as number) * w01 +
      (rgba[i11 + source] as number) * w11;
    out[channel * plane + outIndex] = Math.round(value);
  }
}

/** The whole image at another size, as three planes of `dstWidth × dstHeight`. */
export function resizeRgbaToBgrPlanes(
  rgba: Uint8Array,
  width: number,
  height: number,
  dstWidth: number,
  dstHeight: number,
): Uint8Array {
  const plane = dstWidth * dstHeight;
  const out = new Uint8Array(3 * plane);
  const scaleX = width / dstWidth;
  const scaleY = height / dstHeight;
  for (let y = 0; y < dstHeight; y += 1) {
    const sy = (y + 0.5) * scaleY - 0.5;
    for (let x = 0; x < dstWidth; x += 1) {
      const sx = (x + 0.5) * scaleX - 0.5;
      sampleInto(out, y * dstWidth + x, plane, rgba, width, height, sx, sy);
    }
  }
  return out;
}

export interface LineCrop {
  /** The crop's own size before any rotation, from the box's side lengths. */
  cropWidth: number;
  cropHeight: number;
  /** A line taller than it is wide by half again is vertical text, and is turned a quarter
   * turn counter-clockwise before it is read — `np.rot90` in PaddleOCR. */
  rotated: boolean;
}

/** What `get_rotate_crop_image` would produce for the box: its size, and whether it turns. */
export function lineCropOf(quad: Quad): LineCrop {
  const [tl, tr, br, bl] = quad;
  const cropWidth = Math.max(
    1,
    Math.floor(
      Math.max(Math.hypot(tr[0] - tl[0], tr[1] - tl[1]), Math.hypot(br[0] - bl[0], br[1] - bl[1])),
    ),
  );
  const cropHeight = Math.max(
    1,
    Math.floor(
      Math.max(Math.hypot(bl[0] - tl[0], bl[1] - tl[1]), Math.hypot(br[0] - tr[0], br[1] - tr[1])),
    ),
  );
  return { cropWidth, cropHeight, rotated: cropHeight / cropWidth >= 1.5 };
}

/**
 * The box's contents, straightened and resized to `outWidth × outHeight`, as BGR planes.
 * One sampling pass does what PaddleOCR does in two (a perspective warp to the crop's own
 * size, then a resize): every output pixel is located in the crop, the crop's coordinates
 * are located in the page by interpolating the box's corners, and the page is sampled there.
 */
export function sampleQuadToBgrPlanes(
  rgba: Uint8Array,
  width: number,
  height: number,
  quad: Quad,
  crop: LineCrop,
  outWidth: number,
  outHeight: number,
): Uint8Array {
  const [tl, tr, br, bl] = quad;
  const plane = outWidth * outHeight;
  const out = new Uint8Array(3 * plane);
  // The image being resized is the crop, or the crop turned: turned, its width is the crop's
  // height and a point (rx, ry) in it sits at (cropWidth - 1 - ry, rx) in the crop.
  const sourceWidth = crop.rotated ? crop.cropHeight : crop.cropWidth;
  const sourceHeight = crop.rotated ? crop.cropWidth : crop.cropHeight;
  for (let y = 0; y < outHeight; y += 1) {
    const ry = ((y + 0.5) * sourceHeight) / outHeight - 0.5;
    for (let x = 0; x < outWidth; x += 1) {
      const rx = ((x + 0.5) * sourceWidth) / outWidth - 0.5;
      const cx = crop.rotated ? crop.cropWidth - 1 - ry : rx;
      const cy = crop.rotated ? rx : ry;
      // The warp PaddleOCR asks for maps the box's corners to (0,0), (W,0), (W,H), (0,H).
      const s = cx / crop.cropWidth;
      const t = cy / crop.cropHeight;
      const px =
        (1 - s) * (1 - t) * tl[0] + s * (1 - t) * tr[0] + s * t * br[0] + (1 - s) * t * bl[0];
      const py =
        (1 - s) * (1 - t) * tl[1] + s * (1 - t) * tr[1] + s * t * br[1] + (1 - s) * t * bl[1];
      sampleInto(out, y * outWidth + x, plane, rgba, width, height, px, py);
    }
  }
  return out;
}

/** A region of the page as its own RGBA image. */
export interface TableCrop {
  rgba: Uint8Array;
  width: number;
  height: number;
}

/** Pixels of one region of the page, cut out with a margin and clamped to the page. */
export function cropRegion(
  rgba: Uint8Array,
  width: number,
  height: number,
  box: OcrBox,
  margin: number,
): TableCrop & { box: OcrBox } {
  const x0 = Math.max(0, Math.floor(box.x0 - margin));
  const y0 = Math.max(0, Math.floor(box.y0 - margin));
  const x1 = Math.min(width, Math.ceil(box.x1 + margin));
  const y1 = Math.min(height, Math.ceil(box.y1 + margin));
  const cropWidth = Math.max(1, x1 - x0);
  const cropHeight = Math.max(1, y1 - y0);
  const out = new Uint8Array(cropWidth * cropHeight * 4);
  for (let y = 0; y < cropHeight; y += 1) {
    const source = ((y0 + y) * width + x0) * 4;
    out.set(rgba.subarray(source, source + cropWidth * 4), y * cropWidth * 4);
  }
  return { rgba: out, width: cropWidth, height: cropHeight, box: { x0, y0, x1, y1 } };
}
