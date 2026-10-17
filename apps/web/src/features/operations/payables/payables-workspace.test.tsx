import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { useApp } from "@/lib/providers/app-providers";
import { getApi } from "@/lib/api/client";
import type { Supplier } from "@/lib/domain/types";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { PayablesWorkspace } from "./payables-workspace";
import { RecordSupplierPaymentDialog } from "./record-supplier-payment-dialog";
import { SupplierPaymentConfirmation } from "./supplier-payment-confirmation";

const routerMock = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
const downloadMock = vi.hoisted(() => ({ downloadTextFile: vi.fn() }));
let searchParams = new URLSearchParams();
let paramsMock: Record<string, string> = {};

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  usePathname: () => "/operations/payables",
  useSearchParams: () => searchParams,
  useParams: () => paramsMock,
}));
vi.mock("@/lib/exports/download", () => downloadMock);

HTMLElement.prototype.scrollIntoView = vi.fn();
HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);

afterEach(() => {
  routerMock.push.mockReset();
  downloadMock.downloadTextFile.mockReset();
  searchParams = new URLSearchParams();
  paramsMock = {};
  resetApiForTests();
});

function BranchChanger({ branchId }: { branchId: string | undefined }) {
  const { setBranch } = useApp();
  useEffect(() => { void setBranch(branchId); }, [branchId, setBranch]);
  return null;
}


/** Records a CliQ payment on the live harness api, then shows its confirmation. */
function RecordThenShow({ branchId }: { branchId: string }) {
  const [paymentId, setPaymentId] = useState<string>();
  useEffect(() => {
    void (async () => {
      const api = getApi();
      const payable = (await api.listPayables()).items[0]!;
      const payment = await api.recordSupplierPayment({ supplierId: payable.supplierId, branchId, method: "cliq", amount: { amount: 650_000, currency: "JOD" }, reference: "CLIQ-77", allocations: [{ payableId: payable.id, amount: { amount: 650_000, currency: "JOD" } }], idempotencyKey: "ui-cliq" });
      setPaymentId(payment.id);
    })();
  }, [branchId]);
  return paymentId ? <SupplierPaymentConfirmation paymentId={paymentId} /> : null;
}

/** The open dialog with a supplier list the test can replace, as a background refetch would. Lists are read at mount, after `prepare`. */
function DialogWithSupplierList({ lists }: { lists: { first: Supplier[]; refreshed: Supplier[]; preselect?: string } }) {
  const { session } = useApp();
  const [suppliers, setSuppliers] = useState(() => lists.first);
  return (
    <>
      <button type="button" data-testid="refresh-suppliers" onClick={() => setSuppliers(lists.refreshed)} />
      <RecordSupplierPaymentDialog open onOpenChange={() => {}} suppliers={suppliers} branches={session!.branches} currency="JOD" initialSupplierId={lists.preselect} onRecorded={() => {}} />
    </>
  );
}

async function seededBranchId() {
  const probe = new MockGymOSApi();
  const session = await probe.getSession();
  return session.branches[0]!.id;
}

/** A gate a spied api call waits on, so a test can look at the screen mid-load. */
function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => { open = resolve; });
  return { opened, open };
}

