import { notFound } from "next/navigation";
import { DesignSystemGallery } from "./design-system-gallery";
import { designPreviewEnabled } from "@/lib/design-preview";

export const dynamic = "force-dynamic";

export default function DesignSystemPage() {
  if (!designPreviewEnabled(process.env)) notFound();
  return <DesignSystemGallery />;
}
