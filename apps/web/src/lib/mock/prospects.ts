import { ApiError, ERR } from "@/lib/api/errors";
import {
  AMMAN_PILOT_PROSPECTS,
  emptyProspectFields,
  nextProspectCode,
  normalizeProspectChanges,
  prospectChangeList,
  sameGymName,
  type CreatePlatformProspectInput,
  type ImportPilotProspectsResult,
  type PlatformProspect,
  type PlatformProspectHistoryEntry,
  type PlatformProspectOwner,
  type PlatformProspectsView,
  type ProspectField,
  type ProspectFieldError,
  type ProspectFields,
  type UpdatePlatformProspectInput,
} from "@/lib/platform/prospects";

/** Preview stand-ins for the platform team, the people a prospect can be assigned to. */
export const MOCK_PROSPECT_OWNERS: readonly PlatformProspectOwner[] = [
  { id: "platform-admin-elias", name: "Elias Hreish" },
  { id: "platform-admin-hashem", name: "Hashem Nusair" },
];

type StoredProspect = ProspectFields & {
  id: string;
  code: string;
  source: "import" | "manual";
  createdByName: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
};

const SEEDED_AT = "2026-10-15T09:00:00.000Z";

function rejectFieldErrors(fieldErrors: Partial<Record<ProspectField, ProspectFieldError>>): void {
  const entries = Object.entries(fieldErrors);
  if (!entries.length) return;
  throw ApiError.of(ERR.VALIDATION, "Check the highlighted fields and try again.", {
    fieldErrors: Object.fromEntries(entries.map(([field, code]) => [field, [code as string]])),
    message: { key: "apiErrors.validation" },
  });
}

/**
 * The preview's prospect list. Starts with the Amman pilot sheet already
 * loaded so the page shows the real list; follows the same rules as the
 * Convex module (shared through `@/lib/platform/prospects`).
 */
export class MockProspectStore {
  private rows: StoredProspect[] = [];
  private history = new Map<string, PlatformProspectHistoryEntry[]>();

  constructor(seeded = true) {
    this.reset(seeded);
  }

  reset(seeded = true): void {
    this.history.clear();
    this.rows = seeded ? AMMAN_PILOT_PROSPECTS.map((seed) => this.seedRow(seed, "Hashem Nusair", SEEDED_AT)) : [];
  }

  list(): PlatformProspectsView {
    return {
      prospects: [...this.rows].sort((left, right) => left.code.localeCompare(right.code, "en", { numeric: true })).map((row) => this.view(row)),
      owners: MOCK_PROSPECT_OWNERS.map((owner) => ({ ...owner })),
    };
  }

  historyOf(prospectId: string): PlatformProspectHistoryEntry[] {
    const row = this.find(prospectId);
    const added: PlatformProspectHistoryEntry = { id: `${row.id}-added`, action: row.source === "import" ? "imported" : "created", actorName: row.createdByName, occurredAt: row.createdAt, changes: [] };
    return [...(this.history.get(row.id) ?? []).map((entry) => ({ ...entry, changes: entry.changes.map((change) => ({ ...change })) })), added];
  }

  importAmman(actorName: string, now: string): ImportPilotProspectsResult {
    const existing = new Set(this.rows.map((row) => row.code));
    const missing = AMMAN_PILOT_PROSPECTS.filter((seed) => !existing.has(seed.code));
    this.rows.push(...missing.map((seed) => this.seedRow(seed, actorName, now)));
    return { added: missing.length, skipped: AMMAN_PILOT_PROSPECTS.length - missing.length };
  }

  create(input: CreatePlatformProspectInput, actorName: string, now: string): PlatformProspect {
    const { values, fieldErrors } = normalizeProspectChanges(input?.fields);
    if (!values.gymName && !fieldErrors.gymName) fieldErrors.gymName = "required";
    rejectFieldErrors(fieldErrors);
    if (this.rows.some((row) => sameGymName(row.gymName, values.gymName!))) rejectFieldErrors({ gymName: "duplicate" });
    if (values.ownerId) this.owner(values.ownerId);
    const row: StoredProspect = {
      ...emptyProspectFields(),
      ...values,
      gymName: values.gymName!,
      id: `prospect-${Math.random().toString(36).slice(2, 10)}`,
      code: nextProspectCode(this.rows.map((candidate) => candidate.code)),
      source: "manual",
      createdByName: actorName,
      updatedByName: actorName,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(row);
    return this.view(row);
  }

  update(input: UpdatePlatformProspectInput, actorName: string, now: string): PlatformProspect {
    const row = this.find(input?.prospectId);
    const { values, fieldErrors } = normalizeProspectChanges(input?.changes);
    rejectFieldErrors(fieldErrors);
    if (values.gymName && !sameGymName(values.gymName, row.gymName) && this.rows.some((other) => other !== row && sameGymName(other.gymName, values.gymName!))) rejectFieldErrors({ gymName: "duplicate" });
    const nextOwner = values.ownerId ? this.owner(values.ownerId) : undefined;
    const before = { ...row, ownerId: this.ownerName(row.ownerId) };
    const changes = prospectChangeList(before, { ...values, ...(values.ownerId !== undefined ? { ownerId: nextOwner?.name ?? "" } : {}) });
    if (!changes.length) return this.view(row);
    Object.assign(row, values, { updatedByName: actorName, updatedAt: now });
    this.history.set(row.id, [{ id: `${row.id}-${now}-${Math.random().toString(36).slice(2, 6)}`, action: "updated", actorName, occurredAt: now, changes }, ...(this.history.get(row.id) ?? [])]);
    return this.view(row);
  }

  private seedRow(seed: (typeof AMMAN_PILOT_PROSPECTS)[number], actorName: string, at: string): StoredProspect {
    return { ...seed, sources: [...seed.sources], ownerId: "", followUpOn: "", id: `prospect-${seed.code.toLowerCase()}`, source: "import", createdByName: actorName, updatedByName: actorName, createdAt: at, updatedAt: at };
  }

  private find(prospectId: unknown): StoredProspect {
    const row = typeof prospectId === "string" ? this.rows.find((candidate) => candidate.id === prospectId) : undefined;
    if (!row) throw ApiError.of(ERR.NOT_FOUND, "Prospect not found.", { message: { key: "apiErrors.notFound" } });
    return row;
  }

  private owner(ownerId: string): PlatformProspectOwner {
    const owner = MOCK_PROSPECT_OWNERS.find((candidate) => candidate.id === ownerId);
    if (!owner) rejectFieldErrors({ ownerId: "unknownOwner" });
    return owner!;
  }

  private ownerName(ownerId: string): string {
    return MOCK_PROSPECT_OWNERS.find((candidate) => candidate.id === ownerId)?.name ?? "";
  }

  private view(row: StoredProspect): PlatformProspect {
    const { ownerId, source: _source, createdByName: _createdByName, updatedByName, ...fields } = row;
    const owner = MOCK_PROSPECT_OWNERS.find((candidate) => candidate.id === ownerId);
    return { ...fields, sources: [...fields.sources], ...(owner ? { owner: { ...owner } } : {}), updatedBy: updatedByName };
  }
}
