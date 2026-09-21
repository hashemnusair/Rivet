import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { BRANCH_ABD } from "@/lib/mock/seed";
import type { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import MemberImportPage from "./page";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/members/import",
  useSearchParams: () => new URLSearchParams(),
}));

// jsdom has no pointer capture or scrolling; Radix Select needs both to open.
beforeAll(() => {
  const proto = Element.prototype as Element & { hasPointerCapture?: () => boolean; setPointerCapture?: () => void; releasePointerCapture?: () => void; scrollIntoView?: () => void };
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
});

afterEach(() => {
  resetApiForTests();
  vi.clearAllMocks();
});

const CSV = "Name,Tel,Sex,Pkg\nRana Odeh,0798765432,female,10 visits\nMira Nasser,0798123456,female,Monthly 40 USD\nOmar Haddad,0797000000,male,شهري";

async function uploadLegacyFile(csv = CSV) {
  const user = userEvent.setup();
  const file = new File([csv], "legacy-members.csv", { type: "text/csv" });
  Object.defineProperty(file, "text", { value: vi.fn().mockResolvedValue(csv) });
  await user.upload(screen.getByLabelText("Choose member file"), file);
  await screen.findByText("legacy-members.csv");
  return user;
}

const enableAssist = async (api: MockGymOSApi) => { await api.updateAssistPreference({ enabled: true }); };

/** Holds every judgment until the test releases it, so a "late" answer is deterministic. */
function gateJudgments(api: MockGymOSApi) {
  const original = api.requestAssistJudgment.bind(api);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const spy = vi.spyOn(api, "requestAssistJudgment").mockImplementation(async (input) => { await gate; return original(input); });
  return { release, spy };
}

async function chooseOption(user: ReturnType<typeof userEvent.setup>, comboboxName: string, optionName: string | RegExp) {
  await user.click(screen.getByRole("combobox", { name: comboboxName }));
  await user.click(await screen.findByRole("option", { name: optionName }));
}

