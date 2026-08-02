# Edict

An agent that holds a company's software budget under delegated, network-enforced
authority.

A human writes a spending policy in English. The policy compiles into Prava
mandates. The agent proposes renewal actions unattended, a deterministic engine
adjudicates them, and Prava executes what is permitted. Every action is appended
to a ledger naming four separate actors: who decided, who authorized, who
executed, who recorded.

The claim is not that the agent is clever. It is that the agent cannot exceed its
authority even when it is wrong, manipulated, or compromised.

---

## Status

**Phase M0 — Foundation.** Contracts frozen, schema complete, demo clock and seed
in place, shell deployed. The pipeline itself lands in M1.

Planning documents, in reading order:

| Document | What it is |
|---|---|
| `docs/engineering_decisions.md` | Engineering Design Specification — the source of truth |
| `docs/implementation_plan.md` | Implementation Roadmap — critical path and workstreams |
| `docs/implementation_handbook.md` | Five phases, commit by commit |
| `docs/ownership.md` | Who owns which directory and route |
| `docs/spikes/prava-decline.md` | The one open question that gates the demo narrative |

---

## Setup

Requires Node 22+ and a Postgres database. Neon or Supabase is fine — one
environment, no local/deployed drift.

```bash
npm install
```

Copy the environment template and fill it in:

```bash
cp .env.example .env
```

`DATABASE_URL` is the only value needed to run M0. Prava and OpenAI keys are
required from M2 onward.

Push the schema and seed three vendors:

```bash
npm run db:push && npm run seed
```

Run it:

```bash
npm run dev
```

`/` is the entry page. The product lives under `/console` — eight routes behind
one sidebar, each answering a single question. `⌘1`–`⌘8` jump between them.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run seed` | Seed the demo dataset — deterministic and idempotent |
| `npm run db:push` | Push the Prisma schema to the database |
| `npm run db:studio` | Browse the database |
| `npm run keygen` | Generate a receipt signing key for `RECEIPT_SIGNING_KEY` |
| `npm run verify <file>` | Verify an exported receipt bundle — offline, no dependencies |

---

## Architectural invariants

These hold at every commit. A change that violates one is wrong regardless of
what it enables.

1. **The LLM never authorizes payments.** `lib/agent` has no import path to
   `lib/prava`, `lib/ledger`, `lib/policy/engine`, `lib/outcome`, or `lib/db`.
   Enforced by the module graph, not by a prompt — and checked **transitively**
   by `lib/architecture.test.ts`, which fails the build and prints the route.
   A `grep` proves there is no direct edge; only the graph proves there is no
   path.
2. **The policy engine is deterministic.** No I/O, no clock, no randomness, no
   model. It imports only `lib/contracts`, which is types and constants and
   imports nothing at all. Both facts are asserted by the same test.
3. **The Prava adapter is the only payment boundary.** One module can move money,
   with one caller.
4. **The ledger is append-only, and provably so.** No update path, no delete
   path. Corrections are new entries referencing prior entry ids. Every entry is
   signed and hash-linked to its predecessor, so the claim is checkable by
   someone who does not trust us — export the chain and run
   `npm run verify <file>` with the application closed.
5. **Unknown always fails safely.** Missing evidence, unmatched rules, and
   malformed proposals resolve to `REQUIRE_APPROVAL` or `DENY`. Never to
   `ALLOW_AUTO`.
6. **No component reads wall-clock time for domain logic.** System time is a
   database value — see `lib/clock`.

A useful review question for any change: *does this give the language model a
path to money that did not exist before?* Anything other than a flat no is a
rejection.

---

## Disclosure

Written here rather than discovered later.

- **Usage data is seeded.** Seat counts, login history, and vendor messages are
  fabricated for the demo and labeled as such in the interface. The enforcement
  is not seeded.
- **Payments run against Prava's sandbox.** No real money moves. The sandbox
  banner is permanent and undismissable.
- **Vendor names and list pricing are real.** Seat counts and usage are not.
- **Receipts prove integrity, not truth.** A signature shows the record was
  written by the keyholder and has not been altered since. It does not show the
  record was correct when written, and there is no external anchor — see
  [`docs/disclosure.md`](docs/disclosure.md).

Full disclosure — what is real, what is fabricated, what is simulated, what is
deliberately absent, and the prior-work boundary — is in
[`docs/disclosure.md`](docs/disclosure.md).

Demo driving instructions and recovery steps are in
[`docs/runbook.md`](docs/runbook.md).
