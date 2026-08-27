"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Square-crops a logo before it is saved.
 *
 * Every place a brand's mark appears is a square — the nav, the sign-in card,
 * a client card — so a wide file used to be squeezed into one and came out
 * looking crushed. Rather than letting the layout distort the picture, the
 * picture is made square here, once, by the person who can see whether it
 * looks right.
 *
 * It opens fitted, showing the whole file inside the square with nothing cut,
 * which is never worse than what the board would have done with it. Zooming in
 * from there is a deliberate crop.
 *
 * The output is always a 512px PNG, so it also settles file size: a phone photo
 * of a logo comes out as a few tens of kilobytes. PNG rather than JPEG because
 * a mark on a transparent background has to stay transparent.
 */

const OUT = 512;
const MAX_ZOOM = 4;

export function LogoCropper({
  file,
  onCancel,
  onDone,
}: {
  file: File;
  onCancel: () => void;
  onDone: (dataUri: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [dropBackground, setDropBackground] = useState(false);
  /** True when the border is one flat color, so there is a background to drop. */
  const [hasFlatBackground, setHasFlatBackground] = useState(false);
  /** Whether the drop was applied without being asked for. */
  const [autoDropped, setAutoDropped] = useState(false);
  const strippedRef = useRef<HTMLCanvasElement | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  // Load the file once. An object URL rather than a data URI: the file may be
  // a megabyte, and this never has to travel anywhere.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      strippedRef.current = null;
      const border = borderIsFlat(image);
      setHasFlatBackground(border.flat);
      // Done for you when the file is simply padded with white, which is how
      // most logos are exported. Still a checkbox, still visible in the
      // preview, so it can be put back with one click if it was wrong.
      setDropBackground(border.paddedWithWhite);
      setAutoDropped(border.paddedWithWhite);
      setReady(true);
    };
    image.onerror = () => setError("That image could not be opened.");
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;

    // Built once, the first time it is asked for, and kept.
    if (dropBackground && !strippedRef.current) {
      strippedRef.current = withBackgroundDropped(image);
    }
    const source = dropBackground ? (strippedRef.current ?? image) : image;

    const context = canvas.getContext("2d");
    if (!context) return;

    // Transparent, not white: a mark drawn on nothing must stay on nothing.
    context.clearRect(0, 0, OUT, OUT);

    // Zoom 1 fits the whole image inside the square.
    const fit = OUT / Math.max(image.naturalWidth, image.naturalHeight);
    const scale = fit * zoom;
    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;

    context.imageSmoothingQuality = "high";
    context.drawImage(source, (OUT - w) / 2 + offset.x, (OUT - h) / 2 + offset.y, w, h);
  }, [zoom, offset, dropBackground]);

  useEffect(() => {
    if (ready) draw();
  }, [ready, draw]);

  // Panning is pointless at the fitted size — there is nothing outside the
  // square to bring into it — so it only does something once you zoom in.
  function clampOffset(next: { x: number; y: number }) {
    const image = imageRef.current;
    if (!image) return { x: 0, y: 0 };
    const fit = OUT / Math.max(image.naturalWidth, image.naturalHeight);
    const scale = fit * zoom;
    const room = (side: number) => Math.max(0, (side * scale - OUT) / 2);
    const roomX = room(image.naturalWidth);
    const roomY = room(image.naturalHeight);
    return {
      x: Math.max(-roomX, Math.min(roomX, next.x)),
      y: Math.max(-roomY, Math.min(roomY, next.y)),
    };
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY };
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const start = dragRef.current;
    if (!start) return;
    // The canvas is displayed smaller than it is, so a pixel of finger is more
    // than a pixel of image.
    const ratio = OUT / event.currentTarget.getBoundingClientRect().width;
    const dx = (event.clientX - start.x) * ratio;
    const dy = (event.clientY - start.y) * ratio;
    dragRef.current = { x: event.clientX, y: event.clientY };
    setOffset((current) => clampOffset({ x: current.x + dx, y: current.y + dy }));
  }

  function endDrag(event: React.PointerEvent<HTMLCanvasElement>) {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function changeZoom(next: number) {
    setZoom(next);
    // Zooming back out can leave the image parked off-center with a gap.
    setOffset((current) => {
      const image = imageRef.current;
      if (!image) return current;
      const fit = OUT / Math.max(image.naturalWidth, image.naturalHeight);
      const scale = fit * next;
      const room = (side: number) => Math.max(0, (side * scale - OUT) / 2);
      return {
        x: Math.max(-room(image.naturalWidth), Math.min(room(image.naturalWidth), current.x)),
        y: Math.max(-room(image.naturalHeight), Math.min(room(image.naturalHeight), current.y)),
      };
    });
  }

  function use() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onDone(canvas.toDataURL("image/png"));
  }

  return (
    <div className="scrim scrim--confirm" role="presentation">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onCancel();
          }
        }}
      >
        <h2 className="dialog__title" id="crop-title">
          Position the logo
        </h2>
        <p className="dialog__body">
          Every place this appears is a square. Drag to move it, and zoom in to
          crop. What you see here is exactly what the board will show.
        </p>

        {error ? (
          <p className="field__error" role="alert">
            {error}
          </p>
        ) : (
          <>
            <div className="cropper">
              <canvas
                ref={canvasRef}
                width={OUT}
                height={OUT}
                className="cropper__canvas"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                aria-label="Logo preview — drag to reposition"
              />
            </div>

            <label className="field">
              <span className="field__label">Zoom</span>
              <input
                className="cropper__zoom"
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(event) => changeZoom(Number(event.target.value))}
              />
              <span className="field__hint">
                At the far left the whole file fits inside the square. Anything
                past that crops the edges.
              </span>
            </label>

            {/* Offered, not urged. A logo exported for a white page carries
                the white with it, and on a board with pale surfaces — which is
                most of them — that is invisible and nothing needs doing. It is
                here for the board whose colors would show it up. */}
            {hasFlatBackground && (
              <label className="cropper__option">
                <input
                  type="checkbox"
                  checked={dropBackground}
                  onChange={(event) => setDropBackground(event.target.checked)}
                />
                <span>
                  {autoDropped ? "Background removed" : "Drop the flat background"}
                  <span className="cropper__option-hint">
                    {autoDropped
                      ? "This file came on a white background, so it has been taken off for you — the chequerboard is what transparent looks like. Untick to keep it."
                      : "Clears the flat color from the edges inwards, leaving anything enclosed by the mark alone. Worth it if the board's own colors would show a square behind the mark."}
                  </span>
                </span>
              </label>
            )}
          </>
        )}

        <div className="dialog__actions">
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={use}
            disabled={!ready || Boolean(error)}
          >
            Use this logo
          </button>
        </div>
      </div>
    </div>
  );
}


