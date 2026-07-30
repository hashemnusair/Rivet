"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import type { MemberSummary } from "@/lib/domain/types";
import { useDebouncedValue } from "@/lib/hooks/use-debounced";
import { MoneyText } from "@/components/shared/data-display";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Monogram, Skeleton } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { CollectPaymentDialog } from "@/features/membership-actions/payment-dialog";

/**
 * Two-step collect flow used from the transactions page: find the member,
 * then the standard collect-payment dialog takes over.
 */
export function CollectPaymentMemberPicker({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 250);
  const [member, setMember] = useState<MemberSummary | null>(null);

  const query = useApiQuery(
    qk.members({ search: debounced, outstandingPicker: true }),
    (api) => api.listMembers({ search: debounced || undefined, status: "active", pageSize: 8, sort: "-outstanding" }),
    { enabled: open },
  );

  return (
    <>
      <Dialog open={open && !member} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Collect payment</DialogTitle>
            <DialogDescription>Find the member first — balances show so you pick the right person.</DialogDescription>
          </DialogHeader>
          <div className="px-5 pb-5">
            <div className="relative">
              <Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
              <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, phone or member number…" className="ps-8" aria-label="Search member" />
            </div>
            <div className="mt-3 max-h-72 overflow-y-auto">
              {query.isLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (query.data?.items.length ?? 0) === 0 ? (
                <EmptyState compact title="No members found" className="border-0" />
              ) : (
                <ul className="divide-y divide-line rounded-md border border-line">
                  {query.data!.items.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => setMember(m)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-start transition-colors hover:bg-sunken/50 cursor-pointer"
                      >
                        <Monogram name={m.fullName} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{m.fullName}</span>
                          <span className="block font-mono text-[11px] text-ink-3">{m.memberNumber}</span>
                        </span>
                        {m.outstanding.amount > 0 ? (
                          <MoneyText money={m.outstanding} className="text-[12px] font-medium text-warning-deep" />
                        ) : (
                          <span className="font-mono text-[11px] text-ink-4">paid up</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {member ? (
        <CollectPaymentDialog
          open
          onOpenChange={(v) => {
            if (!v) {
              setMember(null);
              onOpenChange(false);
            }
          }}
          member={member}
          onCollected={(receipt) => {
            toast.success(`Collected — receipt ${receipt.receipt.receiptNumber}.`);
            setMember(null);
          }}
        />
      ) : null}
    </>
  );
}
