import { db } from "../db/client";
import type { Frequency, Policy, PolicyRule, PolicyStatus } from "../contracts";
import type { PolicyDraft } from "./compiler";

/**
 * Policy version persistence.
 *
 * Policies are immutable. Editing produces a NEW version; nothing is ever
 * rewritten in place. Activating a version:
 *
 *   - does not alter past ledger entries (they cite the version they ran under)
 *   - does not cancel pending approvals (each pinned its own version)
 *   - does NOT modify any existing mandate
 *
 * That last one matters most. Changing a policy changes what the agent is
 * permitted to propose; it cannot change what the card network will honour.
 * Raising an actual ceiling requires a passkey ceremony, every time.
 */

/** Persists a compiled draft as DRAFT. Inert — it governs nothing. */
export async function saveDraft(draft: PolicyDraft): Promise<string> {
  const latest = await db.policyVersion.findFirst({
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const created = await db.policyVersion.create({
    data: {
      version: (latest?.version ?? 0) + 1,
      englishText: draft.englishText,
      status: "DRAFT",
      activatedAt: null,
      rules: {
        create: draft.rules.map((rule) => ({
          ordinal: rule.ordinal,
          effect: rule.effect,
          scopeKind: rule.scope.kind,
          scopeVendorId: rule.scope.kind === "VENDOR" ? rule.scope.vendorId : null,
          scopeCategory:
            rule.scope.kind === "CATEGORY" ? rule.scope.category : null,
          maxAmountCents: rule.conditions.maxAmountCents ?? null,
          minActiveSeatPct: rule.conditions.minActiveSeatPct ?? null,
          frequency: rule.conditions.frequency ?? null,
          renewalWithinDays: rule.conditions.renewalWithinDays ?? null,
          sourceFragment: rule.sourceFragment,
        })),
      },
    },
    select: { id: true },
  });

  return created.id;
}

/**
 * The confirmation gate.
 *
 * Only ever called from an explicit human action in the interface, after the
 * compiled rules have been shown beside the sentences they came from. There is
 * no code path that activates a policy as a side effect of compiling one.
 */
export async function activateVersion(
  policyVersionId: string,
  at: Date,
): Promise<void> {
  await db.$transaction([
    db.policyVersion.updateMany({
      where: { status: "ACTIVE" },
      data: { status: "SUPERSEDED" },
    }),
    db.policyVersion.update({
      where: { id: policyVersionId },
      data: { status: "ACTIVE", activatedAt: at },
    }),
  ]);
}

export async function listVersions() {
  return db.policyVersion.findMany({
    orderBy: { version: "desc" },
    include: { rules: { orderBy: { ordinal: "asc" } } },
  });
}

export async function getVersion(id: string) {
  return db.policyVersion.findUnique({
    where: { id },
    include: { rules: { orderBy: { ordinal: "asc" } } },
  });
}

/**
 * The one place a stored policy becomes the engine's `Policy` contract.
 *
 * This mapping used to live inside the tick runner. It has three callers now —
 * the tick, the preview, and the behavioral diff — and three copies of it would
 * be three chances for a preview to describe a policy the tick would not
 * enforce. That divergence would be invisible until it mattered.
 */
type VersionRow = NonNullable<Awaited<ReturnType<typeof getVersion>>>;

export function toPolicy(row: VersionRow): Policy {
  const rules: PolicyRule[] = row.rules.map((rule) => ({
    id: rule.id,
    ordinal: rule.ordinal,
    effect: rule.effect,
    scope:
      rule.scopeKind === "VENDOR"
        ? { kind: "VENDOR", vendorId: rule.scopeVendorId ?? "" }
        : rule.scopeKind === "CATEGORY"
          ? { kind: "CATEGORY", category: rule.scopeCategory ?? "" }
          : { kind: "ANY" },
    conditions: {
      ...(rule.maxAmountCents !== null
        ? { maxAmountCents: rule.maxAmountCents as never }
        : {}),
      ...(rule.minActiveSeatPct !== null
        ? { minActiveSeatPct: rule.minActiveSeatPct }
        : {}),
      ...(rule.frequency !== null ? { frequency: rule.frequency as Frequency } : {}),
      ...(rule.renewalWithinDays !== null
        ? { renewalWithinDays: rule.renewalWithinDays }
        : {}),
    },
    sourceFragment: rule.sourceFragment,
  }));

  return {
    id: row.id,
    version: row.version,
    englishText: row.englishText,
    rules,
    status: row.status as PolicyStatus,
    compiledAt: row.compiledAt.toISOString(),
    activatedAt: row.activatedAt ? row.activatedAt.toISOString() : null,
  };
}

/** The policy currently in force, or null when the agent has no authority. */
export async function activePolicy(): Promise<Policy | null> {
  const row = await db.policyVersion.findFirst({
    where: { status: "ACTIVE" },
    include: { rules: { orderBy: { ordinal: "asc" } } },
    orderBy: { version: "desc" },
  });
  return row ? toPolicy(row) : null;
}

/** A specific version, in engine shape. Used by the preview and the diff. */
export async function policyById(id: string): Promise<Policy | null> {
  const row = await getVersion(id);
  return row ? toPolicy(row) : null;
}