describe("import assistance on the mapping step", () => {
  it("shows nothing extra while the gym has suggestions switched off", async () => {
    await renderWithApp(<MemberImportPage />, { branchId: BRANCH_ABD });
    await uploadLegacyFile();
    expect(screen.getByRole("combobox", { name: "Full name source column" })).toHaveTextContent("Name");
    expect(screen.queryByTestId("import-unmatched-columns")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Suggest mapping/ })).not.toBeInTheDocument();
  });

  it("suggests a field for an unfamiliar heading and fills the select only when the person accepts", async () => {
    const { api } = await renderWithApp(<MemberImportPage />, { branchId: BRANCH_ABD, prepare: enableAssist });
    const judge = vi.spyOn(api, "requestAssistJudgment");
    const user = await uploadLegacyFile();
    const panel = await screen.findByTestId("import-unmatched-columns");
    expect(within(panel).getByText("Tel")).toBeInTheDocument();
    expect(within(panel).getByText("Pkg")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Phone source column" })).toHaveTextContent("Choose a column");

    await user.click(within(panel).getByRole("button", { name: "Suggest mapping for Tel" }));
    const card = await screen.findByTestId("import-column-card-1");
    expect(card).toHaveTextContent("Fill Phone from this column.");
    expect(card).toHaveTextContent("Preview answer");
    expect(screen.getByRole("combobox", { name: "Phone source column" })).toHaveTextContent("Choose a column");
    expect(judge).toHaveBeenCalledWith(expect.objectContaining({ questionKey: "import.column_target", subject: expect.objectContaining({ column: 1, assigned: "fullName,gender" }) }));

    await user.click(within(card).getByRole("button", { name: "Use as Phone" }));
    expect(screen.getByRole("combobox", { name: "Phone source column" })).toHaveTextContent("Tel");
    expect(within(screen.getByTestId("import-unmatched-columns")).queryByText("Tel")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Check members" })).toBeEnabled());
  });

  it("drops a pending suggestion when the person changes the matches meanwhile, and answers afresh once asked again", async () => {
    const { api } = await renderWithApp(<MemberImportPage />, { branchId: BRANCH_ABD, prepare: enableAssist });
    const user = await uploadLegacyFile();
    const panel = await screen.findByTestId("import-unmatched-columns");
    const { release, spy } = gateJudgments(api);
    // The suggestion for Tel is still on its way when the person matches Phone by hand to a different column.
    await user.click(within(panel).getByRole("button", { name: "Suggest mapping for Tel" }));
    await chooseOption(user, "Phone source column", "Sex");
    release();
    await new Promise((resolve) => setTimeout(resolve, 150));
    // The answer was for a different set of matches, so it is discarded; the hand-made match stands.
    expect(screen.queryByTestId("import-column-card-1")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Phone source column" })).toHaveTextContent("Sex");
    expect(within(screen.getByTestId("import-unmatched-columns")).getByRole("button", { name: "Suggest mapping for Tel" })).toHaveTextContent("Suggest mapping");

    // Asked again while Phone is taken, the model is never offered Phone at all.
    await user.click(within(screen.getByTestId("import-unmatched-columns")).getByRole("button", { name: "Suggest mapping for Tel" }));
    const held = await screen.findByTestId("import-column-card-1");
    expect(held).not.toHaveTextContent("Fill Phone");
    expect(within(held).queryByRole("button", { name: "Use as Phone" })).not.toBeInTheDocument();
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ subject: expect.objectContaining({ assigned: expect.stringMatching(/(^|,)phone(,|$)/) }) }));

    // Clearing the hand-made match makes Phone available again.
    await chooseOption(user, "Phone source column", "Choose a column");
    await user.click(within(screen.getByTestId("import-unmatched-columns")).getByRole("button", { name: "Suggest mapping for Tel" }));
    const card = await screen.findByTestId("import-column-card-1");
    expect(card).toHaveTextContent("Fill Phone from this column.");
    await user.click(within(card).getByRole("button", { name: "Use as Phone" }));
    expect(screen.getByRole("combobox", { name: "Phone source column" })).toHaveTextContent("Tel");
  });

  it("discards a late answer once the person has matched the column by hand", async () => {
    const { api } = await renderWithApp(<MemberImportPage />, { branchId: BRANCH_ABD, prepare: enableAssist });
    const user = await uploadLegacyFile();
    const panel = await screen.findByTestId("import-unmatched-columns");
    const { release, spy } = gateJudgments(api);
    await user.click(within(panel).getByRole("button", { name: "Suggest mapping for Tel" }));
    await chooseOption(user, "Phone source column", "Tel");
    expect(spy).toHaveBeenCalledTimes(1);
    release();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(screen.queryByTestId("import-column-card-1")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Phone source column" })).toHaveTextContent("Tel");
  });

  it("proposes a current plan beside its exact terms, and holds back incompatible or ambiguous labels", async () => {
    await renderWithApp(<MemberImportPage />, { branchId: BRANCH_ABD, prepare: enableAssist });
    const user = await uploadLegacyFile();
    await screen.findByTestId("import-unmatched-columns");
    await chooseOption(user, "Current plan source column", "Pkg");
    await chooseOption(user, "Phone source column", "Tel");
    expect(await screen.findByRole("heading", { name: "Match your plan names" })).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Suggest plan for 10 visits" }));
    const visits = await screen.findByTestId("import-plan-card-10 visits");
    expect(visits).toHaveTextContent("Proposed plan 10-Visit Pass · 10 visits valid 90 days · JOD 50.000 · all branches");
    expect(within(visits).getByRole("list", { name: "Term comparison" })).toHaveTextContent("Visits matches");
    expect(within(visits).getByRole("list", { name: "Term comparison" })).toHaveTextContent("Price not stated");
    await user.click(within(visits).getByRole("button", { name: "Use this plan" }));
    expect(screen.getByRole("combobox", { name: "RIVET plan for 10 visits" })).toHaveTextContent("10-Visit Pass");

    await user.click(screen.getByRole("button", { name: "Suggest plan for Monthly 40 USD" }));
    const usd = await screen.findByTestId("import-plan-card-Monthly 40 USD");
    expect(usd).toHaveTextContent("Not a match: Currency: label is in USD, plan is priced in JOD.");
    expect(within(usd).queryByRole("button", { name: /Use/ })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "RIVET plan for Monthly 40 USD" })).toHaveTextContent("Choose RIVET plan");

    await user.click(screen.getByRole("button", { name: "Suggest plan for شهري" }));
    const arabic = await screen.findByTestId("import-plan-card-شهري");
    expect(arabic).toHaveTextContent("More than one current plan fits");
    expect(within(arabic).queryByRole("button", { name: /Use/ })).not.toBeInTheDocument();
  });

  it("carries accepted suggestions into the normal preview and keeps server validation in charge", async () => {
    const { api } = await renderWithApp(<MemberImportPage />, { branchId: BRANCH_ABD, prepare: enableAssist });
    const previewImport = vi.spyOn(api, "previewMemberImport");
    const user = await uploadLegacyFile("Name,Tel,Sex,Pkg\nRana Odeh,0798765432,female,10 visits");
    const panel = await screen.findByTestId("import-unmatched-columns");
    await user.click(within(panel).getByRole("button", { name: "Suggest mapping for Tel" }));
    await user.click(within(await screen.findByTestId("import-column-card-1")).getByRole("button", { name: "Use as Phone" }));
    await user.click(within(screen.getByTestId("import-unmatched-columns")).getByRole("button", { name: "Suggest mapping for Pkg" }));
    await user.click(within(await screen.findByTestId("import-column-card-3")).getByRole("button", { name: "Use as Current plan" }));
    await user.click(await screen.findByRole("button", { name: "Suggest plan for 10 visits" }));
    await user.click(within(await screen.findByTestId("import-plan-card-10 visits")).getByRole("button", { name: "Use this plan" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Check members" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Check members" }));
    await waitFor(() => expect(previewImport).toHaveBeenCalledWith(expect.objectContaining({
      columnMapping: expect.objectContaining({ fullName: 0, phone: 1, gender: 2, sourcePlanName: 3 }),
      assist: expect.objectContaining({ draftId: expect.any(String), columns: ["phone", "sourcePlanName"], plans: ["10 visits"] }),
    })));
    expect(await screen.findByRole("heading", { name: "Review before import" })).toBeInTheDocument();
    // The membership row still needs its dates: the suggestion changed the mapping, not the rules.
    expect(screen.getAllByText(/Enter a valid membership start date/).length).toBeGreaterThan(0);
  });
});
