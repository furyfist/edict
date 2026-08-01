# Spend Guardian — Implementation Roadmap

Execution planning only. Architecture frozen. Four people, six days, one repository.

---

## 1. Critical Path

### The one thing that blocks the narrative

**Verify that Prava's sandbox declines an over-cap mandate charge.** Hour one, before any other work. The entire demo climax and the positioning that follows from it rest on this behavior. If it does not decline as expected, the fallback climax is the paused-mandate decline — and that substitution costs nothing on day one and costs the project everything on day five.

This is a spike, not a feature. One person, one hour, throwaway script, answer recorded in the repo README.

### The one thing that blocks everyone

**Freeze the type contracts.** Five shapes: evidence bundle, proposal, verdict, policy rule, ledger entry. Plus a fixture generator that produces valid instances of each.

Until these exist, four engineers cannot work simultaneously on anything. Once they exist, four engineers can work simultaneously on nearly everything. This is the single highest-leverage two hours in the project, and it must be done by one person alone — a contract designed by committee on day one is a contract renegotiated on day four.

### The critical path, minimal form

```
Contracts + fixtures
        │
        ├──▶ Database + seed skeleton ──▶ Demo clock
        │              │
        │              ▼
        └──▶ Policy Engine (pure, tested)
                       │
                       ▼
            Ledger Writer ──▶ Mock Adapter ──▶ Tick Runner
                                                    │
                                                    ▼
                                          Stub Agent → Real Agent
                                                    │
                                                    ▼
                                          Mock Adapter → Real Adapter
```

Everything else — UI, compiler, explainer, email drafter, approvals, kill switch, attack console — hangs off this spine and does not block it.

### What is *not* on the critical path, despite feeling urgent

The policy compiler. The UI. The real Prava adapter. All three feel like the project and none of them block the pipeline. Building the pipeline first with a stub agent and a mock adapter means the system is provably correct before either uncertain dependency is introduced.

---

## 2. Milestones

### M0 — Foundations

**Goal:** four people can commit without blocking each other.

**Deliverables:** repository, Next.js app running, Postgres provisioned and connected, Prisma schema for all entities, seed skeleton with three vendors, the five type contracts, fixture generator, deployed URL, sandbox banner in the layout shell, Prava sandbox decline spike answered.

**Dependencies:** none.

**Definition of Done:** a deployed URL renders a page reading from the database, `seed` runs from empty and is reproducible, and every workstream owner can import the contracts and generate a fixture.

---

### M1 — The claim is provable

**Goal:** the policy engine is correct and demonstrated by tests, with no UI and no LLM in sight.

**Deliverables:** the pure evaluator implementing two-pass evaluation, terminal default, precedence, and every edge case in §5 of the spec. Unit tests covering all thirteen edge cases plus the ordering property that denials beat position. The demo clock module.

**Dependencies:** M0 contracts.

**Definition of Done:** the full edge-case table passes, the engine module imports nothing outside its own directory, and a test proves that a `DENY` rule at ordinal 9 defeats an `ALLOW_AUTO` at ordinal 1.

---

### M2 — The pipeline closes

**Goal:** a tick runs end to end and writes a ledger entry, deterministically, with no LLM and no network.

**Deliverables:** evidence builder, stub agent producing fixed proposals from a lookup table, outcome router, mock Prava adapter, ledger writer with capture-before-charge ordering, tick endpoint, single-flight lock, idempotency, halting conditions.

**Dependencies:** M1.

**Definition of Done:** hitting the tick endpoint twice produces exactly one ledger entry per renewal; the entry contains all four attribution fields; killing the mock adapter mid-charge still produces a recorded outcome.

**This is the most important milestone in the project.** After M2 the architecture is proven and everything remaining is substitution and surface.

---

### M3 — Intelligence enters

**Goal:** the real LLM proposes, and English compiles to rules.

**Deliverables:** real agent replacing the stub behind the identical contract, output-contract validation with adversarial cases, policy compiler, compiler validations, confirmation gate producing an inert draft, explainer templates.

**Dependencies:** M2.

**Definition of Done:** the stub-to-real swap requires no change outside `lib/agent/`; a deliberately malformed model response produces `MALFORMED_PROPOSAL` and an escalation rather than a crash; a policy with an uncompilable clause is rejected naming that clause.

