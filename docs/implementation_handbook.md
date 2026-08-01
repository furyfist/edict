# Edict — Implementation Handbook

**Status:** Final planning document. Implementation begins after this.

**Source of truth:** `docs/engineering_decisions.md` (Engineering Design Specification) and `docs/implementation_plan.md` (Implementation Roadmap). Both are frozen. This handbook organizes their execution and adds nothing to them.

---

## Project Overview

Edict is an agent that holds a company's software budget under delegated, network-enforced authority. A human writes a spending policy in English. The policy compiles into Prava mandates. An agent proposes renewal actions unattended, a deterministic engine adjudicates them, and Prava executes what is permitted. Everything that happens is appended to a ledger that names four separate actors: who decided, who authorized, who executed, who recorded.

The product's claim is not that the agent is clever. It is that the agent cannot exceed its authority even when it is wrong, manipulated, or compromised.

**Shape:** one Next.js application, one Postgres database, one external dependency (Prava), one demo environment.

**Team:** four engineers across four workstreams.

**Duration:** six days, five phases.

---

## Architectural Invariants

These hold at every commit. A change that violates one is wrong regardless of what it enables.

| # | Invariant | How it is enforced |
|---|---|---|
| 1 | The Engineering Design Specification is the source of truth | Any deviation is a spec bug, raised and resolved in the spec before code changes |
| 2 | **The LLM never authorizes payments** | `lib/agent` does not import `lib/prava`, `lib/ledger`, or `lib/policy/engine`. Enforced by the module graph, not by a prompt |
| 3 | **The Policy Engine is deterministic** | `lib/policy/engine` performs no I/O, reads no clock, uses no randomness, calls no model. It imports nothing outside its own directory |
| 4 | **The Prava Adapter is the only payment boundary** | Exactly one module can move money. Exactly one caller invokes it |
| 5 | **The Ledger is append-only** | No update path, no delete path. Corrections are new entries referencing prior entry ids |
| 6 | **Unknown always fails safely** | Missing evidence, unmatched rules, and malformed proposals all resolve to `REQUIRE_APPROVAL` or `DENY`. Never to `ALLOW_AUTO` |
| 7 | The architecture is not redesigned during implementation | Phases organize the frozen design. They do not revisit it |

A useful review question for any pull request: *does this give the language model a path to money that did not exist before?* If the answer is anything other than a flat no, the change is rejected.

---

## Phase Progression

| Phase | Name | Ends with |
|---|---|---|
| **M0** | Foundation | Four engineers unblocked, deployed skeleton, contracts frozen |
| **M1** | Deterministic Core | A tick runs end to end with zero non-determinism |
| **M2** | AI & Policy | Real LLM in both surfaces, isolated from authority |
| **M3** | Payments & Product | Real money moves, seven pages on live data |
| **M4** | Demo, Polish & Launch | Rehearsed, hardened, ready |

---

# Phase M0 — Foundation

## Objective

Convert an empty repository into a deployed application with frozen type contracts, a complete database schema, a working demo clock, and a recorded answer to the one question that can invalidate the demo narrative.

## Why this phase exists

Two reasons, both about unblocking rather than building.

First, **four people cannot work in parallel until the type contracts exist.** Every workstream consumes or produces one of five shapes. Publishing those shapes plus fixture generators converts a serial project into a parallel one, and it is the highest-leverage work in the entire six days.

Second, **the Prava sandbox decline behavior must be verified while changing course is still free.** The demo climax depends on an assumption about someone else's sandbox. Answered on day one it costs an hour; discovered on day five it costs the project.

Nothing in this phase is impressive. All of it is load-bearing.

## Deliverables

- Next.js application running locally and deployed
- Postgres provisioned, connected, migrated
- Complete Prisma schema for every entity in the specification
- The five type contracts: evidence bundle, proposal, verdict, policy rule, ledger entry
- Fixture generators producing valid instances of each contract
- Demo clock module backed by the database
- Seed skeleton covering three vendors — one allow, one escalate, one deny
- Application shell with the permanent sandbox banner and navigation
- Prava sandbox spike, answered and recorded in the repository
- API route ownership map preventing three workstreams from creating the same file

## Dependencies

None. This phase begins from an empty repository.

## Components implemented

`lib/db`, `lib/clock`, `prisma/`, contracts and fixtures, application shell, deployment configuration.

## Expected repository state after completion

```
app/
  layout.tsx                — shell, sandbox banner, nav
  page.tsx                  — placeholder reading from the database
lib/
  contracts/                — the five frozen shapes
  fixtures/                 — generators for each contract
  clock/                    — demo clock
  db/                       — client, seed skeleton
prisma/
  schema.prisma
docs/
  engineering_decisions.md
  implementation_plan.md
  implementation_handbook.md
  spikes/prava-decline.md
```

The application deploys. A page reads real rows. Nothing else works, and nothing else is expected to.

## Commit Plan

**1. `chore: initialize next.js app with typescript`**
- *Purpose:* establish the single application shape the whole project lives in.
- *Files:* `package.json`, `tsconfig.json`, `next.config`, `app/layout.tsx`, `app/page.tsx`.
- *Dependencies:* none.
- *Outcome:* the app runs locally.

**2. `chore: add prisma with postgres connection`**
- *Purpose:* connect the one database before anything needs to store something.
- *Files:* `prisma/schema.prisma`, `lib/db/client.ts`, `.env.example`.
- *Dependencies:* commit 1.
- *Outcome:* migrations run against a live Postgres instance.

