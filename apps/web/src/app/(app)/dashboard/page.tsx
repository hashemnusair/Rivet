"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { OwnerDashboard } from "@/features/dashboard/owner-dashboard";
import { SalesDashboard } from "@/features/dashboard/sales-dashboard";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/chrome";
import { useApp } from "@/lib/providers/app-providers";

export default function DashboardPage() {
  const { session } = useApp();
  const role = session?.roles[0];

  if (role === "salesperson") return <SalesDashboard />;

  if (role === "receptionist" || role === "trainer") {
    return (
      <div className="mx-auto max-w-xl pt-16 text-center">
        <PageHeader title="Your desk is the reception console" description="Lookup, check-in, collect, renew — everything front-desk happens there, keyboard-first." className="justify-center text-center" />
        <Button asChild size="lg" className="mt-6">
          <Link href="/reception">
            Open reception console <ArrowRight />
          </Link>
        </Button>
      </div>
    );
  }

  return <OwnerDashboard />;
}
