"use client";

import { MAX_SIGNATURE_PRINT_IMAGE_LENGTH } from "../../../convex/legalAgreementText";

/**
 * A transparent signature PNG, flattened onto white and encoded as JPEG.
 *
 * A PDF embeds JPEG bytes as they are, so this is the form the agreement file
 * needs. Signatures captured before the PDF existed have only the PNG, and the
 * server has no image decoder, so the browser that can already display one
 * produces the printable twin.
 */
export async function flattenSignatureToJpeg(pngDataUrl: string): Promise<string | undefined> {
  if (typeof document === "undefined" || !pngDataUrl.startsWith("data:image/png;base64,")) return undefined;
  const image = await new Promise<HTMLImageElement | undefined>((resolve) => {
    const element = new Image();
    // A data URL cannot hang on the network, but never leave the promise open.
    const timer = setTimeout(() => resolve(undefined), 5000);
    element.onload = () => { clearTimeout(timer); resolve(element); };
    element.onerror = () => { clearTimeout(timer); resolve(undefined); };
    element.src = pngDataUrl;
  });
  if (!image?.width || !image.height) return undefined;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    for (const quality of [0.9, 0.6]) {
      const encoded = canvas.toDataURL("image/jpeg", quality);
      if (encoded.startsWith("data:image/jpeg") && encoded.length <= MAX_SIGNATURE_PRINT_IMAGE_LENGTH) return encoded;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
