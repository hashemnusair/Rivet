export type SupportedImageType = "image/jpeg" | "image/png" | "image/webp";

export interface SanitizedImage {
  contentType: SupportedImageType;
  bytes: Uint8Array;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function sanitizeJpeg(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new Error("MALFORMED_IMAGE");
  const parts = [bytes.slice(0, 2)];
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error("MALFORMED_IMAGE");
    let markerOffset = offset + 1;
    while (bytes[markerOffset] === 0xff) markerOffset += 1;
    const marker = bytes[markerOffset];
    if (marker === undefined) throw new Error("MALFORMED_IMAGE");
    if (marker === 0xda) {
      parts.push(bytes.slice(offset));
      return concat(parts);
    }
    if (marker === 0xd9) {
      parts.push(bytes.slice(offset, markerOffset + 1));
      return concat(parts);
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(bytes.slice(offset, markerOffset + 1));
      offset = markerOffset + 1;
      continue;
    }
    if (markerOffset + 2 >= bytes.length) throw new Error("MALFORMED_IMAGE");
    const length = (bytes[markerOffset + 1]! << 8) | bytes[markerOffset + 2]!;
    if (length < 2) throw new Error("MALFORMED_IMAGE");
    const end = markerOffset + 1 + length;
    if (end > bytes.length) throw new Error("MALFORMED_IMAGE");
    // APP1/APP2/APP13 and comments carry EXIF, ICC, IPTC or free-form metadata.
    if (![0xe1, 0xe2, 0xed, 0xfe].includes(marker)) parts.push(bytes.slice(offset, end));
    offset = end;
  }
  throw new Error("MALFORMED_IMAGE");
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function sanitizePng(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 20 || !PNG_SIGNATURE.every((value, index) => bytes[index] === value)) throw new Error("MALFORMED_IMAGE");
  const parts = [bytes.slice(0, 8)];
  let offset = 8;
  let hasHeader = false;
  let hasData = false;
  let hasEnd = false;
  const stripped = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME", "pHYs"]);
  while (offset + 12 <= bytes.length) {
    const length = ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error("MALFORMED_IMAGE");
    const type = ascii(bytes, offset + 4, 4);
    if (type === "IHDR") hasHeader = true;
    if (type === "IDAT") hasData = true;
    if (type === "IEND") hasEnd = true;
    if (!stripped.has(type)) parts.push(bytes.slice(offset, end));
    offset = end;
    if (type === "IEND") break;
  }
  if (!hasHeader || !hasData || !hasEnd || offset !== bytes.length) throw new Error("MALFORMED_IMAGE");
  return concat(parts);
}

function writeUint32Le(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function readUint32Le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0;
}

function sanitizeWebp(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") throw new Error("MALFORMED_IMAGE");
  const declared = readUint32Le(bytes, 4) + 8;
  if (declared !== bytes.length) throw new Error("MALFORMED_IMAGE");
  const parts = [bytes.slice(0, 12)];
  let offset = 12;
  let hasImage = false;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const length = readUint32Le(bytes, offset + 4);
    const end = offset + 8 + length + (length % 2);
    if (end > bytes.length) throw new Error("MALFORMED_IMAGE");
    if (["VP8 ", "VP8L", "ANMF"].includes(type)) hasImage = true;
    if (!["EXIF", "XMP ", "ICCP"].includes(type)) parts.push(bytes.slice(offset, end));
    offset = end;
  }
  if (!hasImage || offset !== bytes.length) throw new Error("MALFORMED_IMAGE");
  const output = concat(parts);
  writeUint32Le(output, 4, output.length - 8);
  return output;
}

export function sanitizeImageBytes(bytes: Uint8Array): SanitizedImage {
  if (bytes.length > 5 * 1024 * 1024) throw new Error("IMAGE_TOO_LARGE");
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { contentType: "image/jpeg", bytes: sanitizeJpeg(bytes) };
  if (PNG_SIGNATURE.every((value, index) => bytes[index] === value)) return { contentType: "image/png", bytes: sanitizePng(bytes) };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return { contentType: "image/webp", bytes: sanitizeWebp(bytes) };
  throw new Error("UNSUPPORTED_IMAGE_TYPE");
}
