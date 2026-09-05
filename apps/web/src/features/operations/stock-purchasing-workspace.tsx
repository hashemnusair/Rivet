"use client";

import { Boxes, ClipboardCheck, ShoppingCart, Store, WalletCards, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { WorkspaceAccess } from "@/lib/domain/types";
import { qk } from "@/lib/api/keys";
import { useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { PayablesWorkspace } from "@/features/operations/payables/payables-workspace";
import { PageHeader } from "@/components/shared/chrome";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ForbiddenState, QueryErrorState, StatePanel } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EquipmentTab } from "./equipment-tab";
import { InventoryTab } from "./inventory-tab";
import { CURRENCY_FALLBACK, LoadingGrid, useOperationsMutations } from "./operations-shared";
import { PurchaseOrdersTab, SuppliersTab } from "./purchasing-tabs";

const TABS = ["inventory", "orders", "suppliers", "payables", "equipment"] as const;
type StockTab = (typeof TABS)[number];

function tabFromParam(value: string | null): StockTab {
  return TABS.includes(value as StockTab) ? (value as StockTab) : "inventory";
}

/**
 * Stock & purchasing: inventory, purchase orders, suppliers, payables and
 * machines for one branch. Selling happens in Checkout and maintenance on
 * its own page; both are one click away from here.
 */
