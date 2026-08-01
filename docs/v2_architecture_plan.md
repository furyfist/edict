# V2 Architecture Plan — From Demo to Infrastructure

**Status:** Implementation planning. Successor to `final_milestone_research.md`.
**Goal:** evolve the product from "a very good AI subscription management demo"
into "a memorable piece of infrastructure for safe agentic commerce" — by
maximizing architectural coherence, not feature count.

**Amendment — Milestone 4 dissolved.** Writing `v2_demo_script.md` against this
roadmap exposed that M4 ("One Proof, One File") had a demo delta of
approximately zero: by the end of M3 the verifier already handles every claim
type, so M4's unification was a refactor the audience cannot see. Eight commits
for repackaging is the worst ratio in the plan. Its load-bearing parts were
mis-scheduled rather than wrong and have been redistributed — cross-reference
anchoring into M2 and M3 (where each claim type is created, since anchoring
retrofitted is anchoring that can be forgotten), the trust-bundle export and
single verifier pass into one commit closing M3, and the PAR/1 spec into M5 as
documentation. The conditional proof-carrying-charges commit is dropped
outright: unverified endpoint capability, ninety seconds of narration, and
reconciliation already binds rails to ledger in both directions. **Five
milestones become four; ~44 commits become ~33.** The per-milestone sections
below are unchanged apart from this note; read M4 as redistributed and
renumber M5 to M4. Demo reasoning lives in `v2_demo_script.md`.

---

## Task 1 — Every recommendation, re-examined

The research doc ranked ten opportunities as competitors. Re-examining them as
*composable parts*, three structural facts emerge that the ranking obscured:

