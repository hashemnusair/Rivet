import { CHAT_FILE_TYPES, CHAT_IMAGE_MAX_BYTES, CHAT_PDF_MAX_BYTES, type ChatFileType } from "@/lib/ai/chat/contracts";

/**
 * Gets a file ready to send. Photos and screenshots are resized in the browser
 * to at most 1,600 px on the long edge, which is all the assistant uses: the
 * upload is faster and the message costs fewer tokens. PDFs and GIFs are sent
 * as they are, within their limits.
 */

const LONG_EDGE = 1_600;
const RESIZE_ABOVE_BYTES = 1_200_000;

export type PreparedFile = { blob: Blob; name: string; mediaType: ChatFileType } | { refused: "file_type" | "file_size" };

function typeOf(file: File): string {
  if (file.type) return file.type.toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension === "pdf" ? "application/pdf" : extension === "png" ? "image/png" : extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "webp" ? "image/webp" : extension === "gif" ? "image/gif" : "";
}

async function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function prepareFile(file: File): Promise<PreparedFile> {
  const mediaType = typeOf(file);
  if (!(CHAT_FILE_TYPES as readonly string[]).includes(mediaType)) return { refused: "file_type" };
  if (mediaType === "application/pdf") return file.size > CHAT_PDF_MAX_BYTES ? { refused: "file_size" } : { blob: file, name: file.name, mediaType: "application/pdf" };
  if (mediaType === "image/gif" || typeof createImageBitmap !== "function") return file.size > CHAT_IMAGE_MAX_BYTES ? { refused: "file_size" } : { blob: file, name: file.name, mediaType: mediaType as ChatFileType };
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= RESIZE_ABOVE_BYTES) {
      bitmap.close();
      return { blob: file, name: file.name, mediaType: mediaType as ChatFileType };
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    // WebP keeps screenshot text sharp and transparency intact; JPEG is the fallback.
    let blob = await encode(canvas, "image/webp", 0.9);
    let type: ChatFileType = "image/webp";
    if (!blob || blob.type !== "image/webp") {
      blob = await encode(canvas, "image/jpeg", 0.88);
      type = "image/jpeg";
    }
    if (!blob) throw new Error("no blob");
    const name = file.name.replace(/\.[^.]+$/, "") + (type === "image/webp" ? ".webp" : ".jpg");
    return blob.size > CHAT_IMAGE_MAX_BYTES ? { refused: "file_size" } : { blob, name, mediaType: type };
  } catch {
    return file.size > CHAT_IMAGE_MAX_BYTES ? { refused: "file_size" } : { blob: file, name: file.name, mediaType: mediaType as ChatFileType };
  }
}