**3. `spike: verify prava sandbox over-cap decline behavior`**
- *Purpose:* answer the only question that can invalidate the demo narrative.
- *Files:* `docs/spikes/prava-decline.md`, throwaway script (not merged into `lib/`).
- *Dependencies:* Prava sandbox credentials.
- *Outcome:* a recorded yes or no. If no, the fallback climax is the paused-mandate decline and the team knows on day one.

**4. `feat: define core type contracts`**
- *Purpose:* unblock all four workstreams. **The single most important commit in M0.**
- *Files:* `lib/contracts/`.
- *Dependencies:* commit 1.
- *Outcome:* evidence bundle, proposal, verdict, policy rule, and ledger entry shapes are frozen. Written by one person, not negotiated.

**5. `feat: add fixture generators for core contracts`**
- *Purpose:* let the UI workstream build against data before a backend exists.
- *Files:* `lib/fixtures/`.
- *Dependencies:* commit 4.
- *Outcome:* every contract can be instantiated with realistic values in one call.

**6. `feat: add prisma schema for vendors, seats, usage and renewals`**
- *Purpose:* the evidence side of the data model.
- *Files:* `prisma/schema.prisma`.
- *Dependencies:* commit 2.
- *Outcome:* the entities the evidence builder will read.

**7. `feat: add prisma schema for policy versions, mandates, approvals and ledger`**
- *Purpose:* the authority and accountability side of the data model.
- *Files:* `prisma/schema.prisma`.
- *Dependencies:* commit 6.
- *Outcome:* schema complete. **Frozen after M1 except for additive columns.**

**8. `feat: add demo clock backed by database`**
- *Purpose:* built before any consumer exists, so no component ever reads wall time.
- *Files:* `lib/clock/`.
- *Dependencies:* commit 2.
- *Outcome:* system time is a database value that can be read and advanced.

**9. `feat: add database seed skeleton with three vendors`**
- *Purpose:* give every workstream real rows immediately, covering allow, escalate, and deny.
- *Files:* `lib/db/seed.ts`.
- *Dependencies:* commit 7.
- *Outcome:* `seed` runs from empty and is reproducible.

**10. `feat: add app shell with sandbox banner and navigation`**
- *Purpose:* the permanent chrome, established before pages exist so no page ships without it.
- *Files:* `app/layout.tsx`, navigation and banner components.
- *Dependencies:* commit 1.
- *Outcome:* an undismissable sandbox banner and a nav skeleton for seven routes.

**11. `chore: configure deployment and environment variables`**
- *Purpose:* there is never a first deployment under pressure.
- *Files:* deployment config, `.env.example`.
- *Dependencies:* commits 2 and 10.
- *Outcome:* a live URL reading from the database.

**12. `docs: record api route ownership map`**
- *Purpose:* prevent three workstreams from creating the same route file.
- *Files:* `docs/ownership.md`.
- *Dependencies:* none.
- *Outcome:* every route path has exactly one named owner.

## Parallel Work

| Task | Owner | Independent of |
|---|---|---|
| Prava spike | WS-B | Everything — runs concurrently with setup |
| Contracts and fixtures | WS-A | Must complete before other streams start |
| Prisma schema | WS-A | — |
| App shell and nav | WS-D | Contracts |
| Deployment config | WS-D | Schema |

**Integration point:** commit 4. Everything before it is setup; everything after it can be parallel.

**Merge risk:** commits 6 and 7 both touch `prisma/schema.prisma`. Same owner, sequential, no conflict.

## Implementation Order Rationale

The spike runs first because it can invalidate the narrative and it does not block anyone. Contracts precede the schema deliberately — the shapes the system passes around should be designed from the domain, not derived from table columns, and letting the database shape the contracts is how persistence concerns leak into a pure engine later.

The demo clock is built before any consumer. This is the ordering choice most likely to be questioned, and it is the correct one: retrofitting a clock into finished components means auditing every time access in the codebase, whereas building it first means the wrong thing was never written.

Deployment lands in M0 rather than M4 for the same reason.

## Validation Checklist

- [ ] `seed` runs from an empty database and produces identical output twice
- [ ] The deployed URL renders a page reading real rows
- [ ] Every contract has a fixture generator returning a valid instance
- [ ] The demo clock can be read and advanced; nothing reads wall time
- [ ] The Prava spike answer is recorded in `docs/spikes/`
- [ ] Every planned API route has exactly one owner
- [ ] The sandbox banner cannot be dismissed

## Checkpoint

**What should already work:** deployment, database, seed, clock, contracts, fixtures.

**What can be demonstrated:** a deployed page reading seeded vendors. Unimpressive and entirely expected.

**What should be tested:** seed reproducibility. Nothing else has logic yet.

**What should be deployed:** everything. From here every phase deploys.

**What must never break later:** the five contracts and the demo clock. Contracts change only by explicit team decision, never incidentally. **No component may ever read wall-clock time.**

---

# Phase M1 — Deterministic Core

## Objective

Build the entire pipeline — evidence to ledger — with a stub agent and a mock adapter, so that the system is provably correct before either uncertain dependency exists.

## Why this phase exists

This is the phase that makes the project safe.

The two things that can behave unexpectedly are the language model and Prava's sandbox. By substituting a deterministic stub for one and a mock for the other, the full pipeline can be built, run, and verified with zero non-determinism anywhere in the system. When the real versions arrive in M2 and M3, each swap is a single module behind an unchanged interface, and any failure has exactly one suspect.

It also front-loads the product's central claim. The policy engine is pure, dependency-free, and the thing judges will probe hardest. Building it here means that if everything after this phase went wrong, the team would still hold the thing it is being judged on.