**Fact 1 — Three recommendations are one mechanism.** Counterfactual preview
(#2), deterministic history replay (#10), and model invariance (#6) are all
*the same operation*: replay the pure engine over a set of (evidence, proposal,
policy-version) tuples and compare verdicts. Preview replays over hypothetical
futures. History replay replays over the recorded past. Invariance replays the
same scenarios across proposer variants. One replayer, three input sources.
Building them as separate features would be the architectural mistake this
plan exists to avoid.

**Fact 2 — The Standing Adversary's headline claim depends on reconciliation.**
The research doc ranked reconciliation (#3) below the adversary (#1) as a
"nice logical gap." That was wrong. The adversarial record's central sentence
is "N attacks, zero unauthorized charges." Without a completeness proof, the
honest sentence is "zero unauthorized charges *recorded*" — and an attacker
whose whole strategy is to move money without a record defeats the claim. The
gauntlet's strongest sentence is only sound if the ledger is provably
complete. **#3 is a dependency of #1**, not a sibling.

**Fact 3 — Everything terminates in the same object.** Action receipts
(existing), the adversarial record (#1), the reconciliation attestation (#3),
and a preview-acknowledged activation record (#2) are all instances of one
thing: *a signed, canonical, offline-verifiable claim*. The receipt system
should generalize from "receipts of actions" to "receipts of claims," and the
PAR spec (#9) is simply that generalization written down.

### Classification

| # | Recommendation | Guarantee added | Proof created | Class | Disposition |
|---|---|---|---|---|---|
| 1 | Standing Adversary | Safety is measured over an attack corpus, not asserted over one rehearsal | Signed adversarial record | **A** | Milestone 3; depends on #3 |
| 3 | Two-sided reconciliation | Ledger completeness: nothing moved unrecorded | Signed reconciliation attestation | **A** | Milestone 2; promoted — #1's claim is unsound without it |
| 2 | Counterfactual preview | Authority is seen acting before it is signed | Signed activation record embedding the preview hash | **A** | Milestone 1; front half of the shared replayer |
| — | Replayer core (new, extracted from 2/6/10) | Determinism becomes an *operational* capability, not just a tested property | Enables three proofs above | **A** | Milestone 1; the shared infrastructure |
| — | Verifier generalization (extracted from 9) | "Verify offline" holds for every new claim type, or the claim breaks | One verifier, one bundle, whole case | **A** | Milestones 2–4; non-optional once new claim types exist |
| 6 | Model invariance | Authority outcomes invariant to proposer capability | Verdict matrix across models, in the record | **B** | Absorbed: a *mode* of the gauntlet run, not a feature |
| 7 | Authority diffs | Policy changes auditable as behavior, not text | Verdict-level diff between versions over the same battery | **B** | Absorbed: a *view* of the replayer (run battery under v1 and v2, diff) |
| 5 | Production migration | Removes the sandbox asterisk from the external-enforcement claim | Real Visa-rails declines; real dashboard cross-check | **B** | Milestone 5 + parallel process (access window is Aug 1–8: request now) |
| 4 | Proof-carrying charges | Rail→proof direction of the binding | Charge metadata citing entry hash | **C** | Folded into reconciliation: enumeration already binds rail↔ledger; embed the hash only if charge reporting accepts metadata (unverified) |
| 8 | Externally-held kill switch | Revocation demonstrated outside the app | A halt against a wall we don't control | **C** | One demo beat + runbook entry; no module |
| 9b | Polyglot second verifier | Format-not-code as trust anchor | Second implementation | **C** | Post-hackathon; spec ships, second impl doesn't |
| 10 | History replay (standalone) | Restates invariant 2 | Redundant with verifier beat | **D as feature** | Survives as one commit: a CLI mode of the replayer, nearly free |

Nothing here introduces new authority. That is the coherence test every item
passed: **V2 adds zero new paths to money.** Every addition is either upstream
of authority creation (preview), downstream of execution (reconciliation,
records), or quarantined from the money path by the same module-graph rule
that quarantines the agent (adversary).

---

## Task 2 — The synthesized architecture

V2 is the existing pipeline plus three planes, none of which can touch money:

```
                     ┌─────────────────────────────────────────────┐
                     │  DECISION PLANE (existing, unchanged)       │
                     │  Evidence → Agent → Engine → Router →       │
                     │  Prava Adapter → Ledger                     │
                     └──────┬──────────────────┬───────────────────┘
                            │ pure engine      │ signed entries
                            ▼                  ▼
   ┌────────────────────────────────┐   ┌──────────────────────────────────┐
   │ SIMULATION PLANE (new)         │   │ PROOF PLANE (generalized)        │
   │ Replayer: (evidence, proposal, │   │ One claim envelope, four types:  │
   │ policy, proposer?) → verdicts  │   │  · Action receipt (exists)       │
   │  · preview before activation   │   │  · Activation record   (M1)      │
   │  · behavioral diff v1 ↔ v2     │   │  · Reconciliation attn (M2)      │
   │  · history replay              │   │  · Adversarial record  (M3)      │
   │  · model matrix                │   │ All Ed25519-signed, canonical,   │
   └───────────────┬────────────────┘   │ anchored to a ledger head hash,  │
                   │ scenario batteries │ verified by ONE offline verifier │
                   ▼                    └───────────────▲──────────────────┘
   ┌────────────────────────────────┐                   │
   │ ADVERSARY PLANE (new)          │   ┌───────────────┴──────────────────┐
   │ Corpus (frozen, versioned) +   │   │ RECONCILER (new)                 │
   │ attacker LLM. Writes ONLY to   │   │ Prava charge history (via the    │
   │ attack surfaces: inbound msgs, │   │ adapter, still sole boundary)    │
   │ proposal gate. Same module-    │   │ ⟷ ledger. Both directions.      │
   │ graph quarantine as the agent. │   │ Output: signed attestation       │
   └────────────────────────────────┘   └──────────────────────────────────┘
```

**How authority flows: exactly as before.** Passkey → mandate → engine verdict
→ adapter. No new component is on this path. The preview runs *before*
authority exists; the reconciler and record aggregation run *after* money has
already moved; the adversary holds only the surfaces a real attacker holds.
The architecture test extends to assert the adversary module, like the agent
module, has no transitive path to `lib/prava`, `lib/ledger`,
`lib/policy/engine`, `lib/outcome`, or `lib/db` writes. Both models in the
system — the proposer and the attacker — are quarantined by the same rule.
That symmetry is a stage sentence.

**How evidence flows.** Unchanged for live ticks. The replayer consumes the
same frozen evidence-bundle shape from three sources: synthesized batteries
(preview), ledger snapshots (history replay), and gauntlet scenarios. One
bundle format everywhere — the decision made in the original spec (§2.1) pays
for the entire simulation plane.

**How proofs flow, end to end.** Evidence is frozen → the engine cites one
rule → the entry is signed and hash-linked (exists today). New in V2, claims
*about* sets of entries are themselves signed claims: the reconciliation
attestation says "at ledger head H, books balance against Prava"; the
adversarial record says "at ledger head H, these N tagged entries are the
complete attack history and none executed outside authority"; the activation
record says "policy v2 was activated after a human saw preview P (hash), at
ledger head H." Anchoring every aggregate claim to a ledger head hash means
the claims compose: tamper with any entry and both the chain *and* every
downstream attestation break. The verifier verifies the whole bundle — entries,
attestations, records — in one pass, offline. **One exported file carries the
complete case.**

**Merges performed.** Preview + diffs + replay + invariance → one replayer.
Proof-carrying charges → a conditional embellishment of reconciliation.
Attack console → subsumed by the gauntlet as its manual mode (the console's
existing beats — injection, bypass, tamper — become three named attack classes
in the corpus; nothing is thrown away, it is promoted).

**One contested decision, resolved.** Do gauntlet entries pollute the real
ledger? A separate adversarial ledger would be a demo-only path (violates
invariant 5) and would exempt attack history from the tamper-evidence
guarantee. Decision: same writer, same chain, same schema; runs carry a run
context (`operational` | `adversarial`); the home ledger defaults to
operational, the gauntlet page shows adversarial. One chain means an attacker
cannot hide edits between the two views.

---

## Task 3 & 4 — The roadmap

One roadmap, five milestones. Ordering logic: shared infrastructure first
(M1), the dependency before the dependent (M2 before M3), unification after
all claim types exist (M4), amplification last (M5). Production access is
requested in parallel starting *now* — the window closes Aug 8.

---

### Milestone 1 — The Simulation Plane

**Purpose:** extract determinism into an operational capability: one replayer
powering preview, behavioral diff, and history replay.
**Architectural reasoning:** the engine's purity has so far been a *tested*
property. M1 makes it a *load-bearing* one — three user-visible capabilities
exist only because the engine is a pure function. Cheapest milestone, largest
shared surface; everything later reuses it.
**Dependencies:** none. **Risk:** scenario batteries must be disclosed as
synthetic; battery design needs care to avoid seeming rigged.
**User-visible change:** the policy confirmation modal shows what the policy
*would do* before the passkey ceremony; policy versions page shows behavioral
diffs.
**Demo improvement:** the compile beat — already the differentiator — gains a
second act: watch the authority act before signing it.
**Definition of done:** compile → preview → confirm produces a signed
activation record embedding the preview hash; v1↔v2 behavioral diff renders;
`npm run replay` re-adjudicates the seeded history byte-identically; all
existing tests still green.

Commits (9):

1. **Extract the replayer: a pure map from scenario sets to verdict sets.**
   *Reasoning:* the one abstraction three features share; pure composition
   over the engine, no I/O in core. *Components:* new `lib/simulate` (core).
   *Validation:* replaying the engine's own 33 test fixtures reproduces every
   expected verdict. *Demo impact:* none yet; foundation.
2. **Build the scenario battery from seeded history plus synthetic edges.**
   *Reasoning:* preview must cover the interesting boundary cases (over-cap,
   missing evidence, denied vendor), not just the happy path; battery is
   versioned and deterministic so previews are reproducible. *Components:*
   `lib/simulate` (battery builder), `lib/fixtures`. *Validation:* battery
   contents stable across runs; every verdict class represented. *Demo:* the
   preview will visibly include refusals and escalations, not just approvals.
3. **Compute the preview at compile time, alongside validation.**
   *Reasoning:* preview belongs to the same moment as the deterministic
   validations — after the LLM returns, before the human sees the modal.
   *Components:* `app/api/policy`, `lib/simulate`. *Validation:* compile of
   the seeded v2 policy yields the expected verdict distribution. *Demo:*
   none yet.
4. **Render the preview in the confirmation modal.**
   *Reasoning:* the modal is where authority is born; the preview is the
   informed-consent document. Grouped by verdict: would auto-execute / would
   escalate / would deny, each row citing the rule that fires. *Components:*
   policy page UI. *Validation:* manual walkthrough; rule citations link to
   source fragments. *Demo:* the new beat lands here.
5. **Sign an activation record embedding the preview hash and ledger head.**
   *Reasoning:* "the human saw the preview" becomes provable, not narrated;
   first new claim type in the proof plane. *Components:* `lib/attest`,
   `lib/policy/versions`. *Validation:* record verifies against the canonical
   projection; tampered preview fails. *Demo:* activation shows *attested*.
6. **Behavioral diff: run the battery under two versions and diff verdicts.**
   *Reasoning:* policy change rendered as authority change — what became
   auto-executable, what stopped being possible; free once 1–2 exist.
   *Components:* `lib/simulate`, policy versions UI. *Validation:* seeded
   v1→v2 diff matches the documented intent of the two versions. *Demo:* the
   existing two-version beat gains its payoff.
7. **History replay as a CLI mode.**
   *Reasoning:* re-adjudicate every ledger entry from its frozen snapshot and
   pinned version; determinism becomes something a judge can run.
   *Components:* `scripts/`, `lib/simulate`. *Validation:* byte-identical
   verdicts on the seeded history. *Demo:* a one-liner for skeptics.
8. **Extend the architecture test: the simulate core imports engine and
   contracts only.** *Reasoning:* the simulation plane must inherit the
   purity it advertises; enforced, not promised. *Components:*
   `lib/architecture.test.ts`. *Validation:* the test fails when an I/O
   import is added. *Demo:* one more true sentence.
9. **Document the beat: preview, diff, replay in runbook and disclosure.**
   *Reasoning:* synthetic batteries must be volunteered, not discovered.
   *Components:* `docs/runbook.md`, `docs/disclosure.md`. *Validation:*
   rehearsal. *Demo:* timing measured and planned.

**New statement:** *Delegated authority can now be previewed — and provably
was previewed — before it exists.*

---

### Milestone 2 — The Second Book

**Purpose:** prove ledger completeness by reconciling against Prava's charge
history, both directions.
**Architectural reasoning:** append-only proves nothing was altered; it cannot
prove nothing was omitted. Prava is the independent second book. This closes
the last logical gap in the audit story — and M3's headline claim is unsound
without it.
**Dependencies:** M1's activation record established the claim-envelope
pattern this milestone's attestation reuses. Requires Prava's mandate
charge-history reads (documented capability; verify fidelity day one).
**Risk:** sandbox charge-history endpoint behavior is the unknown; the
adapter isolates it (that is what the adapter is for). Mock adapter needs a
parallel mock history so the beat works offline.
**User-visible change:** Authority page gains a "books balance" attestation
state; Attack Console gains the omission beat.
**Demo improvement:** the bypass beat gets a second act — the off-ledger
charge is *caught*.
**Definition of done:** reconciliation runs both directions, emits a signed
attestation anchored to the ledger head, the verifier accepts it, and the
omission attack demonstrably trips it.

Commits (8):

1. **Add charge-history reads to the adapter.** *Reasoning:* the reconciler
   must not become a second payment boundary; it consumes adapter reads —
   invariant 3 holds. *Components:* `lib/prava` (+ mock parity).
   *Validation:* sandbox charges appear; mock mirrors the shape. *Demo:*
   none yet.
2. **The reconciler: two-sided containment over one mandate's history.**
   *Reasoning:* direction one — every executed ledger entry has a
   network-side charge; direction two — every network-side charge has a
   ledger entry. Pure comparison over two fetched sets. *Components:* new
   `lib/reconcile`. *Validation:* balanced books on the seeded state; a
   fabricated orphan on either side is reported with identifiers. *Demo:*
   foundation for the beat.
3. **Typed discrepancy classes.** *Reasoning:* "books don't balance" must
   name the failure — orphan charge (money moved, no record), orphan entry
   (record claims money moved, rails disagree), amount mismatch. Each class
   is a different accusation with a different defense. *Components:*
   `lib/reconcile`, `lib/contracts`. *Validation:* unit tests per class.
   *Demo:* precise language for the stage.
4. **Sign the reconciliation attestation, anchored to the ledger head.**
   *Reasoning:* second claim type; "balanced at head H" composes with the
   chain — later tampering breaks both. *Components:* `lib/attest`,
   `lib/reconcile`. *Validation:* verifier round-trip; tamper breaks it.
   *Demo:* the attestation is exportable.
5. **Extend the offline verifier to attestations.** *Reasoning:* a claim
   type the standalone verifier cannot check is a claim that quietly asks
   for trust; the verifier grows with the proof plane or the whole "verify
   offline" claim decays. *Components:* `scripts/verify-receipts.mjs`,
   conformance test. *Validation:* verifier-conformance suite covers the new
   type. *Demo:* wifi-off verification now covers completeness.
6. **Surface attestation state on the Authority page.** *Reasoning:* the
   page that renders the leash should render whether the books balance; a
   stale or failing attestation is a visible warning, never silent.
   *Components:* authority UI. *Validation:* three states render — balanced,
   discrepant, stale. *Demo:* the 5-second impression gains a proof.
7. **The omission beat: bypass a charge, watch reconciliation catch it.**
   *Reasoning:* the existing engine-bypass beat proves the network ceiling;
   this reuses it to prove the completeness net — attack console fires an
   adapter-direct charge *below* cap (so it succeeds) with ledger write
   suppressed, then reconciles. *Components:* attack console. *Validation:*
   the orphan charge is reported by id within one reconciliation run.
   *Demo:* the sharpest new beat in M2 — "we stole from ourselves and the
   books caught it."
8. **Runbook and disclosure: reconciliation cadence, mock behavior, beat
   timing.** *Components:* docs. *Validation:* rehearsal. *Demo:* planned,
   measured.

**New statement:** *A third party can now verify not only that every recorded
action was authorized, but that no money moved unrecorded.*

---

### Milestone 3 — The Standing Adversary

**Purpose:** the gauntlet — an attack corpus plus an attacker LLM run through
the identical pipeline, producing a signed adversarial record.
**Architectural reasoning:** converts the central thesis from anecdote to
measurement. Built last of the three planes because it *consumes* the other
two: the replayer's scenario mechanics (M1) and the completeness proof (M2)
that makes "zero unauthorized charges" rigorous.
**Dependencies:** M1 (scenario/battery mechanics, claim envelope), M2
(completeness anchoring the headline claim).
**Risks:** attacker-LLM nondeterminism (resolved: generated attacks are
frozen into the versioned corpus before running, so every run is replayable
and the record cites the corpus version); sandbox 30-tx/day cap (acceptable:
most attack classes die at the engine with zero adapter calls; only
bypass-class attacks spend transactions — budget them); ledger pollution
(resolved in Task 2: one chain, run contexts).
**User-visible change:** the Attack Console becomes the Gauntlet — corpus
browser, run trigger, live outcome stream, record export; manual injection
remains as its manual mode.
**Demo improvement:** the climax changes from "watch one attack fail" to
"here is the signed record of every attack ever failing — and here is one
more, live."
**Definition of done:** a full gauntlet run executes unattended over the
frozen corpus, every outcome lands in the chained ledger tagged adversarial,
the signed record exports and verifies offline, and the boundary test covers
the adversary module.

Commits (11):

1. **Define the attack taxonomy and freeze corpus v1.** *Reasoning:* the
   corpus mirrors the defense layers — injection (engine re-derivation),
   over-cap (mandate/network), forbidden action & malformed proposal
   (contract), stale evidence (expiry), omission (reconciliation), tamper
   (chain). Every defense has attackers; every attacker names its defense.
   *Components:* new `lib/adversary` (corpus). *Validation:* every class
   maps to a documented defense; corpus is versioned and hashed. *Demo:* the
   taxonomy *is* a slide.
2. **The adversary module, quarantined like the agent.** *Reasoning:*
   attack delivery writes only to real attack surfaces — inbound messages
   and the proposal gate; the module-graph rule that binds the agent binds
   the adversary. *Components:* `lib/adversary`. *Validation:* next commit.
   *Demo:* symmetry sentence.
3. **Extend the transitive boundary test to the adversary.** *Reasoning:*
   both models in the system are quarantined by build failure, not by
   intention. *Components:* `lib/architecture.test.ts`. *Validation:* test
   fails on a forbidden import. *Demo:* "the attacker is jailed by the same
   wall as the agent."
4. **Run contexts in the ledger: operational vs adversarial, one chain.**
   *Reasoning:* the contested decision from Task 2 — same writer, same
   chain, tagged runs; default views filter, the chain does not.
   *Components:* `lib/ledger`, prisma schema, ledger UI filter.
   *Validation:* chain verification spans both contexts; home page stays
   clean. *Demo:* the 5-second impression is preserved.
5. **The gauntlet runner: the tick code path under an attack schedule.**
   *Reasoning:* invariant 5 extended — the gauntlet must exercise the cron's
   exact path or its results describe a different system. It plants an
   attack, runs a tick, observes, repeats. *Components:* `lib/adversary`
   (runner), `app/api`. *Validation:* a corpus-v1 run completes unattended;
   idempotency and locking hold under repeated runs. *Demo:* the overnight
   story becomes real.
6. **The attacker LLM: a reasoning model generating novel corpus entries.**
   *Reasoning:* the inversion — intelligence budget spent on the attacker;
   generated attacks are validated, frozen into corpus v2+, then run like
   any other entry, preserving replayability. *Components:* `lib/adversary`
   (generator). *Validation:* generated attacks are schema-valid and
   deduplicated; corpus hash updates. *Demo:* "the attacker is smarter than
   the defender."
7. **Model matrix mode: the same corpus across proposer variants.**
   *Reasoning:* model invariance (research #6) lands here as one axis of the
   gauntlet, not a feature — frontier model, cheap model, hostile stub;
   authority outcomes identical, only attribution differs. *Components:*
   `lib/adversary`, `lib/agent` (variant selection). *Validation:* verdict
   matrix rows are identical across proposers on corpus v1. *Demo:* the
   one-minute invariance beat.
8. **Aggregate and sign the adversarial record.** *Reasoning:* third claim
   type — corpus version, run window, per-class outcomes, zero-execution
   assertion, anchored to ledger head *and* to the latest reconciliation
   attestation: the record's headline cites the completeness proof it
   depends on. *Components:* `lib/attest`, `lib/adversary`. *Validation:*
   record verifies; breaking the reconciliation anchor breaks the record.
   *Demo:* the artifact a judge carries out of the room.
9. **Extend the offline verifier to adversarial records.** *Components:*
   `scripts/verify-receipts.mjs`, conformance test. *Validation:*
   conformance suite. *Demo:* wifi-off verification of the headline claim.
10. **The Gauntlet UI: corpus, run, live outcomes, scoreboard, export.**
    *Reasoning:* the Attack Console grows into the product's proudest page;
    manual injection remains as manual mode — nothing is deleted, it is
    promoted. *Components:* attack console → gauntlet page. *Validation:*
    live run renders outcome stream; export downloads the record. *Demo:*
    the climax surface.
11. **Runbook: the overnight gauntlet, the live finale, budgets, timings.**
    *Reasoning:* pre-run the full corpus overnight; live, run one novel
    generated attack; budget bypass-class transactions against the sandbox
    cap. *Components:* docs. *Validation:* rehearsal with measured timings.
    *Demo:* the show, planned.

**New statement:** *The system's safety is now a measured, signed, growing
property — N adversarial attempts across a frozen corpus and multiple
proposer models, zero executions outside authority, and the claim is anchored
to a completeness proof and verifiable offline.*

---

### Milestone 4 — One Proof, One File

**Purpose:** unify the four claim types into one envelope, one export, one
verifier pass — and write the format down.
**Architectural reasoning:** M1–M3 each added a claim type by extension. M4
is the consolidation that turns "several verifiable things" into "one
verifiable case." This is where the product stops being an app with receipts
and becomes infrastructure with a format.
**Dependencies:** M1–M3 (all claim types must exist before unification).
**Risks:** low; refactor plus documentation. The temptation to over-formalize
the spec is the main one — it should be short.
**User-visible change:** one-click "export trust bundle"; README and
disclosure repositioned around the format.
**Demo improvement:** the closing beat — one file, wifi off, whole case.
**Definition of done:** a single exported bundle containing entries,
activation records, reconciliation attestations, and adversarial records
verifies in one pass on a machine with networking disabled.

Commits (8):

1. **The claim envelope: one canonical structure, four types.** *Reasoning:*
   receipts, activation records, attestations, and adversarial records
   become instances of one signed envelope — shared canonical serialization,
   shared anchoring rules. *Components:* `lib/attest`. *Validation:* all
   existing conformance tests pass against the unified envelope. *Demo:*
   coherence, visible in the export.
2. **Cross-reference integrity: every aggregate claim anchors, every anchor
   is checked.** *Reasoning:* attestations cite ledger heads; records cite
   attestations; entries cite charge ids — the verifier walks the whole
   graph, so one tampered node fails everything downstream. *Components:*
   `lib/attest`, verifier. *Validation:* targeted tamper at each node type
   fails verification with a named reason. *Demo:* the tamper beat gains
   reach.
3. **The trust bundle export.** *Reasoning:* one file: chain + claims +
   public key + corpus hash. *Components:* export API, UI. *Validation:*
   bundle round-trips. *Demo:* the artifact.
4. **One verifier pass over the whole bundle.** *Reasoning:* a stranger runs
   one command and reads one verdict. *Components:*
   `scripts/verify-receipts.mjs`. *Validation:* conformance suite; wifi-off
   rehearsal on the presentation machine. *Demo:* the closing beat.
5. **Write PAR/1 — a short specification of the envelope and anchors.**
   *Reasoning:* the named primitive (Localhost's category object); short
   enough to read during judging. *Components:* `docs/par-spec.md`.
   *Validation:* the verifier is checked against the spec's own test
   vectors. *Demo:* the leave-behind.
6. **Conditional: embed the entry hash in Prava charge reporting, if the
   endpoint accepts metadata.** *Reasoning:* research #4, held to its
   verified-feasibility gate; one adapter-local change if supported,
   dropped without regret if not. *Components:* `lib/prava`. *Validation:*
   the hash round-trips through Prava's dashboard, or the commit is not
   made. *Demo:* rail→proof direction, if it lands.
7. **Reposition README and disclosure around the proof plane.**
   *Reasoning:* the repo's front door should describe infrastructure, not a
   demo — thesis, planes, format, verifier, disclosure. *Components:* docs.
   *Validation:* a cold reader reconstructs the architecture from the
   README alone. *Demo:* judges read repos.
8. **Fitness pass: full test suite, timing re-measure, runbook refresh.**
   *Components:* all docs, tests. *Validation:* green suite; measured
   ranges recorded per the repo's convention. *Demo:* rehearsal-ready.

**New statement:** *One exported file now carries the complete case — what
the agent did, what it refused, who attacked it, that the books balance, and
that a human saw the authority before granting it — verifiable by a stranger
with the application switched off.*

---

### Milestone 5 — Real Rails

**Purpose:** migrate the headline beats to Prava production; run the gauntlet
finale against real money.
**Architectural reasoning:** adds no guarantee — removes the asterisk from
all of them. Sequenced last because amplifying an unfinished system amplifies
its gaps; but the *access request* is parallel process started at M1, since
the window closes Aug 8 and review requires the working sandbox flow that
already exists.
**Dependencies:** approval by Prava (external); M1–M4 for the thing being
amplified. Every beat retains its sandbox rehearsal path — production is the
stage, sandbox is the rehearsal hall.
**Risks:** approval timing (mitigated by early request and by the fact that
nothing else depends on this milestone); real-money discipline (mitigated:
minimal ceilings, bounded gauntlet budget, and the engine refuses most
attack classes before any adapter call).
**User-visible change:** environment banner distinguishes production;
otherwise none — which is itself the point (invariant 5).
**Demo improvement:** "there is real money behind this mandate" attaches to
every beat, especially the gauntlet finale and the beat-two Visa decline.
**Definition of done:** one production mandate created by passkey ceremony;
the headline beats rehearsed on production; the fallback matrix written; the
adversarial record from a production-finale run verifies offline.

Commits (8):

1. **Environment discipline: explicit production configuration, loud
   banner.** *Reasoning:* the sandbox banner convention extends — the
   operator and the audience always know which rails are live.
   *Components:* config, chrome. *Validation:* misconfiguration halts,
   never silently degrades. *Demo:* honesty, visible.
2. **Production mandate ceremony with minimal ceilings.** *Reasoning:*
   smallest real authority that supports the beats; the ceremony itself is
   a beat. *Components:* runbook, dashboard. *Validation:* mandate active;
   dashboard cross-check works. *Demo:* real passkey, real grant.
3. **Migrate beat two: the over-cap decline on real rails.** *Reasoning:*
   the strongest sentence — "the ceiling lives outside our code" — loses
   its asterisk. *Validation:* real decline surfaced as the documented
   error class. *Demo:* the credibility peak.
4. **Reconciliation against production charge history.** *Reasoning:* the
   second book becomes a real book. *Components:* `lib/reconcile` config.
   *Validation:* balanced attestation over real charges. *Demo:* books
   balance against real rails.
5. **The production gauntlet finale: bounded budget, one live generated
   attack.** *Reasoning:* the sentence the whole plan builds to — a frontier
   attacker, a real card, a signed record of failure. *Components:*
   gauntlet config. *Validation:* budget enforcement verified before the
   run; record verifies. *Demo:* the closing sequence.
6. **The fallback matrix: every beat's sandbox twin, decided in advance.**
   *Reasoning:* the runbook convention — know which version of every beat
   you are giving before you walk in; production adds a row, not a
   dependency. *Components:* `docs/runbook.md`. *Validation:* each fallback
   rehearsed once. *Demo:* resilience.
7. **External revocation beat: sever the agent from the Prava dashboard.**
   *Reasoning:* research #8 lands here as a runbook beat — the leash held
   outside the code, shown on real rails if the dashboard supports it,
   sandbox otherwise. *Components:* runbook. *Validation:* next tick halts
   with the documented reason. *Demo:* one strong sentence.
8. **Final rehearsal pass: timings, disclosure, demo flow rewrite.**
   *Components:* docs. *Validation:* two full rehearsals inside time.
   *Demo:* the show.

**New statement:** *Every claim in the demo is now backed by real rails —
real card, real ceiling, real declines — and the signed record survives all
of it.*

---

## Task 6 — Four reviews of the roadmap

### 1. OpenAI

**Admire:** the inversion (the frontier reasoning model is the *attacker*,
and the corpus-freezing trick makes even LLM-generated attacks reproducible —
evals discipline applied to adversarial generation); the explicit, argued
rejection of tool-calling agency; structured outputs used as a validation
gate rather than a convenience; the model-matrix showing authority outcomes
invariant to model choice — a mature statement about where model trust
belongs. **Criticize:** the proposer is deliberately unambitious, and a
model-capabilities reviewer will ask whether the architecture *caps* what
agents can ever do here; the corpus starts small, and "N attacks" is only as
impressive as N and the diversity behind it. **What would convince them:**
say the cap is the point — the architecture is what lets you *raise* model
capability safely, and the gauntlet is the instrument that measures whether
you may; then let the generated corpus grow overnight, every night, and
report the growth curve, not a snapshot.

### 2. Prava + Visa

**What reads as a new use case rather than a good integration:** Prava is
used as an *authority registry and a book of record*, not a checkout — the
mandate as root of trust, the charge history as the independent second book
in a two-sided audit, the dashboard as live cross-examination. The
reconciliation attestation is a construct their docs imply but no
application produces; the omission beat ("we stole from ourselves and the
books caught it") is a demo of *their* layer doing work they rarely get
credit for. For Visa: the record chain is instruction-matching extended to
the policy layer — the user's English sentence is the "original instruction,"
and V2 produces the signed evidence chain from that sentence to the
authorization, which is their dispute-resolution story told one layer up.
The gauntlet finale casts the network ceiling as the hero of the climax.
**What they would push on:** charge-history fidelity in sandbox (M2 commit 1
verifies it day one) and whether reconciliation cadence could miss a window
(the attestation is honest about its head-and-time anchoring — staleness is
rendered, never hidden).

### 3. Localhost

**Company or project?** V2 has the three things the research doc said
category-definers ship: a named primitive (PAR/1 and the trust bundle), the
metric the category will be judged by (attacks survived, attested — a number
that grows every night), and a wedge with an obvious second act (renewals →
any delegated spend; nothing in the planes is renewal-specific). The repo's
operational discipline — frozen specs with recorded amendments, disclosure
before it's asked for, invariants as build failures — reads as founder
signal. **Still missing, honestly:** anyone on the other side of the
receipts. The format's value multiplies when a second party — a merchant, an
auditor, a platform — consumes it, and V2 ships the format with only its own
verifier as the consumer. That is the correct post-hackathon frontier
(polyglot verifier, a counterparty integration), and naming it as the known
next step is stronger than pretending it's solved.

### 4. Hackathon judges

**More memorable or more complicated?** The demo *shrinks* while the claims
grow: the attack console becomes one gauntlet surface; three replayer
features are one mechanism explained once; four claim types are one envelope
and one file. Complexity-vs-impact audit, milestone by milestone: M1 low
complexity / high impact (the preview is the best quiet beat available); M2
low / high (the omission beat is new and sharp); M3 is the highest
complexity in the plan and also the climax — the risk is *narrative*
(explaining corpus freezing on stage is a trap; show the scoreboard, not the
plumbing), and the runbook commit exists to contain exactly that; M4 low /
medium-live but high in judging Q&A (the file is the answer to "prove it");
M5 low engineering / very high stakes-per-minute. **The one flagged
trade:** M3 commit 7 (model matrix) is the most cuttable item in the plan
if the weekend compresses — invariance is implied by the gauntlet's results
across the stub and the real model even without a dedicated matrix mode.
Cut it first; cut nothing in M1/M2.

---

## Final verdict — what Version 2 becomes

**V1 is a system that cannot exceed its authority. V2 is a system that can
prove it.**

The thesis evolves one word at a time. V1: *the agent cannot exceed its
authority even when it is wrong, manipulated, or compromised.* V2 adds:
**and you do not have to take our word for any part of that sentence.** The
preview proves what authority meant before it existed. The engine proves
what it decided and why. The reconciliation proves nothing moved off the
books. The gauntlet proves the "even when manipulated" clause under
continuous, recorded, adversarial pressure. The trust bundle carries all of
it out of the room, and the verifier reads it with the wifi off.

Architecturally, V2 is one idea applied uniformly: **every claim the system
makes about itself becomes a signed, anchored, offline-verifiable object** —
and the three new planes (simulation, adversary, reconciliation) exist to
*generate* claims the ledger alone could not: claims about the future
(preview), about completeness (the second book), and about robustness (the
record). None of them can touch money. The money path is byte-identical to
V1's, which is the whole point: the guarantees grew while the attack surface
did not.

What makes it fundamentally different from every other agentic-commerce
project in the room: the others will demonstrate an agent *succeeding* at
commerce, and their trust story will be a prompt, a allow-list, and a
promise. This product's demo is an agent being attacked, bypassed, tampered
with, and defrauded by its own operators — and a folder of signed proofs
that none of it moved a dollar outside a sentence a human wrote and
confirmed. Everyone else asks the judges to trust their agent. This project
hands them the file that makes trust unnecessary.
