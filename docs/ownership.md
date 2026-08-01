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
| `app/**` (pages, components) | **WS-D** | All seven routes, modals, chrome |

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