## Deliverables

- Policy engine implementing two-pass evaluation, precedence, terminal default, and every specified edge case
- A test suite covering all thirteen edge cases plus the ordering property
- Evidence builder
- Ledger writer with append-only guarantees and capture-before-charge ordering
- Mock Prava adapter behind the frozen payment boundary interface
- Stub agent returning deterministic proposals
- Outcome router
- Tick runner with single-flight lock, idempotency, and halting conditions

## Dependencies

M0 contracts, schema, seed, clock.

## Components implemented

`lib/policy/engine`, `lib/evidence`, `lib/ledger`, `lib/outcome`, `lib/prava` (mock), `lib/agent` (stub), `app/api/tick`.

## Expected repository state after completion

```
lib/
  policy/engine/       — pure evaluator, fully tested
  evidence/            — bundle assembly
  ledger/              — append-only writer + queries
  outcome/             — router
  prava/               — mock adapter behind the real interface
  agent/               — deterministic stub
app/api/tick/          — the single scheduler entry point
```

Hitting the tick endpoint writes ledger entries. No LLM, no network, no Prava.

## Commit Plan

**1. `feat: implement policy engine two-pass evaluation`**
- *Purpose:* the product's central claim, built first because it depends on nothing.
- *Files:* `lib/policy/engine/`.
- *Dependencies:* M0 contracts.
- *Outcome:* denials absolute, then first-match-wins, terminal default `REQUIRE_APPROVAL`. Exactly one rule id always cited.

**2. `test: cover policy engine precedence and ordering`**
- *Purpose:* prove that a `DENY` at ordinal 9 defeats an `ALLOW_AUTO` at ordinal 1.
- *Files:* engine tests.
- *Dependencies:* commit 1.
- *Outcome:* the two-pass property is verified rather than asserted.

**3. `test: cover policy engine edge cases and fail-closed behavior`**
- *Purpose:* prove invariant 6 across every specified edge case.
- *Files:* engine tests.
- *Dependencies:* commit 1.
- *Outcome:* all thirteen cases pass. Missing evidence never yields `ALLOW_AUTO`.

**4. `feat: implement evidence builder`**
- *Purpose:* the pipeline's origin — one frozen snapshot both the agent and the engine read.
- *Files:* `lib/evidence/`.
- *Dependencies:* M0 schema and clock.
- *Outcome:* a bundle assembled from database facts and the demo clock.

**5. `feat: implement ledger writer with append-only guarantees`**
- *Purpose:* the pipeline's terminus, built before the middle so everything has somewhere to land.
- *Files:* `lib/ledger/`.
- *Dependencies:* M0 schema.
- *Outcome:* entries with all four attribution fields. No update or delete path exists.

**6. `feat: add ledger query helpers`**
- *Purpose:* read-side access for the UI, including the refusal filter.
- *Files:* `lib/ledger/`.
- *Dependencies:* commit 5.
- *Outcome:* the refusal view is a filter over one model, not a second model.

**7. `feat: implement mock prava adapter behind payment boundary`**
- *Purpose:* establish the money boundary with zero external dependency. **The interface is written before either implementation.**
- *Files:* `lib/prava/`.
- *Dependencies:* M0 contracts.
- *Outcome:* charge, pause, resume, cancel, and read, all returning normalized results including typed failures.

**8. `feat: implement stub agent returning deterministic proposals`**
- *Purpose:* the key de-risking move — the pipeline becomes end-to-end testable before an LLM exists.
- *Files:* `lib/agent/`.
- *Dependencies:* M0 contracts.
- *Outcome:* a lookup table from vendor to fixed proposal. **Retained in the repository through the demo as a live fallback.**

**9. `feat: implement outcome router`**
- *Purpose:* keep branching out of the engine so the engine stays pure.
- *Files:* `lib/outcome/`.
- *Dependencies:* commits 1, 5, 7.
- *Outcome:* verdicts become charge instructions, approval requests, or refusals.

**10. `feat: implement tick runner with single-flight lock`**
- *Purpose:* close the loop.
- *Files:* `app/api/tick/`, `lib/outcome/`.
- *Dependencies:* commits 4, 8, 9.
- *Outcome:* a tick selects renewals, pins the policy version, and drives the pipeline. One at a time.

**11. `feat: add tick idempotency on renewal and cycle`**
- *Purpose:* the stage button will be pressed twice.
- *Files:* tick runner.
- *Dependencies:* commit 10.
- *Outcome:* two ticks produce one entry per renewal.

**12. `feat: add tick halting conditions and halted ledger entries`**
- *Purpose:* a halt must be visible, never silent.
- *Files:* tick runner, ledger writer.
- *Dependencies:* commit 11.
- *Outcome:* kill switch, missing policy, lock contention, and adapter health each produce a recorded `HALTED` entry.

**13. `test: verify capture-before-charge ordering survives adapter failure`**
- *Purpose:* money that moved must never be invisible.
- *Files:* integration test.
- *Dependencies:* commit 12.
- *Outcome:* killing the mock adapter mid-charge still produces a recorded outcome.

## Parallel Work

| Task | Owner | Runs alongside |
|---|---|---|
| Policy engine + tests (1–3) | WS-A | Everything below |
| Mock adapter (7) | WS-B | Engine work |
| Agent contract validation groundwork | WS-C | Engine work |
| Ledger, authority, vendors pages on fixtures | WS-D | All backend work |

**Integration points:** commit 9 joins engine, ledger, and adapter. Commit 10 joins everything.

