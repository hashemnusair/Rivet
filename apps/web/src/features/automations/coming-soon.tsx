import { Clock3 } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/chrome";
import { Button } from "@/components/ui/button";

export function AutomationComingSoon() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Automations"
        description="Automated follow-ups and messages are being held while the data foundation is finalized."
      />
      <section className="panel flex min-h-80 items-center justify-center p-6 sm:p-10">
        <div className="max-w-md text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full border border-line bg-sunken text-ink-2">
            <Clock3 className="size-6" aria-hidden="true" />
          </div>
          <p className="context-label mt-5">Coming soon</p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight">Automations are paused for now</h2>
          <p className="mt-3 text-[13px] leading-6 text-ink-2">
            Automated actions are paused while the delivery and verification path is finalized. Existing runs and audit history remain available.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button asChild variant="secondary">
              <Link href="/audit?category=automations">View automation history</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/support">Contact support</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
