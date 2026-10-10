import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";

// Keep the approved, unmodified Fontshare asset out of the public repository.
// next/font/local serves it from our own deployment after installation.
const source = "https://cdn.fontshare.com/wf/NWBQYJIM7GCZ5XWD7D26ARB3VDY55ZRT/K63EV2KZIGKLE7RANQ2U42S6SVHU5RJ7/X6XYTKIVDUW7GZTZPZNN4EUM5KH54KHF.woff2";
const sha256 = "e739aff9b4d02c264341d6d4872edcda28e79373aeda936f659566a1cd3eb47f";
const directory = new URL("../src/components/marketing/fonts/", import.meta.url);
const destination = new URL("Satoshi-Variable.woff2", directory);
const temporary = new URL(`Satoshi-Variable.${process.pid}.tmp`, directory);
const matches = (bytes) => createHash("sha256").update(bytes).digest("hex") === sha256;

try {
  const existing = await readFile(destination).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (existing && !matches(existing)) throw new Error("Satoshi checksum mismatch; restore the official asset before building.");
  if (!existing) {
    const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Fontshare returned HTTP ${response.status}.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!matches(bytes)) throw new Error("Downloaded Satoshi font does not match the approved checksum.");
    await mkdir(directory, { recursive: true });
    await writeFile(temporary, bytes);
    await rename(temporary, destination);
  }
  console.log("Satoshi font ready (checksum verified).");
} finally {
  await rm(temporary, { force: true });
}