**Merge risks:** commits 9 and 10 both touch `lib/outcome/` — same owner, sequential. WS-D touches only `app/` and cannot conflict with any of it.

## Implementation Order Rationale

The engine comes first because it is pure, has no dependencies, and is the claim. It can be finished and proven while nothing else exists.

The ledger is built before the outcome router — the reverse would work, but building the terminus first means the router is written against a real destination rather than a placeholder, and placeholders at the write path are exactly where capture-before-charge ordering gets quietly wrong.

The stub agent precedes the tick runner so the first end-to-end run is reproducible. Had the real agent been introduced here, the first pipeline run would have had two possible failure sources instead of zero.

## Validation Checklist

- [ ] All thirteen engine edge cases pass
- [ ] A `DENY` at a high ordinal defeats an `ALLOW_AUTO` at a low one
- [ ] `lib/policy/engine` imports nothing outside its own directory
- [ ] `lib/agent` does not import `lib/prava`, `lib/ledger`, or `lib/policy/engine`
- [ ] Two consecutive ticks produce exactly one entry per renewal
- [ ] Every ledger entry carries all four attribution fields
- [ ] Killing the mock adapter mid-charge still produces a recorded outcome
- [ ] Every halting condition writes a visible `HALTED` entry
- [ ] The ledger exposes no update or delete path

## Checkpoint

**What should already work:** the complete pipeline, deterministically.

**What can be demonstrated:** a tick producing ledger entries with full attribution chains — the entire architecture, proven, without a single external dependency.

**What should be tested:** the policy engine exhaustively. This is the one module with thorough coverage and it stays that way.

**What should be deployed:** the tick endpoint and the seeded database.

**What must never break later:** engine purity, the payment boundary interface, append-only ledger semantics, capture-before-charge ordering. **This is the phase after which the project is no longer at risk. Protect it.**

---

# Phase M2 — AI & Policy

## Objective

Introduce the language model into both of its surfaces — proposing actions and compiling policy — without granting it any authority.

## Why this phase exists

The system is now provably correct and entirely deterministic. This phase adds the only non-deterministic component, deliberately and in isolation.

Both LLM surfaces are advisory by construction. The agent produces a proposal that a pure function adjudicates against re-derived facts. The compiler produces an inert draft that a human confirms. Neither can act. Introducing them now — one milestone before Prava — means that when money starts moving in M3, the model's behavior is already understood.

## Deliverables

- LLM client with fixed temperature and timeout
- Agent output-contract validation, hardened against adversarial and malformed responses
- Real agent proposer, swapped in behind the stub's signature
- Policy compiler translating English into structured rules
- Compiler validations including the unbounded-authority rejection
- Policy version activation gated by human confirmation
- Deterministic explanation templates
- Vendor email drafter

## Dependencies

M1 complete. The pipeline must be closed and verified before a non-deterministic component enters it.

## Components implemented

`lib/agent` (real), `lib/policy/compiler`, `lib/explain`, `lib/email`, `app/api/policy`.

## Expected repository state after completion

```
lib/
  agent/               — real proposer + output contract validation
  agent/stub.ts        — retained fallback
  policy/compiler/     — english to rules + validations
  explain/             — deterministic templates
  email/               — vendor draft generation
app/api/policy/        — compile, confirm, activate
```

The tick now runs on real model output. The mock adapter is still in place.

## Commit Plan

**1. `feat: add llm client with fixed temperature and timeout`**
- *Purpose:* one configured entry point to the model for both surfaces.
- *Files:* `lib/agent/client.ts`.
- *Dependencies:* M1.
- *Outcome:* temperature 0, bounded timeout, typed failure on unreachable.

**2. `feat: implement agent output contract validation`**
- *Purpose:* the boundary that converts model output into a proposal or a refusal.
- *Files:* `lib/agent/`.
- *Dependencies:* commit 1.
- *Outcome:* non-conforming output produces `MALFORMED_PROPOSAL`, never a crash and never a retry with a softer prompt.

**3. `test: cover agent validation against malformed and adversarial output`**
- *Purpose:* prove the validator before trusting it on stage.
- *Files:* agent tests.
- *Dependencies:* commit 2.
- *Outcome:* truncated, wrong-typed, extra-field, and out-of-set action responses all resolve to refusals.

**4. `feat: implement real agent proposer`**
- *Purpose:* judgment under ambiguity, confined to exactly that.
- *Files:* `lib/agent/`.
- *Dependencies:* commits 2, 3.
- *Outcome:* action, amount, one-sentence rationale, one rejected alternative. **Swap requires no change outside `lib/agent/`.**

**5. `feat: implement policy compiler english to rules`**
- *Purpose:* the differentiator — authority originating in the user's own words.
- *Files:* `lib/policy/compiler/`.
- *Dependencies:* commit 1.
- *Outcome:* English becomes an ordered rule array, each rule carrying its source fragment.

**6. `feat: add policy compiler validations and rejection surface`**
- *Purpose:* silent partial compilation is the worst failure this component has.
- *Files:* `lib/policy/compiler/`.
- *Dependencies:* commit 5.
- *Outcome:* every specified validation runs. Rejection names the unsupported clause and shows what was understood.

**7. `feat: enforce unbounded auto-approval rejection`**
- *Purpose:* make unbounded autonomy structurally impossible at the point authority is created.
- *Files:* `lib/policy/compiler/`.
- *Dependencies:* commit 6.
- *Outcome:* an `ALLOW_AUTO` rule with no amount ceiling cannot be compiled.