---

### M4 — Money moves

**Goal:** real Prava, real charges, real identifiers.

**Deliverables:** real adapter replacing the mock behind the identical interface, mandate setup through the passkey ceremony, mandate charge, pause/resume/cancel, mandate mirror refresh, approvals with both types, kill switch.

**Dependencies:** M3, and the M0 spike answer.

**Definition of Done:** a ledger entry carries a Prava mandate id and charge id that resolve in Prava's own dashboard; an over-cap charge is declined and recorded as `NETWORK_DECLINE`; the kill switch pauses every mandate and halts the next tick.

---

### M5 — The product is legible

**Goal:** all seven pages, all modals, full seed.

**Deliverables:** ledger, refusals, policy, authority, vendors, approvals, attack console; five modals; persistent chrome; the complete eight-vendor dataset with two policy versions, three approvals, three failures.

**Dependencies:** M2 for real data shapes; M4 for identifiers.

**Definition of Done:** every demo moment in §14 is reachable by clicking, with nobody touching a terminal.

---

### M6 — Rehearsed

**Goal:** the demo survives contact with a room.

**Deliverables:** three full run-throughs from a fresh seed, fallback recording of the passkey ceremony, reseed button verified, a judge-hostile pass where someone tries to break it.

**Dependencies:** M5.

**Definition of Done:** two consecutive clean runs from empty database, and one run where a person who did not build it drives.

---

## 3. Workstreams

Four streams, four owners, near-disjoint file ownership.

### WS-A — Core Pipeline *(most experienced engineer)*

**Scope:** contracts, Prisma schema, evidence builder, policy engine, outcome router, tick runner, ledger writer, demo clock, single-flight lock, idempotency.

**Owns:** `lib/policy/engine`, `lib/evidence`, `lib/outcome`, `lib/ledger`, `lib/clock`, `lib/db`, `prisma/`.

**Dependencies:** none after M0. This stream is deliberately unblocked because it is the spine.

**Integration point:** publishes the contracts at M0 and the tick endpoint at M2. Consumes the adapter interface from WS-B and the agent interface from WS-C — both stubbed by WS-A itself until real versions land.

**Outputs:** a working, deterministic, tested pipeline that other streams plug into rather than wait for.

---

### WS-B — Payments & Authority

**Scope:** the Prava sandbox spike, mock adapter, real adapter, mandate lifecycle, mandate mirror, approvals (both types), passkey handoff, kill switch.

**Owns:** `lib/prava`, `app/api/approvals`, `app/api/kill`.

**Dependencies:** the adapter interface from WS-A at M0. Nothing else.

**Integration point:** the mock adapter ships at M2 and is swapped for the real one at M4 behind an unchanged interface. **The interface is written before either implementation.**

**Outputs:** the only module that moves money, and the answer to whether the climax works.

---

### WS-C — Agent & Policy Compiler

**Scope:** agent prompt and output-contract validation, policy compiler, compiler validations, explainer templates, email drafter.

**Owns:** `lib/agent`, `lib/policy/compiler`, `lib/explain`, `lib/email`, `app/api/policy`.

**Dependencies:** contracts from WS-A at M0.

**Integration point:** the stub agent WS-A wrote at M2 is replaced at M3 behind an unchanged function signature.

**Outputs:** the two LLM surfaces, both of which are advisory and neither of which can act.

---

### WS-D — Interface & Demo

**Scope:** all seven pages, five modals, persistent chrome, the complete seed dataset, attack console, demo clock controls, reseed.

**Owns:** everything under `app/` except the API routes claimed above, plus `lib/db/seed`.

**Dependencies:** contracts and fixtures at M0 — **this stream builds against fixtures, not against a working backend.** That is what lets it start on day one.

**Integration point:** swaps fixtures for live queries at M5, page by page.

**Outputs:** every demo moment made clickable.

---

## 4. Build Order

Exact sequence, with the risk each position eliminates.

