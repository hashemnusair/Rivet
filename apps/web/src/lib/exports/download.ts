"use client";

export function downloadTextFile(input: { content: string; fileName: string; mimeType?: string }): void {
  const blob = new Blob([input.content], { type: input.mimeType ?? "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = input.fileName.trim().replace(/[\\/:*?"<>|]+/g, "-") || "rivet-export.txt";
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Safari may not begin reading the blob until after the click handler exits.
  // Revoking immediately can therefore create an empty or failed download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