describe("payables workspace", () => {
  it("lists the seeded payable oldest-first with honest aging and totals", async () => {
    await renderWithApp(<PayablesWorkspace />, { role: "owner" });
    const rows = await screen.findAllByTestId("payable-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Jordan Sports Supply");
    expect(rows[0]).toHaveTextContent("JSS-INV-2026-0147");
    expect(rows[0]).toHaveTextContent(/\d+ days/);
    expect(rows[0]).toHaveTextContent("Unpaid");
    expect(rows[0]).toHaveTextContent("Not in the accounts yet");
    expect(rows[0]).not.toHaveTextContent(/due/i);
    expect(screen.getByText("You owe").parentElement).toHaveTextContent("1,650.000");
    expect(await screen.findByTestId("payables-reconciliation")).toHaveTextContent("Equipment purchase · TREAD-01");
  });

  it("keeps reads capability-gated and hides write actions from finance readers", async () => {
    await renderWithApp(<PayablesWorkspace />, { role: "salesperson" });
    expect(await screen.findByText("You don't have access")).toBeInTheDocument();
    resetApiForTests();
    await renderWithApp(<PayablesWorkspace />, { role: "manager", prepare: async (api) => {
      const managerPermissions = (await api.switchDemoRole("manager")).permissions.filter((permission) => permission !== "operations.manage");
      await api.switchDemoRole("owner");
      await api.updateRolePermissions("manager", { permissions: managerPermissions });
    } });
    expect(await screen.findAllByTestId("payable-row")).toHaveLength(1);
    expect(screen.queryByTestId("open-record-supplier-payment")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Pay /i })).not.toBeInTheDocument();
  });

  it("records a partial cash payment from the open drawer with an oldest-first suggestion and opens the confirmation", async () => {
    const user = userEvent.setup();
    const branchId = await seededBranchId();
    const { api } = await renderWithApp(<><BranchChanger branchId={branchId} /><PayablesWorkspace /></>, { role: "owner" });
    const recordSpy = vi.spyOn(api, "recordSupplierPayment");
    await user.click(await screen.findByRole("button", { name: /^Pay Jordan Sports Supply/i }));
    const dialog = await screen.findByRole("dialog", { name: "Record supplier payment" });
    const amount = within(dialog).getByRole("textbox", { name: "Amount paid" });
    expect(amount).toHaveValue("1650.000");
    await user.clear(amount);
    await user.type(amount, "650");
    const allocation = within(dialog).getByRole("textbox", { name: /Amount for Purchase order/i });
    await waitFor(() => expect(allocation).toHaveValue("650.000"));
    expect(within(dialog).getByRole("status")).toHaveTextContent(/Open cash shift/i);
    await user.click(within(dialog).getByTestId("confirm-supplier-payment"));
    await waitFor(() => expect(recordSpy).toHaveBeenCalledWith(expect.objectContaining({ method: "cash", branchId, amount: { amount: 650_000, currency: "JOD" }, allocations: [{ payableId: expect.stringMatching(/^purchase_order:/), amount: { amount: 650_000, currency: "JOD" } }], expectedShiftId: expect.any(String) })));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith(expect.stringMatching(/^\/operations\/payables\/payments\//)));
    const payables = await api.listPayables();
    expect(payables.items[0]).toMatchObject({ status: "partially_paid", remaining: { amount: 1_000_000, currency: "JOD" } });
  });

  it("treats the balance filled in from a bill's Pay button as a starting point, not a change", async () => {
    const user = userEvent.setup();
    await renderWithApp(<PayablesWorkspace />, { role: "owner" });
    await user.click(await screen.findByRole("button", { name: /^Pay Jordan Sports Supply/i }));
    const dialog = await screen.findByRole("dialog", { name: "Record supplier payment" });
    const billsSection = within(dialog).getByRole("region", { name: "Bills this pays" });
    const allocation = await within(billsSection).findByRole("textbox", { name: /Amount for Purchase order/i });
    await waitFor(() => expect(billsSection).toHaveTextContent(/You owe.+Jordan Sports Supply.+1,650\.000/));
    expect(within(dialog).getByRole("textbox", { name: "Amount paid" })).toHaveValue("1650.000");
    expect(allocation).toHaveValue("1650.000");
    expect(billsSection).not.toHaveTextContent("You changed the amounts.");
    await user.clear(allocation);
    await user.type(allocation, "600");
    expect(billsSection).toHaveTextContent("You changed the amounts.");
    await user.click(within(billsSection).getByRole("button", { name: "Reset to oldest first" }));
    await waitFor(() => expect(allocation).toHaveValue("1650.000"));
    expect(billsSection).toHaveTextContent("Oldest bills first.");
    expect(billsSection).not.toHaveTextContent("You changed the amounts.");
  });

  it("requires a reference for a transfer and blocks the button until the allocation matches the amount", async () => {
    const user = userEvent.setup();
    const branchId = await seededBranchId();
    await renderWithApp(<><BranchChanger branchId={branchId} /><PayablesWorkspace /></>, { role: "owner" });
    await user.click(await screen.findByTestId("open-record-supplier-payment"));
    const dialog = await screen.findByRole("dialog", { name: "Record supplier payment" });
    fireEvent.keyDown(within(dialog).getByRole("combobox", { name: "Supplier" }), { key: "ArrowDown" });
    await user.click(await screen.findByRole("option", { name: "Jordan Sports Supply" }));
    await user.click(within(dialog).getByLabelText("Bank transfer"));
    await user.type(within(dialog).getByRole("textbox", { name: "Amount paid" }), "2000");
    const confirm = within(dialog).getByTestId("confirm-supplier-payment");
    expect(confirm).toBeDisabled();
    expect(await within(dialog).findByText(/Not on a bill yet/i)).toBeInTheDocument();
    await user.clear(within(dialog).getByRole("textbox", { name: "Amount paid" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Amount paid" }), "1650");
    await waitFor(() => expect(within(dialog).queryByText(/Not on a bill yet/i)).not.toBeInTheDocument());
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox", { name: "Bank transfer reference" }), "TRF-2026-0091");
    await waitFor(() => expect(confirm).toBeEnabled());
  });

  it("shows what the gym owes a supplier only once that supplier's bills have loaded", async () => {
    const user = userEvent.setup();
    const bills = gate();
    await renderWithApp(<PayablesWorkspace />, { role: "owner", prepare: async (api) => {
      const listPayables = api.listPayables.bind(api);
      vi.spyOn(api, "listPayables").mockImplementation(async (query) => {
        if (query?.supplierId && query.status === "open") await bills.opened;
        return listPayables(query);
      });
    } });
    await user.click(await screen.findByTestId("open-record-supplier-payment"));
    const dialog = await screen.findByRole("dialog", { name: "Record supplier payment" });
    await waitFor(() => expect(within(dialog).getByRole("combobox", { name: "Supplier" })).toHaveTextContent("Jordan Sports Supply"));
    const billsSection = within(dialog).getByRole("region", { name: "Bills this pays" });
    expect(billsSection).toHaveTextContent("Oldest bills first.");
    expect(billsSection).not.toHaveTextContent(/You owe/);
    bills.open();
    await waitFor(() => expect(billsSection).toHaveTextContent(/You owe.+Jordan Sports Supply.+1,650\.000/));
    expect(billsSection).toHaveTextContent(/On bills: /);
  });

  it("says the suppliers are loading, not that there are none, when the dialog opens before the list arrives", async () => {
    const user = userEvent.setup();
    const suppliers = gate();
    await renderWithApp(<PayablesWorkspace />, { role: "owner", prepare: async (api) => {
      const listSuppliers = api.listSuppliers.bind(api);
      vi.spyOn(api, "listSuppliers").mockImplementation(async (query) => {
        await suppliers.opened;
        return listSuppliers(query);
      });
    } });
    await user.click(await screen.findByTestId("open-record-supplier-payment"));
    const dialog = await screen.findByRole("dialog", { name: "Record supplier payment" });
    const supplierField = within(dialog).getByRole("combobox", { name: "Supplier" });
    expect(supplierField).toHaveTextContent("Loading…");
    expect(supplierField).not.toHaveTextContent("No active suppliers");
    expect(supplierField).toBeDisabled();
    const billsSection = within(dialog).getByRole("region", { name: "Bills this pays" });
    expect(billsSection).not.toHaveTextContent("Choose a supplier to see what you owe.");
    expect(billsSection).not.toHaveTextContent(/You owe/);
    suppliers.open();
    await waitFor(() => expect(supplierField).toHaveTextContent("Jordan Sports Supply"));
    expect(supplierField).toBeEnabled();
    await waitFor(() => expect(billsSection).toHaveTextContent(/You owe.+Jordan Sports Supply.+1,650\.000/));
  });

  it("keeps what staff typed when the supplier list arrives after the dialog opens", async () => {
    const user = userEvent.setup();
    const suppliers = gate();
    const branchId = await seededBranchId();
    const { api } = await renderWithApp(<><BranchChanger branchId={branchId} /><PayablesWorkspace /></>, { role: "owner", prepare: async (api) => {
      const listSuppliers = api.listSuppliers.bind(api);
      vi.spyOn(api, "listSuppliers").mockImplementation(async (query) => {
        await suppliers.opened;
        return listSuppliers(query);
      });
    } });
    const recordSpy = vi.spyOn(api, "recordSupplierPayment");
    await user.click(await screen.findByTestId("open-record-supplier-payment"));
    const dialog = await screen.findByRole("dialog", { name: "Record supplier payment" });
    const supplierField = within(dialog).getByRole("combobox", { name: "Supplier" });
    expect(supplierField).toHaveTextContent("Loading…");
    await user.click(within(dialog).getByLabelText("Bank transfer"));
    await user.type(within(dialog).getByRole("textbox", { name: "Amount paid" }), "650");
    await user.type(within(dialog).getByRole("textbox", { name: "Bank transfer reference" }), "TRF-2026-0091");
    suppliers.open();
    await waitFor(() => expect(supplierField).toHaveTextContent("Jordan Sports Supply"));
    expect(within(dialog).getByLabelText("Bank transfer")).toBeChecked();
    expect(within(dialog).getByRole("textbox", { name: "Amount paid" })).toHaveValue("650");
    expect(within(dialog).getByRole("textbox", { name: "Bank transfer reference" })).toHaveValue("TRF-2026-0091");
    const allocation = await within(dialog).findByRole("textbox", { name: /Amount for Purchase order/i });
    await waitFor(() => expect(allocation).toHaveValue("650.000"));
    await user.click(within(dialog).getByTestId("confirm-supplier-payment"));
    await waitFor(() => expect(recordSpy).toHaveBeenCalledWith(expect.objectContaining({ method: "bank_transfer", branchId, amount: { amount: 650_000, currency: "JOD" }, reference: "TRF-2026-0091" })));
  });

  it("keeps the supplier staff picked, and what they typed, when a refresh changes the supplier list", async () => {
    const user = userEvent.setup();
    const branchId = await seededBranchId();
    const lists: { first: Supplier[]; refreshed: Supplier[]; preselect?: string } = { first: [], refreshed: [] };
    await renderWithApp(<DialogWithSupplierList lists={lists} />, { role: "owner", prepare: async (api) => {
      lists.preselect = (await api.upsertSupplier({ name: "Amman Fitness Parts", branchIds: [branchId] })).id;
      lists.first = await api.listSuppliers();
      await api.upsertSupplier({ name: "Zarqa Gym Repairs", branchIds: [branchId] });
      lists.refreshed = await api.listSuppliers();
    } });
    const dialog = await screen.findByRole("dialog", { name: "Record supplier payment" });
    const supplierField = within(dialog).getByRole("combobox", { name: "Supplier" });
    expect(supplierField).toHaveTextContent("Amman Fitness Parts");
    fireEvent.keyDown(supplierField, { key: "ArrowDown" });
    await user.click(await screen.findByRole("option", { name: "Jordan Sports Supply" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Amount paid" }), "650");
    fireEvent.click(screen.getByTestId("refresh-suppliers"));
    fireEvent.keyDown(supplierField, { key: "ArrowDown" });
    expect(await screen.findByRole("option", { name: "Zarqa Gym Repairs" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(supplierField).toHaveTextContent("Jordan Sports Supply");
    expect(within(dialog).getByRole("textbox", { name: "Amount paid" })).toHaveValue("650");
  });

  it("says the supplier list could not load, not that there are none, and loads it again on Retry", async () => {
    const user = userEvent.setup();
    let failing = true;
    await renderWithApp(<PayablesWorkspace />, { role: "owner", prepare: async (api) => {
      const listSuppliers = api.listSuppliers.bind(api);
      vi.spyOn(api, "listSuppliers").mockImplementation(async (query) => {
        if (failing) throw new Error("offline");
        return listSuppliers(query);
      });
    } });
    await user.click(await screen.findByTestId("open-record-supplier-payment"));
    const dialog = await screen.findByRole("dialog", { name: "Record supplier payment" });
    const billsSection = within(dialog).getByRole("region", { name: "Bills this pays" });
    // The page retries once before it gives up, so the error line takes a moment.
    const failure = await within(billsSection).findByText("The supplier list could not load.", {}, { timeout: 3_000 });
    expect(failure).toHaveAttribute("role", "alert");
    const supplierField = within(dialog).getByRole("combobox", { name: "Supplier" });
    expect(supplierField).toBeDisabled();
    expect(supplierField).not.toHaveTextContent("No active suppliers");
    expect(supplierField).not.toHaveTextContent("Loading…");
    expect(billsSection).not.toHaveTextContent("Choose a supplier to see what you owe.");
    expect(billsSection).not.toHaveTextContent(/You owe/);
    failing = false;
    await user.click(within(failure).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(supplierField).toHaveTextContent("Jordan Sports Supply"));
    expect(supplierField).toBeEnabled();
    expect(within(dialog).queryByText("The supplier list could not load.")).not.toBeInTheDocument();
    await waitFor(() => expect(billsSection).toHaveTextContent(/You owe.+Jordan Sports Supply.+1,650\.000/));
  });

  it("exports the filtered payables as a readable CSV", async () => {
    const user = userEvent.setup();
    await renderWithApp(<PayablesWorkspace />, { role: "owner" });
    await screen.findAllByTestId("payable-row");
    await user.click(screen.getByRole("button", { name: /Download CSV/i }));
    await waitFor(() => expect(downloadMock.downloadTextFile).toHaveBeenCalledTimes(1));
    const content = downloadMock.downloadTextFile.mock.calls[0]![0].content as string;
    expect(content).toContain("Jordan Sports Supply");
    expect(content).toContain("Still owed (JOD)");
    expect(content).toContain("1650.000");
    expect(content).not.toContain("purchase_order:");
  });

  it("shows the remittance record and reverses it once with a reason", async () => {
    const user = userEvent.setup();
    const branchId = await seededBranchId();
    await renderWithApp(<><BranchChanger branchId={branchId} /><RecordThenShow branchId={branchId} /></>, { role: "owner" });
    const confirmation = await screen.findByTestId("supplier-payment-confirmation");
    expect(confirmation).toHaveTextContent("Supplier payment confirmation");
    expect(confirmation).toHaveTextContent("Jordan Sports Supply");
    expect(confirmation).toHaveTextContent("CLIQ-77");
    expect(confirmation).toHaveTextContent("Not in the accounts yet");
    expect(confirmation).toHaveTextContent("Still owed to Jordan Sports Supply after this payment");
    expect(confirmation).not.toHaveTextContent(/receipt number/i);
    await user.click(screen.getByTestId("reverse-supplier-payment"));
    await user.type(await screen.findByTestId("reverse-supplier-payment-reason"), "Paid the same invoice twice");
    await user.click(screen.getByTestId("confirm-reverse-supplier-payment"));
    await waitFor(() => expect(screen.getByTestId("supplier-payment-confirmation")).toHaveTextContent("Reversed on"));
    expect(screen.queryByTestId("reverse-supplier-payment")).not.toBeInTheDocument();
    expect((await getApi().listPayables()).items[0]).toMatchObject({ status: "unpaid" });
  });
});