| # | Component | Why here |
|---|---|---|
| 1 | **Prava decline spike** | Answers the only question that can invalidate the narrative, while it is still free to change course |
| 2 | **Type contracts + fixtures** | Converts a four-person serial project into a four-person parallel one |
| 3 | **Prisma schema + database + deploy** | Deploying on day one means deployment is never a day-six discovery. Schema first because everything else stores something |
| 4 | **Demo clock** | Every subsequent component must read it. Building it late means retrofitting time into finished code |
| 5 | **Policy Engine** | Pure, dependency-free, and the product's central claim. It can be built and proven correct while nothing else exists |
| 6 | **Ledger Writer** | The pipeline's terminus. Building it before the pipeline means every later component has somewhere to land |
| 7 | **Evidence Builder** | The pipeline's origin. Now both ends exist and the middle can be filled |
| 8 | **Mock Adapter** | Establishes the money boundary with zero external dependency. The interface is now frozen for WS-B |
| 9 | **Stub Agent** | A lookup table returning fixed proposals. This is the key move: **the pipeline becomes end-to-end testable before an LLM exists** |
| 10 | **Outcome Router + Tick Runner** | Closes the loop. M2 achieved with zero non-determinism in the system |
| 11 | **Real Agent** | Swapped behind the stub's signature. If it misbehaves, the stub still works and the demo still runs |
| 12 | **Explainer templates** | Needs real ledger entries to render, which now exist |
| 13 | **Policy Compiler** | The riskiest LLM surface, built once the deterministic half is proven so its failures are isolated |
| 14 | **UI pages** | Built against fixtures in parallel from day one; wired to live data here |
| 15 | **Real Prava Adapter** | Swapped behind the mock's interface. The last uncertain dependency, introduced when everything around it is stable |
| 16 | **Approvals + passkey handoff** | Requires the real adapter for ceiling raises |
| 17 | **Kill switch** | Small, and needs real mandates to pause |
| 18 | **Email drafter** | Isolated, non-blocking, cuttable |
| 19 | **Attack console** | Needs the full pipeline to attack |
| 20 | **Full seed dataset** | Built last so it targets the finished system rather than being maintained against a moving one |
| 21 | **Rehearsal** | — |

### Why this order minimizes risk

**Both uncertain dependencies are introduced last, behind interfaces frozen first.** The LLM and Prava are the two things that can behave unexpectedly. Each gets a deterministic stand-in built early, so the pipeline is proven correct before either arrives, and each swap is contained to one module.

**Determinism is established before non-determinism is added.** At step 10 the entire system is deterministic and testable. Every subsequent failure has an obvious suspect.

**The product's central claim is proven at step 5**, before any surface exists. If everything after step 5 went wrong, you would still have the thing you are being judged on.

---

## 5. Integration Plan

| Subsystem | Connected at | Connected to | Note |
|---|---|---|---|
| **Database** | M0, hour 3 | Everything | First integration. Deployed immediately, not locally-only |
| **Demo clock** | M1 | Evidence builder, tick runner, UI chrome | Integrated before any consumer exists, so no component ever reads wall time |
| **Ledger** | M2 | Outcome router | Wired before the router is finished, so the router is built against a real destination |
| **Mock adapter** | M2 | Outcome router | Establishes the boundary. Real adapter inherits this exact wiring |
| **Stub agent** | M2 | Tick runner | Deterministic proposals make the first end-to-end run reproducible |
| **Policy engine** | M2 | Outcome router | Enters the pipeline already tested in isolation |
| **Tick runner** | M2 | All of the above | The moment the system exists |
| **Real agent** | M3 | Tick runner | One-line swap. Stub retained in the repo as a fallback |
| **Policy compiler** | M3 | Policy versions, confirmation modal | Isolated from the pipeline — compiler failure cannot break a tick |
| **Explainer** | M3 | Ledger read path | Read-side only; cannot affect execution |
| **UI** | M5, page by page | Live queries replacing fixtures | Ledger page first — it is the 5-second impression and the highest-traffic surface in the demo |
| **Real Prava adapter** | M4 | Outcome router, mandate mirror, approvals | Behind the mock's interface. Mock retained as a fallback |
| **Demo data** | M5 | Everything | Full seed last, against the finished system |

### Two integrations that need explicit care

**Ledger and adapter ordering.** Inputs captured before the charge, write after. This ordering is built at M2 with the mock and must not be "improved" at M4 when the real adapter lands. Money that moved must never be invisible.

**Approvals and mandate authority.** In-app approval and ceiling raise are distinct paths that both terminate in an approval record. They are wired at M4 together, never separately — building one first invites the second to be shortcut into it, which would collapse the distinction the product depends on.

