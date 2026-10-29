import { Suspense } from "react";
import { Skeleton } from "@/components/ui/misc";
import { CustomerFinanceClient } from "./customer-finance.client";

export default function CustomerFinancePage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-[1080px] space-y-4 px-4 py-8 sm:px-6 lg:px-8"><Skeleton className="h-9 w-60" /><Skeleton className="h-80 w-full" /></main>}>
      <CustomerFinanceClient />
    </Suspense>
  );
}