**8. `feat: add policy version activation with inert draft gate`**
- *Purpose:* keep the model out of the authorization path.
- *Files:* `app/api/policy/`, `lib/policy/compiler/`.
- *Dependencies:* commit 7.
- *Outcome:* a compiled policy has no effect until a human confirms. Versions are immutable; editing produces a new one.

**9. `feat: implement deterministic explanation templates`**
- *Purpose:* uniform structure is what makes explanations read as a system.
- *Files:* `lib/explain/`.
- *Dependencies:* M1 ledger.
- *Outcome:* explanation, counterfactual, and financial impact rendered from structured data. **No LLM.**

**10. `feat: wire explainer into ledger read path`**
- *Purpose:* read-side only, so explanation can never affect execution.
- *Files:* `lib/ledger/`, `lib/explain/`.
- *Dependencies:* commit 9.
- *Outcome:* every entry renders a consistent explanation with its rule citation and source fragment.

**11. `feat: implement vendor email drafter`**
- *Purpose:* the honest answer to "pausing is not cancelling."
- *Files:* `lib/email/`.
- *Dependencies:* commit 1.
- *Outcome:* a draft attached to the ledger entry. Never sent.

## Parallel Work

| Task | Owner | Independent |
|---|---|---|
| Agent client, validation, proposer (1–4) | WS-C | Yes |
| Policy compiler (5–8) | WS-C | Yes, but sequential after the agent work by the same owner |
| Explainer (9–10) | WS-A or WS-C | Yes — read-side only |
| Email drafter (11) | WS-C | Fully isolated, cuttable |
| Prava real adapter groundwork | WS-B | Yes — begins ahead of M3 |
| UI pages on fixtures | WS-D | Yes |

**Integration point:** commit 4 replaces the stub inside the running pipeline.

**Merge risk:** WS-C owns four directories in this phase and is the bottleneck. If the team is unbalanced, move the explainer to WS-A — it is read-side and touches no compiler code.

## Implementation Order Rationale

The agent lands before the compiler despite the compiler being the more visible feature. The reason is failure isolation: the agent enters an already-proven pipeline, so if a tick misbehaves after commit 4, the model is the only new variable. The compiler runs outside the tick path entirely, so its failures cannot break a tick — which makes it the safer of the two to build second, when time pressure is higher.

Validation precedes the real proposer. Building the proposer first and validating after means the first real model responses arrive with nothing to catch them, and malformed output surfaces as a crash rather than a refusal.

The explainer is deliberately last of the deterministic work: it needs real ledger entries to render, and those exist only after the real agent is producing real rationales.

## Validation Checklist

- [ ] The stub-to-real agent swap touched no file outside `lib/agent/`
- [ ] Malformed model output produces `MALFORMED_PROPOSAL` and an escalation, never a crash
- [ ] The agent is never retried with a modified prompt
- [ ] A policy with an uncompilable clause is rejected naming that clause
- [ ] An `ALLOW_AUTO` rule without an amount ceiling cannot be compiled
- [ ] A compiled policy has no effect until confirmed
- [ ] Every rule links to a source fragment present in the input text
- [ ] Explanations are template-rendered and structurally identical across entries
- [ ] Model rationale renders in a separate, labeled region
- [ ] The stub agent still exists and still works

## Checkpoint

**What should already work:** the pipeline on real model output, and English compiling to rules.

**What can be demonstrated:** a policy sentence becoming enforceable rules, and a proposal becoming a refusal that cites that sentence. This is the first genuinely compelling demo.

**What should be tested:** the agent output validator against adversarial inputs.

**What should be deployed:** everything, with the mock adapter still in place.

**What must never break later:** the module boundary keeping `lib/agent` away from money, the inert-draft gate, template-rendered explanations, and the visual separation between verified facts and model prose.

---

# Phase M3 — Payments & Product

## Objective

Replace the mock adapter with real Prava, wire both approval paths, and build all seven pages on live data.

## Why this phase exists

Everything is now stable except the last uncertain dependency. Introducing Prava here — one milestone after the model, exactly as planned — means a failure has one suspect rather than two.

This is also where the product becomes legible. Seven pages, each answering one question, built against real identifiers rather than fixtures.

## Deliverables

- Real Prava adapter behind the mock's interface
- Mandate lifecycle operations and mirror refresh
- Policy exception approval (in-app, no passkey)
- Ceiling raise approval (new mandate, passkey ceremony)
- Approval expiry and rejection handling
- Kill switch
- All seven pages on live data
- All five modals

## Dependencies

M2 complete, and the M0 spike answer.

## Components implemented

`lib/prava` (real), `app/api/approvals`, `app/api/kill`, all pages and modals.

## Expected repository state after completion

```
lib/prava/            — real adapter; mock retained
app/
  ledger/  refusals/  policy/  authority/
  vendors/ approvals/ attack/
  api/approvals/  api/kill/
```

Ledger entries carry Prava identifiers that resolve in Prava's own dashboard.

## Commit Plan

**1. `feat: implement real prava adapter`**
- *Purpose:* the only module that moves money.
- *Files:* `lib/prava/`.
- *Dependencies:* M2, spike answer.
- *Outcome:* real session creation and mandate charge behind the unchanged interface. Endpoint paths read from the live API reference.

**2. `feat: add mandate lifecycle operations`**
- *Purpose:* pause, resume, cancel, read.
- *Files:* `lib/prava/`.
- *Dependencies:* commit 1.
- *Outcome:* full lifecycle control, all through the single boundary.

