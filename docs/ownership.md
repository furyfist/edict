# API route and module ownership

Every route path has exactly one owner. Three workstreams creating the same
file is the cheapest failure to prevent and the most expensive to untangle on
day five.

## Workstreams

| Stream | Concern |
|---|---|
| **WS-A** | Contracts, schema, policy engine, evidence, ledger, seed |
| **WS-B** | Payments: the Prava adapter, mandates, approvals, kill switch |
| **WS-C** | The model: agent, policy compiler, explainer, email drafter |
| **WS-D** | Product surfaces: pages, modals, attack console, deployment |

## API routes

| Route | Method(s) | Owner | Phase | Purpose |
|---|---|---|---|---|
| `/api/tick` | POST | WS-A | M1 | The single scheduler entry point. One tick at a time. |
| `/api/policy/compile` | POST | WS-C | M2 | English in, an inert draft version out. |
| `/api/policy/activate` | POST | WS-C | M2 | Human confirmation. The only path that grants force. |
| `/api/approvals/[id]/approve` | POST | WS-B | M3 | Policy exception. Permits one charge, grants nothing further. |
| `/api/approvals/[id]/reject` | POST | WS-B | M3 | Writes a refusal and closes the action for the cycle. |
| `/api/approvals/[id]/ceiling-raise` | POST | WS-B | M3 | Passkey ceremony. Creates a new mandate. No override path. |
| `/api/kill` | POST | WS-B | M3 | Pauses every active mandate and halts the next tick. |
| `/api/demo/inject` | POST | WS-D | M4 | Attack console. Injects a vendor message. |
| `/api/demo/advance` | POST | WS-D | M4 | Advances the demo clock. |
| `/api/demo/reseed` | POST | WS-D | M4 | Full reset in seconds between runs. |

No other route exists. A surface that needs data it cannot get from this list
reads it in a server component instead of growing a new endpoint.

## Module ownership

| Module | Owner | May import |
|---|---|---|
| `lib/contracts` | WS-A | nothing |
| `lib/fixtures` | WS-A | `lib/contracts` |
| `lib/clock` | WS-A | `lib/db` |
| `lib/db` | WS-A | — |
| `lib/policy/engine` | WS-A | **nothing outside its own directory** |
| `lib/policy/compiler` | WS-C | `lib/contracts`, `lib/agent/client` |
| `lib/evidence` | WS-A | `lib/contracts`, `lib/db`, `lib/clock` |
| `lib/ledger` | WS-A | `lib/contracts`, `lib/db`, `lib/clock` |
| `lib/outcome` | WS-A | `lib/contracts`, `lib/ledger`, `lib/prava`, `lib/policy/engine` |
| `lib/prava` | WS-B | `lib/contracts`, `lib/db` |
| `lib/agent` | WS-C | `lib/contracts` **only** |
| `lib/explain` | WS-A or WS-C | `lib/contracts` |
| `lib/email` | WS-C | `lib/contracts`, `lib/agent/client` |

Two rows in that table are load-bearing rather than organizational:

- **`lib/policy/engine` imports nothing outside itself.** That is what makes it
  deterministic, and it is checked, not trusted.
- **`lib/agent` imports only `lib/contracts`.** It cannot reach `lib/prava`,
  `lib/ledger`, or `lib/policy/engine`. The model's isolation from money is a
  property of the module graph, not of a prompt.

## Shared-file schedule

Files more than one commit touches, and the order they are touched in:

| File | Commits | Owner |
|---|---|---|
| `prisma/schema.prisma` | M0.6, M0.7 | WS-A, sequential |
| `lib/outcome/` | M1.9, M1.10, M3.4 | WS-A, then WS-B for M3.4 |
| `lib/db/seed.ts` | M0.9, M4.3, M4.4, M4.5 | WS-A, sequential |
| `app/layout.tsx` | M0.10, M4.7 | WS-D, sequential |

`lib/outcome/` in M3.4 is the one genuine cross-stream surface. WS-A must not be
editing it while WS-B wires the approval path; hand ownership to WS-B for that
commit rather than coordinating live.
