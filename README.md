# edict — Spend Guardian

An agent that holds a company's software budget under delegated,
network-enforced authority.

A human writes a spending policy in English. The policy compiles into Prava
mandates. An agent proposes renewal actions unattended, a deterministic engine
adjudicates them, and Prava executes what is permitted. Everything that happens
is appended to a ledger naming four separate actors: who decided, who
authorized, who executed, who recorded.

The claim is not that the agent is clever. It is that the agent cannot exceed
its authority even when it is wrong, manipulated, or compromised.

## Running locally

```
npm install
cp .env.example .env        # set DATABASE_URL
npm run db:push             # apply the schema
npm run seed                # seed vendors, renewals, policy, clock
npm run dev
```

The system runs end to end with no external dependency. `PRAVA_MODE=mock` uses
the mock payment adapter and `AGENT_MODE=stub` uses the deterministic stub
proposer. Both sit behind the same interfaces as their real counterparts and
both are retained through the demo as live fallbacks.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run test` | Test suite |
| `npm run typecheck` | Types only, no emit |
| `npm run seed` | Reset and reseed the database |
| `npm run db:push` | Apply the Prisma schema |

## Architecture

Eleven modules under `lib/`, seven routes under `app/`, one `prisma/`, one
`docs/`. No `services/`, no shared `types/`, no `utils/`, no dependency
injection, no event bus.

Seven invariants hold at every commit:

1. The engineering design specification is the source of truth.
2. The language model never authorizes payments — enforced by the module graph.
3. The policy engine is deterministic: no I/O, no clock, no randomness.
4. The Prava adapter is the only module that can move money.
5. The ledger is append-only. Corrections are new entries.
6. Unknown always fails safely, to `REQUIRE_APPROVAL` or `DENY`.
7. The architecture is not redesigned during implementation.

The review question for any change: *does this give the language model a path to
money that did not exist before?* Anything other than a flat no is a rejection.

## Documentation

- [`docs/implementation_handbook.md`](docs/implementation_handbook.md) — phases and commit plan
- [`docs/ownership.md`](docs/ownership.md) — API route ownership map
- [`docs/spikes/prava-decline.md`](docs/spikes/prava-decline.md) — sandbox decline spike