**3. `feat: add mandate mirror refresh on tick`**
- *Purpose:* Prava owns mandate truth; the local copy is a cache.
- *Files:* `lib/prava/`, tick runner.
- *Dependencies:* commit 2.
- *Outcome:* each tick refreshes status and remaining authority before adjudicating.

**4. `feat: implement policy exception approval flow`**
- *Purpose:* approval within existing mandate authority.
- *Files:* `app/api/approvals/`, `lib/outcome/`.
- *Dependencies:* commit 3.
- *Outcome:* in-app approval permits one charge against an existing mandate and grants nothing further.

**5. `feat: implement ceiling raise approval with passkey handoff`**
- *Purpose:* authority originates in a signed mandate, never in the application database.
- *Files:* `app/api/approvals/`, `lib/prava/`.
- *Dependencies:* commit 4. **Built together with commit 4, never separately.**
- *Outcome:* exceeding a ceiling requires a fresh passkey ceremony. No override path exists.

**6. `feat: add approval expiry and rejection handling`**
- *Purpose:* consent is to act on specific evidence, and evidence ages.
- *Files:* `app/api/approvals/`, `lib/ledger/`.
- *Dependencies:* commit 5.
- *Outcome:* 24-hour expiry, never revived. Rejection writes a refusal and closes that action for the cycle.

**7. `feat: implement kill switch`**
- *Purpose:* the most reassuring object in the product.
- *Files:* `app/api/kill/`, `lib/prava/`.
- *Dependencies:* commit 2.
- *Outcome:* pauses every active mandate and halts the next tick.

**8. `feat: build ledger and refusal pages on live data`**
- *Purpose:* the 5-second impression and the highest-traffic surface. **Wired first.**
- *Files:* `app/ledger/`, `app/refusals/`.
- *Dependencies:* M2 explainer.
- *Outcome:* completed actions reverse-chronological; refusals as a filter with its own route.

**9. `feat: build authority page with mandate meters`**
- *Purpose:* render the leash — authorized, spent, remaining, expires in.
- *Files:* `app/authority/`.
- *Dependencies:* commit 3.
- *Outcome:* remaining authority as a visible depleting quantity, with the kill switch.

**10. `feat: build policy page with source fragment links`**
- *Purpose:* where authority visibly originates.
- *Files:* `app/policy/`.
- *Dependencies:* M2 compiler.
- *Outcome:* English beside compiled rules, each rule linked to its source fragment, with version history.

**11. `feat: build vendors and approvals pages`**
- *Purpose:* where a judge verifies a claim, and where human meets agent.
- *Files:* `app/vendors/`, `app/approvals/`.
- *Dependencies:* commits 6, 8.
- *Outcome:* evidence and renewal timelines; pending and historical approvals with frozen snapshots.

**12. `feat: add ledger detail and approval modals`**
- *Purpose:* the expansion surfaces carrying attribution chains and identifiers.
- *Files:* modal components.
- *Dependencies:* commit 11.
- *Outcome:* Prava mandate and charge ids displayed prominently for live cross-check.

## Parallel Work

| Task | Owner | Independent |
|---|---|---|
| Real adapter and mandates (1–3) | WS-B | Yes |
| Approvals (4–6) | WS-B | After commit 3 |
| Kill switch (7) | WS-B | After commit 2 |
| Pages (8–12) | WS-D | Yes — needs only contracts and explainer |
| Seed expansion groundwork | WS-A | Yes |

**Integration points:** commit 3 joins the real adapter to the tick. Commit 8 is where the UI stops using fixtures.

**Merge risks:** WS-B owns `lib/prava` and both API route groups — sequential within one owner. WS-D owns pages exclusively. The one shared surface is `lib/outcome/` in commit 4, which WS-A must not be editing simultaneously; schedule it or hand ownership to WS-B for that commit.

## Implementation Order Rationale

The adapter precedes approvals because ceiling raises need real mandates to raise. Approvals precede pages because pages showing approval state need approval state to show.

Both approval types ship together in commits 4 and 5 rather than sequentially across days. Building the in-app path alone invites the ceiling raise to be shortcut into it under time pressure, which would collapse the distinction the entire trust argument depends on. They are one unit of work with two commits.

The ledger page is wired to live data before every other page. It is the 5-second impression, the demo's home surface, and the page most likely to expose a data-shape mismatch — finding that on the first page is cheap, finding it on the seventh is not.

## Validation Checklist

- [ ] A ledger entry carries a Prava mandate id and charge id that resolve in Prava's dashboard
- [ ] An over-cap charge is declined and recorded as `NETWORK_DECLINE`, with no retry
- [ ] Declines are never retried; transient failures retry exactly once
- [ ] In-app approval cannot raise a ceiling
- [ ] Exceeding a ceiling requires a passkey, with no override path in the codebase
- [ ] An expired approval cannot be acted on and is not revived
- [ ] The kill switch pauses every mandate and halts the next tick
- [ ] All seven pages render live data
- [ ] The mock adapter still exists and still works

## Checkpoint

**What should already work:** real charges, real declines, both approval paths, the kill switch, all seven pages.

**What can be demonstrated:** the full demo minus the attack — including the cross-check in Prava's own dashboard, which is the strongest credibility moment available.

**What should be tested:** the decline path, manually and repeatedly. The passkey ceremony, on the actual presentation device.

**What should be deployed:** everything.

**What must never break later:** the single payment boundary, the separation between the two approval types, and the ledger identifiers. **Record the passkey ceremony fallback video the day it first works, not on day six.**

---

# Phase M4 — Demo, Polish & Launch