/** Euclidean distance between two RGB pixels. */
function apart(data: Uint8ClampedArray, a: number, b: number[]): number {
  return Math.sqrt(
    (data[a] - b[0]) ** 2 + (data[a + 1] - b[1]) ** 2 + (data[a + 2] - b[2]) ** 2,
  );
}

function pixels(image: HTMLImageElement): {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  data: ImageData;
} | null {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0);
  try {
    return { canvas, context, data: context.getImageData(0, 0, canvas.width, canvas.height) };
  } catch {
    // A cross-origin image would taint the canvas. Ours never is, but a read
    // that throws must not take the dialog down with it.
    return null;
  }
}

/**
 * Does this image sit on a flat background, and is it the kind worth removing
 * without being asked?
 *
 * Judged from the border rather than the whole picture: a logo may be mostly
 * one color without that color being a background.
 *
 * `paddedWithWhite` is the difference between padding and design. Almost no
 * mark is *drawn* as a white square — a white square on a white page is
 * nothing — so white around the edges is virtually always the page the logo
 * was exported on. A colored square usually is the design (think of any app
 * icon), so that is offered rather than assumed.
 */
function borderIsFlat(image: HTMLImageElement): { flat: boolean; paddedWithWhite: boolean } {
  const nothing = { flat: false, paddedWithWhite: false };
  const read = pixels(image);
  if (!read) return nothing;

  // Straight off the ImageData: its data/width/height are prototype getters, so
  // spreading the object would have handed back undefined for all three.
  const { data, width, height } = read.data;
  const at = (x: number, y: number) => (y * width + x) * 4;
  const first = [data[0], data[1], data[2]];

  // Fully transparent already — nothing to drop.
  if (data[3] === 0) return nothing;

  let sampled = 0;
  let alike = 0;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 64));
  for (let x = 0; x < width; x += step) {
    for (const y of [0, height - 1]) {
      sampled += 1;
      if (apart(data, at(x, y), first) < 40) alike += 1;
    }
  }
  for (let y = 0; y < height; y += step) {
    for (const x of [0, width - 1]) {
      sampled += 1;
      if (apart(data, at(x, y), first) < 40) alike += 1;
    }
  }

  const flat = sampled > 0 && alike / sampled > 0.9;
  const nearlyWhite = first.every((channel) => channel >= 232);
  return { flat, paddedWithWhite: flat && nearlyWhite };
}

/**
 * Clears the background color, flooding inwards from the edges.
 *
 * A flood rather than "delete every white pixel", because a mark often has
 * white *inside* it — the gap in a letter, a highlight — and deleting that
 * would punch holes through the logo. Only color reachable from the border
 * without crossing the mark is background.
 */
function withBackgroundDropped(image: HTMLImageElement): HTMLCanvasElement | null {
  const read = pixels(image);
  if (!read) return null;

  const { canvas, context, data: imageData } = read;
  const { data } = imageData;
  const { width, height } = canvas;
  const target = [data[0], data[1], data[2]];
  const TOLERANCE = 48;

  const seen = new Uint8Array(width * height);
  const queue: number[] = [];

  const consider = (index: number) => {
    if (seen[index]) return;
    seen[index] = 1;
    if (apart(data, index * 4, target) <= TOLERANCE) queue.push(index);
  };

  for (let x = 0; x < width; x += 1) {
    consider(x);
    consider((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    consider(y * width);
    consider(y * width + width - 1);
  }

  while (queue.length) {
    const index = queue.pop()!;
    data[index * 4 + 3] = 0;

    const x = index % width;
    const y = (index - x) / width;
    if (x > 0) consider(index - 1);
    if (x < width - 1) consider(index + 1);
    if (y > 0) consider(index - width);
    if (y < height - 1) consider(index + width);
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}
