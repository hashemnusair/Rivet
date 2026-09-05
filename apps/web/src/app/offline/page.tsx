import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Served by the member service worker when a navigation fails offline. It is
 * precached, so it stays static and asks for nothing from the network.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-5 py-10 [padding-bottom:max(2.5rem,env(safe-area-inset-bottom))]">
      <section className="w-full max-w-sm text-center">
        <Image src="/brand/rivet-glyph.png" alt="" width={41} height={64} className="mx-auto" priority />
        <p className="mt-6 text-[12px] font-medium text-ink-3">You&apos;re offline</p>
        <h1 className="mt-1 font-display text-[26px] font-semibold leading-tight tracking-tight">Reconnect to open RIVET</h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-ink-2">Membership details, payments and entry passes need a live, secure connection. Your entry QR is never stored for offline use, so reception always scans a fresh pass.</p>
        <Button asChild className="mt-6 w-full sm:w-auto">
          <Link href="/customer/my-gyms">Try again</Link>
        </Button>
      </section>
    </main>
  );
}