## Objective

Build the attack console, complete the demo dataset, harden every failure surface, and rehearse until the demo survives an unfamiliar driver.

## Why this phase exists

Every demo moment specified in the design must be reachable by clicking, and every failure class must have been triggered at least once before a judge triggers it. Untested failure paths surface during demos rather than before them.

This phase also builds the seed last, deliberately, so it targets a finished system rather than being maintained against a moving one.

## Deliverables

- Attack console for message injection and clock control
- Reseed endpoint
- Full eight-vendor dataset with two policy versions, three approvals, three failures
- Hardened error surfaces and halted states
- Kill switch confirmation and global halted chrome
- Passkey fallback recording and demo runbook
- Seeded-data disclosure and prior-work boundary note
- Three full rehearsals

## Dependencies

M3 complete.

## Components implemented

`app/attack/`, `app/api/demo/`, full `lib/db/seed`, error surfaces, runbook.

## Commit Plan

**1. `feat: build attack console for message injection and clock control`**
- *Purpose:* the climax needs a surface, and it must run the normal tick path.
- *Files:* `app/attack/`, `app/api/demo/`.
- *Dependencies:* M3.
- *Outcome:* a message can be injected into a vendor inbox, the clock advanced, and a tick fired. **Identical code path to the cron.**

**2. `feat: add demo reseed endpoint`**
- *Purpose:* recover from an empty database in seconds between runs.
- *Files:* `app/api/demo/`.
- *Dependencies:* commit 1.
- *Outcome:* a full reset reachable from the UI.

**3. `feat: expand seed to full eight vendor dataset`**
- *Purpose:* every scenario in the specification, deterministic.
- *Files:* `lib/db/seed.ts`.
- *Dependencies:* M3.
- *Outcome:* Figma, Linear, Notion, Datadog, Loom, Airtable, Vercel, CloudSync Pro, each producing its specified scenario.

**4. `feat: add second policy version and seeded approvals`**
- *Purpose:* versioning and expiry demonstrable without waiting or contriving a detour.
- *Files:* `lib/db/seed.ts`.
- *Dependencies:* commit 3.
- *Outcome:* two policy versions; one pending, one pre-expired, one historical approval.

**5. `feat: seed failure scenarios across all outcome classes`**
- *Purpose:* every failure class the architecture defines appears at least once.
- *Files:* `lib/db/seed.ts`.
- *Dependencies:* commit 4.
- *Outcome:* a network decline, an explicit denial, and a missing-evidence escalation all present.

**6. `fix: harden tick error surfaces and halted states`**
- *Purpose:* a visible halt reads as competence; a blank screen reads as a crash.
- *Files:* tick runner, error components.
- *Dependencies:* commit 5.
- *Outcome:* every failure in the specification's table renders its specified message.

**7. `feat: add kill switch confirmation and global halted chrome`**
- *Purpose:* make the halted state unmistakable on every page.
- *Files:* layout, kill switch components.
- *Dependencies:* M3 kill switch.
- *Outcome:* typed confirmation, and a global banner while halted.

**8. `chore: record passkey ceremony fallback and demo runbook`**
- *Purpose:* the highest-variance moment needs a rehearsed escape.
- *Files:* `docs/runbook.md`, fallback recording.
- *Dependencies:* M3.
- *Outcome:* a runbook and a fallback video verified playable on the presentation machine.

**9. `docs: document seeded data disclosure and prior work boundary`**
- *Purpose:* judges reward disclosure and punish surprise.
- *Files:* `README.md`, `docs/disclosure.md`.
- *Dependencies:* none.
- *Outcome:* what is seeded, what is real, and which work preceded the event, stated plainly.

**10. `fix: rehearsal fixes from full run-throughs`**
- *Purpose:* fix only what actually broke.
- *Files:* as discovered.
- *Dependencies:* commits 1–9.
- *Outcome:* three clean runs from an empty database.

**11. `chore: final deployment and demo readiness verification`**
- *Purpose:* the last commit.
- *Files:* deployment config, README.
- *Dependencies:* commit 10.
- *Outcome:* deployed, verified, frozen.

## Parallel Work

| Task | Owner | Independent |
|---|---|---|
| Attack console and reseed (1–2) | WS-D | Yes |
| Seed expansion (3–5) | WS-A | Yes |
| Error hardening (6–7) | WS-B | Yes |
| Runbook, fallback, disclosure (8–9) | WS-C | Fully independent |
| Rehearsal (10) | Whole team | Sequential, everyone |

**Merge risk:** commits 3–5 all touch `lib/db/seed.ts` — one owner, sequential. Commit 10 touches whatever broke and must be coordinated live rather than in parallel.

## Implementation Order Rationale

The attack console precedes the full seed because it needs only one vendor to work, and building it early leaves time to discover that a demo surface needs a tick behavior nobody anticipated. The seed then targets a system whose demo surfaces already exist.

Error hardening follows the seed rather than preceding it, because the seed is what actually exercises the failure paths — hardening before there is data to break is guesswork.

The runbook and fallback recording are scheduled as real work with their own commit rather than left as an implicit task. Undocumented recovery steps are the ones nobody performs correctly under pressure.

## Validation Checklist

- [ ] Every demo moment is reachable by clicking, with nobody touching a terminal
- [ ] The attack console runs the identical code path as the cron
- [ ] An injected message causes a genuine proposal that the engine refuses
- [ ] The over-cap charge is declined by Prava with the engine bypass announced
- [ ] Reseed restores a clean state in seconds
- [ ] Every failure class appears in the seed
- [ ] The fallback video plays on the presentation machine
- [ ] Disclosure of seeded data and prior work is written
- [ ] Two consecutive clean runs from an empty database
- [ ] One run driven by someone who did not build it

