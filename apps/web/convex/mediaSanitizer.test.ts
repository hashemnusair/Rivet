import { describe, expect, it } from "vitest";
import { sanitizeImageBytes } from "./mediaSanitizer";

function chunk(type: string, body: number[]) {
  const output = new Uint8Array(12 + body.length);
  new DataView(output.buffer).setUint32(0, body.length);
  output.set([...type].map((value) => value.charCodeAt(0)), 4);
  output.set(body, 8);
  return output;
}

function concat(...parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((sum, value) => sum + value.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

describe("image storage sanitizer", () => {
  it("detects JPEG bytes and strips EXIF/comment segments", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x04, 0x45, 0x58, 0xff, 0xfe, 0x00, 0x04, 0x48, 0x49, 0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9]);
    const result = sanitizeImageBytes(jpeg);
    expect(result.contentType).toBe("image/jpeg");
    expect([...result.bytes]).toEqual([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9]);
  });

  it("strips PNG text metadata while retaining image data", () => {
    const png = concat(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", new Array(13).fill(0)), chunk("tEXt", [1, 2]), chunk("IDAT", [3]), chunk("IEND", []));
    const result = sanitizeImageBytes(png);
    expect(result.contentType).toBe("image/png");
    expect(new TextDecoder().decode(result.bytes)).not.toContain("tEXt");
    expect(new TextDecoder().decode(result.bytes)).toContain("IDAT");
  });

  it("rejects a renamed or malformed upload", () => {
    expect(() => sanitizeImageBytes(new TextEncoder().encode("not an image"))).toThrow("UNSUPPORTED_IMAGE_TYPE");
  });
});
