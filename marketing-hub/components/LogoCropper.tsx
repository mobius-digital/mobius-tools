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
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  // Load the file once. An object URL rather than a data URI: the file may be
  // a megabyte, and this never has to travel anywhere.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
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
    context.drawImage(image, (OUT - w) / 2 + offset.x, (OUT - h) / 2 + offset.y, w, h);
  }, [zoom, offset]);

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
    // Zooming back out can leave the image parked off-centre with a gap.
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