---

## 6. MVP Checkpoints

Each is independently demonstrable. Each is a place the project can stop and still be shown.

**MVP 1 — The engine is correct.**
A test suite passes. No UI, no LLM, no network. *Demonstrable as:* a terminal running tests, which is genuinely enough to explain the thesis to another engineer.

**MVP 2 — A tick reaches the ledger.**
Stub agent, mock adapter, real engine, real database. One command produces a ledger entry with a full attribution chain. *Demonstrable as:* a database row that proves the whole architecture.

**MVP 3 — The agent proposes and English compiles.**
Real LLM in both surfaces. The stub is retained. *Demonstrable as:* a policy sentence becoming rules, and a proposal becoming a refusal citing that sentence.

**MVP 4 — Prava executes.**
Real charges, real identifiers, real declines, real passkey. *Demonstrable as:* the cross-check in Prava's dashboard — the strongest credibility moment in the project, available before any UI polish.

**MVP 5 — The product is clickable.**
Seven pages on live data. *Demonstrable as:* the actual demo, minus the attack.

**MVP 6 — Complete.**
Attack console, kill switch, full seed, refusal log populated. *Demonstrable as:* the demo, including the climax.

**MVP 7 — Rehearsed.**
Two clean consecutive runs from empty, driven by someone who did not build it.

**The checkpoint that matters most is MVP 2.** It is unglamorous and it is the moment the project stops being at risk.

---

## 7. Risks

| Risk | Severity | De-risk |
|---|---|---|
| **Prava sandbox does not decline over-cap as expected** | Fatal to the narrative | Spike in hour one. Record the answer in the README. Fallback climax is the paused-mandate decline, chosen on day one rather than discovered on day five |
| **Passkey ceremony fails on stage** | Fatal to a key beat | Rehearse on the exact device and network. Record a fallback video at M4, the day it first works. Place the ceremony mid-demo, never at the climax |
| **LLM returns non-conforming output during the demo** | High | Temperature 0, strict validation, escalation on malformation — designed in. Test the validator against deliberately broken outputs at M3, not at M6. The stub agent stays in the repo as a live fallback |
| **Policy compiler mis-compiles on stage** | High | Spike the prompt at M0 against five fixed policy texts, before it is scheduled. The confirmation gate means a bad compile is visible and recoverable rather than silent |
| **Prisma schema churn causes constant merge conflicts** | High, and the most likely to actually happen | Single owner: WS-A. All schema changes announced before committing. Schema frozen at M2 — after that, additive columns only |
| **Deployment discovered broken late** | High | Deploy at M0, hour four. Every milestone deploys. There is never a first deployment under pressure |
| **Wall-clock time leaks into a component** | Medium, silent, corrupts reproducibility | The clock module is built before any consumer. Code review checks for direct time access. It surfaces immediately in the year speed-run |
| **Ledger write fails after a successful charge** | Medium, credibility-destroying | Capture-before-charge ordering built at M2 with the mock, and deliberately exercised by killing the mock mid-charge |
| **Full seed built late and doesn't exercise every path** | Medium | Three vendors seeded at M0 covering allow, escalate, deny. The other five at M5. Every failure class appears in the seed by M6 |
| **UI stream blocked waiting on backend** | Medium, wastes a person for days | Fixtures at M0. WS-D never waits |
| **Four people, one repo, day-six merge chaos** | Medium | Disjoint ownership by directory, listed in §3. Integrate at milestones, not at the end |

The first two are the only ones that can end the project, and both are fully de-riskable on day one. Do them first.

---

## 8. Parallelization

### Fully parallel from M0, zero conflict

| Stream | Directories | Depends on |
|---|---|---|
| WS-A | `lib/policy/engine`, `lib/evidence`, `lib/outcome`, `lib/ledger`, `lib/clock`, `lib/db`, `prisma/` | Nothing |
| WS-B | `lib/prava`, `app/api/approvals`, `app/api/kill` | Adapter interface only |
| WS-C | `lib/agent`, `lib/policy/compiler`, `lib/explain`, `lib/email`, `app/api/policy` | Contracts only |
| WS-D | `app/**` (pages, components), `lib/db/seed` | Fixtures only |

