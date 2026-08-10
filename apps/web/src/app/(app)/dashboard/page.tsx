"use client";

import { OwnerDashboard } from "@/features/dashboard/owner-dashboard";
import { ManagerDashboard } from "@/features/dashboard/manager-dashboard";
import { ReceptionDashboard } from "@/features/dashboard/reception-dashboard";
import { SalesDashboard } from "@/features/dashboard/sales-dashboard";
import { useApp } from "@/lib/providers/app-providers";

export default function DashboardPage() {
  const { session } = useApp();
  const role = session?.roles[0];

  if (role === "salesperson") return <SalesDashboard />;
  if (role === "manager") return <ManagerDashboard />;
  if (role === "receptionist" || role === "trainer") return <ReceptionDashboard />;

  return <OwnerDashboard />;
}
