"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadDocumentPdf } from "./document-pdf";
import type { DocumentPdfOptions } from "../../../convex/documentPdf";

/** Saves the document on the page as a PDF built from what is rendered. */
export function DownloadDocumentButton({ target, version, ...options }: DocumentPdfOptions & { target: string; version: string }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      data-pdf-skip
      data-testid="download-document-pdf"
      onClick={() => {
        const root = document.querySelector<HTMLElement>(`[data-document-body="${target}"]`);
        if (root) downloadDocumentPdf({ ...options, version }, root);
      }}
    >
      <Download /> Download PDF
    </Button>
  );
}