No two streams write to the same directory. The contracts file is written once by WS-A at M0 and treated as read-only afterward.

### Must be serial

- Contracts before all four streams start. **Two hours, one person, no exceptions.**
- Prisma schema before any stream persists anything.
- Engine before outcome router.
- Ledger before outcome router.
- Tick runner after stub agent and mock adapter both exist.
- Real adapter after the M0 spike answer.
- Full seed after M4, so it targets real identifiers.

### Deliberately sequenced despite being technically parallel

The **agent swap** and the **adapter swap** happen at different milestones on purpose. Introducing both uncertain dependencies at once means a failure has two suspects. One at a time, one milestone apart.

### The contention point to watch

`app/api/` has routes owned by three different streams. Assign the exact route paths at M0 alongside the contracts so nobody creates `app/api/policy/route.ts` twice.

---

## 9. Final Build Timeline

Empty repository to demo. Six days, four people.

**A note on the disclosure boundary:** the hackathon requires that meaningful work be completed during the event and that prior work be disclosed. Sequence so that Days 1–2 produce clearly disclosable scaffolding — repository, schema, deployment, seed, UI shell — and the thesis-critical work lands inside the event window: policy compiler, engine, agent, adapter, attack console. Note the boundary in the README as you cross it rather than reconstructing it afterward.

---

### Day 1 — Unblock everything

*Morning.* Prava sandbox spike, answered and recorded. Repository, Next.js, Postgres, deployment live. Contracts and fixtures written by one person and published.

*Afternoon.* Prisma schema. Seed skeleton, three vendors. Demo clock. Policy compiler prompt spiked against five fixed policies — spiked only, not built. Sandbox banner and layout shell.

*End of day:* four people are unblocked and a deployed URL reads from the database. **M0 complete.**

---

### Day 2 — The spine

WS-A builds the policy engine and its full test suite, then the ledger writer and evidence builder. WS-B builds the mock adapter against the frozen interface. WS-C builds agent output-contract validation and the explainer templates. WS-D builds the ledger and authority pages against fixtures.

*End of day:* **M1 complete.** The engine is proven correct. Tests pass. The product's central claim is demonstrable to another engineer with nothing but a terminal.

---

### Day 3 — The loop closes

WS-A builds the stub agent, outcome router, tick runner, single-flight lock, idempotency, halting conditions. WS-B builds mandate mirror and lifecycle calls against the mock. WS-C builds the policy compiler and its validations. WS-D builds vendors, approvals, refusals, and policy pages against fixtures.

*End of day:* **M2 complete.** A tick runs end to end and writes a ledger entry, deterministically, with zero external dependencies. This is the day the project stops being at risk.

---

### Day 4 — Intelligence and money

*Morning.* WS-C swaps the real agent in behind the stub's signature; adversarial validation cases run. Policy compiler wired to the confirmation gate.

*Afternoon.* WS-B swaps the real Prava adapter in behind the mock's interface. First real charge. First real decline. Passkey ceremony performed and **recorded as the fallback the same day it first works.**

*End of day:* **M3 and M4 complete.** A ledger entry carries identifiers that resolve in Prava's own dashboard.

---

### Day 5 — Surface

All streams converge on the UI. Fixtures swapped for live queries, ledger page first. Approvals wired for both types. Kill switch. Attack console. Email drafter. Full eight-vendor seed with two policy versions, three approvals, three failures.

*End of day:* **M5 complete.** Every demo moment is reachable by clicking.

---

### Day 6 — Rehearsal and hardening

*Morning.* Three full run-throughs from an empty database. Every failure path deliberately triggered once. Reseed verified. Fallback video confirmed playable on the presentation machine.

*Afternoon.* A hostile pass — someone outside the team drives, and someone tries to break it. Fix only what breaks. **No new work after midday.**

*End of day:* **M6 complete.** Two clean consecutive runs, one of them driven by someone who did not build it.

---

## The three rules that hold this together

1. **The stub agent and the mock adapter stay in the repository until the demo is over.** They are the fallback, and they cost nothing to keep.
2. **Nothing new is built after Day 6 midday.** A feature added in the final hours has never been rehearsed, which makes it the most likely thing to fail in front of judges.
3. **Every milestone deploys.** There is no first deployment under pressure.