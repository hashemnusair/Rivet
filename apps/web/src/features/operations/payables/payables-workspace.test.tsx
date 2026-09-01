import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { useApp } from "@/lib/providers/app-providers";
import { getApi } from "@/lib/api/client";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { PayablesWorkspace } from "./payables-workspace";
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

async function seededBranchId() {
  const probe = new MockGymOSApi();
  const session = await probe.getSession();
  return session.branches[0]!.id;
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
    expect(rows[0]).toHaveTextContent("Not posted to ledger yet");
    expect(rows[0]).not.toHaveTextContent(/due/i);
    expect(screen.getByText("Outstanding").parentElement).toHaveTextContent("1,650.000");
    expect(await screen.findByTestId("payables-reconciliation")).toHaveTextContent("Equipment purchase · TREAD-01");
  });

  it("keeps reads capability-gated and hides write actions from finance readers", async () => {
    await renderWithApp(<PayablesWorkspace />, { role: "salesperson" });
    expect(await screen.findByText("Not allowed for this role")).toBeInTheDocument();
    resetApiForTests();
    await renderWithApp(<PayablesWorkspace />, { role: "auditor" });
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
    const allocation = within(dialog).getByRole("textbox", { name: /Allocate to Purchase order/i });
    await waitFor(() => expect(allocation).toHaveValue("650.000"));
    expect(within(dialog).getByRole("status")).toHaveTextContent(/Open cash shift/i);
    await user.click(within(dialog).getByTestId("confirm-supplier-payment"));
    await waitFor(() => expect(recordSpy).toHaveBeenCalledWith(expect.objectContaining({ method: "cash", branchId, amount: { amount: 650_000, currency: "JOD" }, allocations: [{ payableId: expect.stringMatching(/^purchase_order:/), amount: { amount: 650_000, currency: "JOD" } }], expectedShiftId: expect.any(String) })));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith(expect.stringMatching(/^\/operations\/payables\/payments\//)));
    const payables = await api.listPayables();
    expect(payables.items[0]).toMatchObject({ status: "partially_paid", remaining: { amount: 1_000_000, currency: "JOD" } });
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
    expect(await within(dialog).findByText(/Not yet applied/i)).toBeInTheDocument();
    await user.clear(within(dialog).getByRole("textbox", { name: "Amount paid" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Amount paid" }), "1650");
    await waitFor(() => expect(within(dialog).queryByText(/Not yet applied/i)).not.toBeInTheDocument());
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox", { name: "Bank transfer reference" }), "TRF-2026-0091");
    await waitFor(() => expect(confirm).toBeEnabled());
  });

  it("exports the filtered payables as a readable CSV", async () => {
    const user = userEvent.setup();
    await renderWithApp(<PayablesWorkspace />, { role: "owner" });
    await screen.findAllByTestId("payable-row");
    await user.click(screen.getByRole("button", { name: /Export CSV/i }));
    await waitFor(() => expect(downloadMock.downloadTextFile).toHaveBeenCalledTimes(1));
    const content = downloadMock.downloadTextFile.mock.calls[0]![0].content as string;
    expect(content).toContain("Jordan Sports Supply");
    expect(content).toContain("Remaining (JOD)");
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
    expect(confirmation).toHaveTextContent("Not posted to ledger yet");
    expect(confirmation).toHaveTextContent("still owed after this payment");
    expect(confirmation).not.toHaveTextContent(/receipt number/i);
    await user.click(screen.getByTestId("reverse-supplier-payment"));
    await user.type(await screen.findByTestId("reverse-supplier-payment-reason"), "Paid the same invoice twice");
    await user.click(screen.getByTestId("confirm-reverse-supplier-payment"));
    await waitFor(() => expect(screen.getByTestId("supplier-payment-confirmation")).toHaveTextContent("REVERSED"));
    expect(screen.queryByTestId("reverse-supplier-payment")).not.toBeInTheDocument();
    expect((await getApi().listPayables()).items[0]).toMatchObject({ status: "unpaid" });
  });
});
