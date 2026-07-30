import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 text-center">
      <Image src="/brand/rivet-glyph.png" alt="" width={34} height={52} />
      <p className="eyebrow mt-6">404</p>
      <h1 className="mt-2 font-display text-[28px] font-semibold tracking-tight">This page is not on the floor plan</h1>
      <p className="mt-2 max-w-sm text-[13.5px] text-ink-2">
        The record may have been removed, the link may be wrong, or the demo data was reset.
      </p>
      <Button asChild className="mt-6">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
