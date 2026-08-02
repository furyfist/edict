# Ownership map

Four workstreams, near-disjoint file ownership. The point is that four people
commit all day without blocking or conflicting with each other.

**Rule:** do not create a file outside your directories. If you need one that
belongs to another workstream, ask its owner rather than adding it.

---

## Directory ownership

| Directory | Owner | Contents |
|---|---|---|
| `lib/contracts/` | **WS-A** | The five frozen shapes. Written once in M0, read-only afterward |
| `lib/fixtures/` | **WS-A** | Fixture generators. Additive changes welcome from anyone |
| `lib/policy/engine/` | **WS-A** | Pure evaluator. Imports nothing outside itself |
| `lib/evidence/` | **WS-A** | Bundle assembly |
| `lib/outcome/` | **WS-A** | Outcome router |
| `lib/ledger/` | **WS-A** | Append-only writer and queries |
| `lib/clock/` | **WS-A** | Demo clock |
| `lib/db/` | **WS-A** | Client and seed |
| `prisma/` | **WS-A** | Schema. **Single owner. Announce every change** |
| `lib/prava/` | **WS-B** | The only payment boundary |
| `lib/agent/` | **WS-C** | Proposer, output-contract validation, stub |
| `lib/policy/compiler/` | **WS-C** | English to rules |
| `lib/explain/` | **WS-C** | Deterministic explanation templates |
| `lib/email/` | **WS-C** | Vendor draft generation |
| `app/console/**` | **WS-D** | All eight console routes |
| `app/page.tsx` | **WS-D** | The entry page — the one surface outside the console shell |
| `app/_components/**` | **WS-D** | `ui/` primitives, `layout/` atoms, `feedback/` states, `data/` tables, `domain/` vocabulary, `shell/` chrome, `marketing/` decoration |
| `app/_lib/**` | **WS-D** | The class merger and the tone map — the two files a colour or type decision has to pass through |

---

## Route ownership

Three workstreams create files under `app/api/`. Claim your paths here before
writing them so nobody creates the same route twice.

| Route | Owner | Phase |
|---|---|---|
| `app/api/tick/` | **WS-A** | M1 |
| `app/api/policy/` | **WS-C** | M2 |
| `app/api/approvals/` | **WS-B** | M3 |
| `app/api/kill/` | **WS-B** | M3 |
| `app/api/demo/` | **WS-D** | M4 |

Page routes, all **WS-D**:

`/` (ledger) · `/refusals` · `/policy` · `/authority` · `/vendors` ·
`/approvals` · `/attack`

---

## V2 additions

New directories and the routes that drive them. Same rule as above: do not
create a file outside your directories.

| Directory / file | Owner | Contents |
|---|---|---|
| `lib/simulate/` | **WS-A** | The simulation plane. Pure — engine and contracts only, enforced by the architecture test |
| `lib/policy/preview.ts` | **WS-C** | The I/O the simulation plane refuses to do: grouped evidence reads, preview digest |
| `lib/policy/activation.ts` | **WS-C** | The activation record: preview recheck, sign, persist |
| `lib/attest/claims.ts` | **WS-A** | The claim envelope. Shared by all three V2 claim types |
| `app/api/policy/diff/` | **WS-C** | Behavioral diff, on demand |
| `scripts/replay-history.ts` | **WS-A** | History replay CLI |
| `lib/reconcile/` | **WS-B** | Two-sided reconciliation. Core is pure; `run.ts` does the reads through `lib/prava`'s index |
| `app/api/reconcile/` | **WS-B** | Run a reconciliation, read the latest attestation |
| `lib/adversary/` | **WS-C** | The frozen corpus, attack planning, the hostile proposer. Quarantined exactly like `lib/agent` — plans attacks, never delivers them |
| `lib/gauntlet/` | **WS-A** | Aggregation and the signed adversarial record. Outside the adversary's wall on purpose: the attacker does not write its own scoreboard |
| `app/api/gauntlet/` | **WS-A** | The runner that delivers attacks and the route that signs the record |
| `app/console/gauntlet/` | **WS-D** | Scoreboard, corpus browser, adversarial ledger view |

**Schema change announced (V2/M1):** one new enum `ClaimType` and one new model
`Claim`. This is a new table, not an additive column, and it is deliberate — the
three V2 claim types (activation, reconciliation, adversarial) are one object,
so adding a type must never mean adding a table, a signer, or a verifier. No
existing model was altered.

**Schema change announced (V2/M3):** one new enum `RunContext`, and two additive
columns on `Tick` (`runContext`, `attackId`).

**Deliberately NOT on `LedgerEntry`.** An entry's contract projection is what
gets signed; adding a field there would change every signed payload and
invalidate every receipt ever issued — the ledger would read CHAIN COMPROMISED
on stage for a schema change nobody attacked. Verified: all existing receipts
still validate after this change. Context is a property of the run, not of the
decision, and it travels beside the record rather than inside it.

**Schema change announced (V2/M2):** one new model `MockCharge` — the mock
payment provider's own book, written only by the mock adapter. It exists so
reconciliation has a genuinely independent second book when no provider is
connected. `resetDatabase` clears it and `Claim` first: a surviving mock charge
would appear in the next reconciliation as the system accusing itself of moving
money without a record, because somebody pressed reseed.

---

## Known contention points

**`prisma/schema.prisma`** — the highest-risk shared file in the repository.
Single owner, WS-A. Frozen after M1 except for additive columns. Announce before
committing a change.

**`lib/outcome/`** — WS-B edits this once, in M3, to wire the approval paths.
WS-A must not be editing it at the same time. Schedule it or hand ownership over
for that commit.

**`lib/contracts/`** — written once in M0 and treated as read-only. It changes
only by explicit team decision, never incidentally, because every workstream
codes against it.

---

## Integration points by phase

| Phase | What connects |
|---|---|
| **M0** | Contracts published. Everything downstream unblocks |
| **M1** | Engine, ledger, and mock adapter join at the outcome router; the tick runner joins everything |
| **M2** | The real agent replaces the stub behind an unchanged signature |
| **M3** | The real adapter replaces the mock behind an unchanged interface; the UI stops using fixtures |
| **M4** | The full seed lands against the finished system |

Both swaps — stub to real agent, mock to real adapter — happen one milestone
apart on purpose. Introducing both uncertain dependencies at once means a failure
has two suspects.
