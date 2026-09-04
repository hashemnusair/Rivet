"use client";

import { Eraser, PenLine, Type } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { MAX_SIGNATURE_PRINT_IMAGE_LENGTH } from "../../../convex/legalAgreementText";
import type { AgreementSignatureMethod } from "@/lib/domain/types";

export interface SignatureValue {
  method: AgreementSignatureMethod;
  imageDataUrl?: string;
  /** An opaque JPEG of the same strokes; the PDF embeds JPEG bytes directly. */
  printImageDataUrl?: string;
  typedName?: string;
}

/**
 * A signature captured on a canvas (finger, pen or mouse) or adopted as a
 * typed name. Nothing is stored in the browser; the parent receives the PNG
 * data URL or the typed name only when the signer submits.
 */
export function SignaturePad({ value, onChange, signatoryName, invalid }: { value: SignatureValue; onChange: (value: SignatureValue) => void; signatoryName: string; invalid?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasStrokes, setHasStrokes] = useState(false);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = canvas.clientWidth || 600;
    const height = 180;
    if (canvas.width === Math.round(width * ratio) && canvas.height === Math.round(height * ratio)) return;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2.2;
    context.strokeStyle = "#1b1a15";
  }, []);

  // The canvas is created afresh each time the method switches back to
  // drawing, so it must be sized again then, not only on first mount:
  // an unsized canvas is a 300 x 150 bitmap stretched to fit, which puts
  // strokes far from the pointer and blurs them.
  useEffect(() => {
    if (value.method !== "drawn") return;
    setHasStrokes(false);
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize, value.method]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (value.method !== "drawn") return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    drawing.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const { x, y } = point(event);
    context.beginPath();
    context.moveTo(x, y);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const { x, y } = point(event);
    context.lineTo(x, y);
    context.stroke();
    if (!hasStrokes) setHasStrokes(true);
  };

  /**
   * The strokes on white, as a JPEG. A PDF can embed JPEG bytes as they are,
   * so this is what ends up in the signed agreement file; the transparent PNG
   * stays the version shown on screen.
   */
  const flatten = (canvas: HTMLCanvasElement): string | undefined => {
    try {
      const flat = document.createElement("canvas");
      flat.width = canvas.width;
      flat.height = canvas.height;
      const context = flat.getContext("2d");
      if (!context) return undefined;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, flat.width, flat.height);
      context.drawImage(canvas, 0, 0);
      for (const quality of [0.9, 0.6]) {
        const encoded = flat.toDataURL("image/jpeg", quality);
        if (encoded.startsWith("data:image/jpeg") && encoded.length <= MAX_SIGNATURE_PRINT_IMAGE_LENGTH) return encoded;
      }
      return undefined;
    } catch {
      return undefined;
    }
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let imageDataUrl: string | undefined;
    try {
      imageDataUrl = canvas.toDataURL("image/png");
    } catch {
      imageDataUrl = undefined;
    }
    const usable = imageDataUrl && imageDataUrl.length > 200 ? imageDataUrl : undefined;
    onChange({ method: "drawn", imageDataUrl: usable, printImageDataUrl: usable ? flatten(canvas) : undefined });
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
    onChange({ method: value.method, imageDataUrl: undefined, printImageDataUrl: undefined, typedName: value.method === "typed" ? "" : undefined });
  };

  return (
    <div className="space-y-3" data-testid="signature-pad">
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Signature method">
        <button type="button" role="radio" aria-checked={value.method === "drawn"} onClick={() => onChange({ method: "drawn", imageDataUrl: undefined, printImageDataUrl: undefined })} className={cn("inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-[13px]", value.method === "drawn" ? "border-ink bg-ink text-paper" : "border-line-2 text-ink-2 hover:border-line-3")}>
          <PenLine className="size-3.5" /> Draw
        </button>
        <button type="button" role="radio" aria-checked={value.method === "typed"} onClick={() => onChange({ method: "typed", typedName: value.typedName ?? "" })} className={cn("inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-[13px]", value.method === "typed" ? "border-ink bg-ink text-paper" : "border-line-2 text-ink-2 hover:border-line-3")}>
          <Type className="size-3.5" /> Type my name
        </button>
      </div>
      {value.method === "drawn" ? (
        <div className={cn("relative rounded-md border bg-surface", invalid ? "border-danger" : "border-line-2")}>
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="Sign here with your finger, a pen or the mouse"
            className="block h-[180px] w-full touch-none rounded-md"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            onPointerCancel={end}
          />
          {!hasStrokes ? <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[12px] text-ink-3">Sign here</span> : null}
          <div className="absolute end-2 top-2">
            <Button type="button" size="xs" variant="secondary" onClick={clear}><Eraser /> Clear</Button>
          </div>
        </div>
      ) : (
        <div>
          <Input
            aria-label="Type your full name as your signature"
            value={value.typedName ?? ""}
            onChange={(event) => onChange({ method: "typed", typedName: event.target.value })}
            placeholder={signatoryName || "Your full name"}
            className={cn("h-14 font-display text-[22px] italic", invalid && "border-danger")}
          />
          <p className="mt-1.5 text-[11.5px] text-ink-3">Typing your full name adopts it as your signature. It must match the signatory name exactly.</p>
        </div>
      )}
    </div>
  );
}