export function StockPurchasingWorkspace() {
  const { session, setBranch } = useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const invalidate = useInvalidate();
  const requestedTab = searchParams.get("tab");
  const highlightOrderId = searchParams.get("order") ?? undefined;
  const [tab, setTab] = useState<StockTab>(() => tabFromParam(requestedTab));
  const branchId = session?.activeBranchId;
  const branchLabel = branchId ? session?.branches.find((branch) => branch.id === branchId)?.name ?? branchId : "All branches";
  const currency = session?.organization.currency ?? CURRENCY_FALLBACK;
  const writeEnabled = can("operations.manage");
  const canCheckout = can("payments.collect");
  const canReadPayables = can("operations.manage") || can("reports.financial.read");
  const workspaceQuery = useApiQuery(qk.workspaceAccess, (api) => api.getWorkspaceAccess());
  const workspace = workspaceQuery.data as WorkspaceAccess | undefined;
  const operationsModule = workspace?.modules.find((entry) => entry.key === "operations");
  const ready = Boolean(operationsModule?.entitled && operationsModule.enabled);
  const productQuery = useApiQuery(qk.operations({ kind: "products" }), (api) => api.listProducts(), { enabled: ready });
  const supplierQuery = useApiQuery(qk.operations({ kind: "suppliers" }), (api) => api.listSuppliers(), { enabled: ready });
  const inventoryQuery = useApiQuery(qk.operations({ kind: "inventory", branchId }), (api) => api.listInventory({ branchId }), { enabled: ready });
  const alertQuery = useApiQuery(qk.operations({ kind: "alerts", branchId }), (api) => api.listLowStockAlerts({ branchId }), { enabled: ready });
  const ordersQuery = useApiQuery(qk.operations({ kind: "purchase-orders", branchId }), (api) => api.listPurchaseOrders({ branchId }), { enabled: ready });
  const zonesQuery = useApiQuery(qk.operations({ kind: "equipment-zones", branchId }), (api) => api.listZones({ branchId, includeArchived: false }), { enabled: ready && Boolean(branchId) });
  const assetsQuery = useApiQuery(qk.operations({ kind: "equipment-assets", branchId }), (api) => api.listEquipmentAssets({ branchId }), { enabled: ready && Boolean(branchId) });
  const issuesQuery = useApiQuery(qk.operations({ kind: "equipment-issues", branchId }), (api) => api.listEquipmentIssues({ branchId }), { enabled: ready && Boolean(branchId) });
  const workOrdersQuery = useApiQuery(qk.operations({ kind: "equipment-work-orders", branchId }), (api) => api.listEquipmentWorkOrders({ branchId }), { enabled: ready && Boolean(branchId) });
  const mutations = useOperationsMutations(invalidate);

  // Old deep links: the checkout tab became its own page, and maintenance
  // moved to /maintenance. Forward them with their parameters intact. The
  // forwarded query is reduced to a string so the effect does not re-run on
  // every render (useSearchParams returns a fresh object each time).
  const maintenanceQuery = useMemo(() => {
    const forwarded = new URLSearchParams();
    for (const key of ["branch", "zone", "action"]) {
      const value = searchParams.get(key);
      if (value) forwarded.set(key, value);
    }
    return forwarded.toString();
  }, [searchParams]);
  useEffect(() => {
    if (requestedTab === "checkout") router.replace(branchId ? `/checkout?branchId=${encodeURIComponent(branchId)}` : "/checkout");
    if (requestedTab === "facilities") router.replace(maintenanceQuery ? `/maintenance?${maintenanceQuery}` : "/maintenance");
  }, [branchId, maintenanceQuery, requestedTab, router]);
  // A tab named in the URL wins when it changes; manual tab clicks are kept
  // across branch changes and re-renders.
  useEffect(() => { setTab(tabFromParam(requestedTab)); }, [requestedTab]);

  useEffect(() => {
    const requestedBranchId = searchParams.get("branch");
    if (!requestedBranchId || session?.activeBranchId === requestedBranchId || !session?.branches.some((branch) => branch.id === requestedBranchId)) return;
    void setBranch(requestedBranchId);
  }, [searchParams, session?.activeBranchId, session?.branches, setBranch]);

  if (!can("members.read")) return <ForbiddenState description="Stock & purchasing is limited to gym team members with operational read access." />;
  if (workspaceQuery.isLoading) return <div className="space-y-4"><PageHeader title="Stock & purchasing" description="Stock, purchase orders, suppliers, payables, and machines for each branch." /><LoadingGrid /></div>;
  if (workspaceQuery.isError || !workspace) return <QueryErrorState error={workspaceQuery.error} onRetry={() => workspaceQuery.refetch()} />;
  if (!operationsModule?.entitled) return <StatePanel icon={Boxes} title="Stock & purchasing is not included" description="The Growth workspace module adds stock, checkout, suppliers, purchase orders, and payables." className="mt-4" />;
  if (!operationsModule.enabled) return <StatePanel icon={Boxes} title="Stock & purchasing is paused" description="An organization owner can enable the operations module from workspace settings." className="mt-4" />;

  const inventoryError = productQuery.error ?? supplierQuery.error ?? inventoryQuery.error ?? alertQuery.error ?? ordersQuery.error;
  const equipmentError = zonesQuery.error ?? assetsQuery.error ?? issuesQuery.error ?? workOrdersQuery.error;
  const retryInventory = () => { void Promise.all([productQuery.refetch(), supplierQuery.refetch(), inventoryQuery.refetch(), alertQuery.refetch(), ordersQuery.refetch()]); };
  const retryEquipment = () => { void Promise.all([zonesQuery.refetch(), assetsQuery.refetch(), issuesQuery.refetch(), workOrdersQuery.refetch()]); };
  const inventoryLoading = [productQuery, supplierQuery, inventoryQuery, alertQuery, ordersQuery].some((query) => query.isLoading);
  const equipmentLoading = Boolean(branchId) && [zonesQuery, assetsQuery, issuesQuery, workOrdersQuery].some((query) => query.isLoading);
  const products = productQuery.data ?? [];
  const suppliers = supplierQuery.data ?? [];
  const inventory = inventoryQuery.data ?? [];
  const alerts = alertQuery.data ?? [];
  const orders = ordersQuery.data ?? [];
  const branches = session?.branches ?? [];
  const sell = canCheckout && branchId ? (productId: string) => router.push(`/checkout?branchId=${encodeURIComponent(branchId)}&productId=${encodeURIComponent(productId)}`) : undefined;
  const branchQuery = branchId ? `?branch=${encodeURIComponent(branchId)}` : "";

  return (
    <div className="space-y-4" data-testid="operations-command-center">
      <PageHeader title="Stock & purchasing" description={branchId ? `Stock, orders, suppliers, payables, and machines at ${branchLabel}.` : "Compare stock across branches. Select a branch to edit stock, order, pay suppliers, or manage machines."} />
      {inventoryError || equipmentError ? <div className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-[12px] text-warning-deep" role="status">Some operational data could not refresh. <button type="button" className="font-medium underline" onClick={() => { retryInventory(); retryEquipment(); }}>Retry</button></div> : null}
      <Tabs value={tab} onValueChange={(value) => {
        setTab(value as StockTab);
        const next = new URLSearchParams(searchParams.toString());
        next.set("tab", value);
        if (branchId) next.set("branch", branchId);
        router.replace(`/operations?${next}`, { scroll: false });
      }}>
        <TabsList aria-label="Stock and purchasing">
          <TabsTrigger value="inventory"><Boxes className="size-3.5" /> Inventory</TabsTrigger>
          <TabsTrigger value="orders"><ShoppingCart className="size-3.5" /> Purchase orders</TabsTrigger>
          <TabsTrigger value="suppliers"><Store className="size-3.5" /> Suppliers</TabsTrigger>
          {canReadPayables ? <TabsTrigger value="payables"><WalletCards className="size-3.5" /> Payables</TabsTrigger> : null}
          <TabsTrigger value="equipment"><Wrench className="size-3.5" /> Equipment</TabsTrigger>
        </TabsList>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:items-center"><div className="col-span-2 min-w-0 sm:w-64"><label htmlFor="operations-branch" className="sr-only">Operations branch</label><Select value={branchId ?? "all"} onValueChange={(value) => { void setBranch(value === "all" ? undefined : value);
            const next = new URLSearchParams(searchParams.toString());
            if (value === "all") next.delete("branch"); else next.set("branch", value);
            router.replace(`/operations?${next}`, { scroll: false }); }}><SelectTrigger id="operations-branch" aria-label="Operations branch" className="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All branches</SelectItem>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></div>{canCheckout ? <Button asChild className="h-11"><Link href={branchId ? `/checkout?branchId=${encodeURIComponent(branchId)}` : "/checkout"}><ShoppingCart /> Checkout</Link></Button> : null}<Button asChild className="h-11" variant="secondary"><Link href={`/maintenance${branchQuery}`}><ClipboardCheck /> Maintenance</Link></Button></div>
        <TabsContent value="inventory"><InventoryTab branchId={branchId} branchLabel={branchLabel} branches={branches} currency={currency} writeEnabled={writeEnabled} products={products} suppliers={suppliers} inventory={inventory} alerts={alerts} loading={inventoryLoading} error={inventoryError} onRetry={retryInventory} mutations={mutations} onSell={sell} /></TabsContent>
        <TabsContent value="orders"><PurchaseOrdersTab branchId={branchId} currency={currency} writeEnabled={writeEnabled} products={products} suppliers={suppliers} orders={orders} loading={inventoryLoading} error={inventoryError} onRetry={retryInventory} mutations={mutations} highlightOrderId={highlightOrderId} /></TabsContent>
        <TabsContent value="suppliers"><SuppliersTab branchId={branchId} branches={branches} writeEnabled={writeEnabled} suppliers={suppliers} loading={supplierQuery.isLoading} error={supplierQuery.error} onRetry={() => void supplierQuery.refetch()} mutations={mutations} /></TabsContent>
        {canReadPayables ? <TabsContent value="payables"><PayablesWorkspace embedded branchId={branchId} /></TabsContent> : null}
        <TabsContent value="equipment"><EquipmentTab branchId={branchId} currency={currency} writeEnabled={writeEnabled} zones={zonesQuery.data ?? []} assets={assetsQuery.data ?? []} issues={issuesQuery.data ?? []} workOrders={workOrdersQuery.data ?? []} loading={equipmentLoading} error={equipmentError} onRetry={retryEquipment} mutations={mutations} /></TabsContent>
      </Tabs>
    </div>
  );
}
