import { Suspense } from "react";
import { Skeleton } from "@/components/ui/misc";
import ExportCenterClient from "./export-center.client";

export default function ExportsPage() {
  return <Suspense fallback={<div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-80 w-full" /></div>}><ExportCenterClient /></Suspense>;
}