## Checkpoint

**What should already work:** everything.

**What can be demonstrated:** the complete demo, including both attack beats.

**What should be tested:** the full run, three times, from empty.

**What should be deployed:** the final build.

**What must never break:** all seven invariants. **No new work after Day 6 midday.** A feature added in the final hours has never been rehearsed, which makes it the most likely thing to fail in front of judges.

---

# Critical Path Summary

```
Prava spike ──▶ Contracts ──▶ Schema ──▶ Clock
                                            │
                                            ▼
                                    Policy Engine
                                            │
                                            ▼
                            Ledger ──▶ Evidence ──▶ Mock Adapter
                                            │
                                            ▼
                            Stub Agent ──▶ Outcome Router ──▶ Tick Runner
                                            │
                              ┌─────────────┴─────────────┐
                              ▼                           ▼
                        Real Agent                  Real Adapter
                         (M2)                          (M3)
                              │                           │
                              └─────────────┬─────────────┘
                                            ▼
                                    Pages ──▶ Seed ──▶ Rehearsal
```

**The two blocking items:** the Prava spike, which can invalidate the narrative, and the type contracts, which block all parallel work. Both resolve on Day 1.

**The two uncertain dependencies** — the model and Prava — are each introduced last, behind interfaces frozen first, one milestone apart. Each swap is contained to one module and each has a working fallback retained in the repository.

**The milestone that matters most is M1.** It is unglamorous and it is the point at which the project stops being at risk.

---

# Overall Repository Evolution

| After | Repository holds | Demonstrable |
|---|---|---|
| **M0** | Shell, schema, contracts, fixtures, clock, seed skeleton, deployment | A deployed page reading seeded vendors |
| **M1** | Engine, evidence, ledger, outcome, mock adapter, stub agent, tick | A tick producing ledger entries with full attribution — the architecture, proven, offline |
| **M2** | Real agent, policy compiler, explainer, email drafter | English becoming enforceable rules; a proposal becoming a refusal citing that sentence |
| **M3** | Real adapter, mandates, both approval paths, kill switch, seven pages | The full demo minus the attack, including the Prava dashboard cross-check |
| **M4** | Attack console, full seed, hardened errors, runbook, disclosure | The complete demo, rehearsed |

**Final structure** — eleven modules under `lib/`, seven routes under `app/`, one `prisma/`, one `docs/`. No `services/`, no shared `types/`, no `utils/`, no dependency injection, no event bus.

---

# Expected Total Commit Count

| Phase | Commits |
|---|---|
| M0 — Foundation | 12 |
| M1 — Deterministic Core | 13 |
| M2 — AI & Policy | 11 |
| M3 — Payments & Product | 12 |
| M4 — Demo, Polish & Launch | 11 |
| **Total** | **59** |

Roughly ten commits per engineer-day across four engineers and six days. The count is a consequence of clean boundaries, not a target — a commit that would need to be artificially split to reach it should not be, and two unrelated changes should not be combined to stay under it.

---

# Final Readiness Checklist

## Architecture

- [ ] `lib/policy/engine` imports nothing outside its own directory
- [ ] `lib/agent` has no import path to `lib/prava`, `lib/ledger`, or `lib/policy/engine`
- [ ] Exactly one module can move money, with exactly one caller
- [ ] The ledger exposes no update or delete path
- [ ] No component reads wall-clock time
- [ ] Every unmatched, missing, or malformed case resolves to `REQUIRE_APPROVAL` or `DENY`

## Behavior

- [ ] Two ticks produce one ledger entry per renewal
- [ ] Every entry carries four attribution fields and one cited rule id
- [ ] Every executed entry carries Prava identifiers that resolve in Prava's dashboard
- [ ] Over-cap charges are declined and never retried
- [ ] In-app approval cannot raise a ceiling; ceiling raises always require a passkey
- [ ] Expired approvals cannot be acted on
- [ ] The kill switch pauses every mandate and halts the next tick
- [ ] Every failure path ends in "nothing was charged" and a visible ledger entry

## Demo

- [ ] All ten specified demo moments reachable by clicking
- [ ] The attack console runs the same code path as the cron
- [ ] An injected message produces a genuine proposal that the engine refuses
- [ ] The engine bypass in the second attack beat is announced, not hidden
- [ ] The precise enforcement claim is used: the amount ceiling is enforced in the tokenized credential; merchant, frequency and duration by Prava; the policy engine is the first gate — three layers, none of them the language model
- [ ] Reseed restores a clean state in seconds
- [ ] The passkey fallback video plays on the presentation machine
- [ ] Two consecutive clean runs from an empty database
- [ ] One run driven by someone who did not build it

## Disclosure

- [ ] Seeded data is labeled as seeded, in the product and in the pitch
- [ ] Work completed before the event is disclosed in the README
- [ ] The sandbox banner is present and undismissable on every page

## Fallbacks retained

- [ ] The stub agent exists and works
- [ ] The mock adapter exists and works
- [ ] The paused-mandate decline is available as a climax if the over-cap decline fails
- [ ] The passkey ceremony recording is verified playable

---

## Three rules that hold this together

1. **The stub agent and the mock adapter stay in the repository until the demo is over.** They are the fallback and they cost nothing to keep.
2. **Nothing new is built after Day 6 midday.**
3. **Every milestone deploys.** There is never a first deployment under pressure.
