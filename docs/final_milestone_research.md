# Final Milestone Research — Where the Last Engineering Effort Goes

**Status:** Decision document. Research across Prava, Visa Intelligent Commerce,
OpenAI, and Localhost, concluding in one chosen milestone.

**Method:** re-derived the product thesis from the repository, verified Prava's
documented capability surface against docs.prava.space, verified Visa
Intelligent Commerce's public pillars, and evaluated every opportunity against
one test: *does it deepen the architecture, or does it decorate it?*

---

## Phase 1 — The product, rediscovered

Seen cold, this is not an AI spending product. It is a **separation-of-powers
machine** that happens to spend money.

**The actual thesis.** Delegating money to an autonomous agent is safe exactly
when the agent's intelligence is irrelevant to its authority. Everything in the
repository is a restatement of that sentence:

- The LLM proposes and can do nothing else — enforced by the module graph and
  checked transitively by a build-failing test, not by a prompt.
- Authority is adjudicated by a pure function with no I/O, no clock, no model.
- Authority *originates* outside the application entirely: a Prava mandate,
  passkey-signed, with the amount ceiling enforced in the tokenized credential
  at the card network.
- Accountability is an append-only, Ed25519-signed, hash-linked ledger whose
  claims survive the death of the application — an offline verifier that needs
  no database, no network, and no trust in the authors.

**The assumptions it makes.**

1. The model *will* be manipulated. The design does not try to prevent this; it
   makes it not matter. (The runbook even documents that the real model refuses
   the bait and only the stub takes it — the system is *more* honest than its
   demo needs.)
2. The application code *may* be compromised. The engine-bypass beat exists to
   demonstrate the layer that survives that.
3. Unknown is never permission. Every gap in evidence terminates at a human.
4. Authority must be traceable to sentences a human wrote and confirmed.

**Category.** It does not belong to "AI shopping" or "spend management." Those
categories compete on *detection* (what to buy, what to cut). This product
deliberately amputated detection — §17 of the design spec cuts changepoint
detection, benchmarking, dashboards, charts — and competes only on
**enforcement**. The honest category name is **authority infrastructure for
autonomous agents**: the layer between agent frameworks (which produce intent)
and payment rails (which move money), whose job is to make delegation
bounded, auditable, and revocable.

**What it challenges.** The dominant pattern in agentic commerce is *the
permissioned tool call*: give the model a payment tool, wrap it in guardrail
prompts and allow-lists, hope. This product's founding claim is that a guard in
the model's context is a guard the model can be talked past — "a prompt is not
a control." Every AI-shopping project at this hackathon will be an instance of
the pattern this product argues against. That opposition *is* the positioning.

**What is genuinely different.** Three things no chat-wrapper has: the
four-actor attribution chain (decided / authorized / executed / recorded, no
component holding two), the fact that its central safety property is a
*build failure* rather than a behavior, and receipts that let someone who
distrusts the authors verify the history anyway.

---

## Phase 2 — OpenAI

The question is not "which API." It is: what would make an OpenAI engineer say
*this team understands where AI systems are going*?

The honest answer: OpenAI's own trajectory (Agents SDK, MCP, Computer Use,
tool calling) is toward giving models *more* actuation, and the field's open
problem is that nobody can bound what an actuated model does. A team that
demonstrates a **structural** answer to that problem — and can articulate why
it deliberately rejected the tool-calling pattern — is more interesting to
OpenAI than a team that used the Agents SDK correctly.

### Evaluated against the architecture

**Agents SDK / MCP tool-calling — REJECT, loudly and on purpose.**
Prava ships an MCP integration; OpenAI ships an agent framework. Adopting
either would put orchestration and payment tools inside the model's context,
dissolving the module-graph guarantee — the exact bypass the product argues
against. This rejection should be *articulated in the demo and README* as a
considered decision, because it is the single strongest "we know where this is
going" signal available. It costs zero engineering.

**Structured Outputs — already load-bearing.** The compiler and proposer both
run strict schemas at temperature 0; a malformed response becomes
`MALFORMED_PROPOSAL`, never a re-prompt. Nothing to add; worth one sentence on
stage.

**Reasoning models — adopt, but inverted.** The architecturally interesting
place for a frontier reasoning model is not the proposer — the proposer is
deliberately confined to judgment-under-ambiguity and gains nothing from more
IQ. The interesting place is **the adversary**. Spend the intelligence budget
on the attacker: a reasoning model whose goal is to move money without
authority, given the same surfaces a real attacker has (inbound vendor
messages, proposal content). This *strengthens* a guarantee — "the defense is
invariant to attacker capability" — instead of adding trust. It enables a demo
no prompt-engineered product can give: *the attacker is smarter than the
defender, and it does not matter.*

**Evals — adopt as architecture, not tooling.** The system's central claim is
currently proven existentially: one rehearsed injection, one rehearsed bypass.
Evals culture says: a safety property you have not measured is a safety
property you do not have. Running an attack *corpus* through the identical
pipeline and recording every outcome in the signed ledger converts the claim
from anecdote to measurement. This is the highest-leverage OpenAI-shaped idea
in the entire analysis (developed fully in Phase 6/8).

**Computer Use — reject.** Driving checkouts by screen adds an unauditable
actuation surface; it maximizes unnecessary trust. **Realtime / voice —
reject.** A voice approval is a worse-attributed approval. **Deep Research —
reject.** Grounding vendor evidence in web research reintroduces the
detection category and an unverifiable input. Each rejection increases
coherence; none costs anything.

---

## Phase 3 — Prava + Visa

Grounded against Prava's live docs: the four enforcement layers are owner-level
controls in the Prava dashboard (checkout quota, concurrency limit,
per-purchase approval, **agent revocation**), mandate-level amount enforcement
in the tokenized credential at the card network, merchant/frequency/duration
enforcement in Prava's layer, and WebAuthn passkeys at the device. Visa
Intelligent Commerce's pillars are agent-bound tokenization, FIDO/passkey
authentication, controls that verify **authorizations match the user's
original instruction**, and commerce signals retained for dispute resolution.

What would make Prava's founders and Visa's agentic-commerce team say *"we
hadn't considered that"*?

**1. Prava as an authority registry, not a payment processor.** Every other
team will use Prava to *move money*. This product uses Prava as the **external
root of trust that an application-layer proof chain anchors to** — mandate ids
and charge ids are cross-checkable in Prava's own dashboard, and receipts cite
them. The reframe worth saying out loud: the mandate is not a payment method,
it is a *signed grant of bounded authority*, and the product is what a serious
consumer of that grant looks like.

**2. Receipts are the application-layer twin of Visa's instruction-matching.**
Visa's controls validate that what VisaNet authorized matches the user's
original instruction, and retain signals to resolve disputes. Portable
Authority Receipts do the identical thing one layer up: they bind each
movement of money to the policy sentence that permitted it, cryptographically,
verifiably by a third party. Framing the receipt chain as *"commerce signals
for the policy layer — the dispute evidence Visa's model implies but no
application produces"* places the product inside Visa's own conceptual
architecture. This is narrative, not code, and it is worth minutes of judging.

**3. The kill switch should reach Prava's layer, not only the app's.** Today
the kill switch pauses mandates and sets a halt flag — app-initiated. Prava's
owner-level **agent revocation** is the externally-held version of the same
leash. Demonstrating that the human can sever the agent *from the Prava
dashboard, outside the application entirely* — and that the next tick halts
against a wall it does not control — completes the symmetry: authority is
granted outside the app, and it is revoked outside the app.

**4. The completeness gap.** The ledger currently proves *authenticity*
(nothing recorded was altered) but not *completeness* (nothing moved
unrecorded). Prava's mandate charge history is the independent second book.
Reconciling the two — every Prava-side charge must have a ledger entry, every
executed entry must have a Prava-side charge — turns single-entry attestation
into **two-sided accounting across a trust boundary**. This is the one genuine
logical gap in the audit story, and payments people will find it.

What *not* to do: sub-delegation chains, multi-mandate portfolios, session
choreography across merchants. All are real Prava surface area and all add
components without deepening the one thesis.

---

## Phase 4 — Localhost

What separates "the seed of a category-defining company" from "an excellent
hackathon demo"? Studying companies that made the jump, three properties recur:

1. **A named primitive.** Stripe had the seven-line charge; Plaid had the
   Link token. Category-defining products ship an *object* others can adopt,
   not a feature list. This repository already contains its primitive —
   the **Portable Authority Receipt** — but treats it as a feature of the
   ledger page rather than as the product's boundary object.
2. **A measurable claim.** "Our agent cannot exceed its authority" is a
   slogan until it has a number attached. Category creators define the metric
   the category is judged by (uptime, deliverability, conversion). Nothing in
   the repo yet produces the number.
3. **A wedge with an obvious second act.** SaaS renewals are the wedge; the
   architecture (policy → mandate → proposal → adjudication → receipt) is
   visibly indifferent to *what* is being bought. The narrative should say:
   renewals are where delegated spend is boring enough to trust first.

What the repository already has that most hackathon projects never will: a
frozen written architecture with recorded amendments, disclosure documentation
written before anyone asked, invariants enforced by failing builds, and a
measured runbook. That *is* founder signal — judges recognize operational
seriousness faster than they recognize features.

What is missing is precisely #2: the product asserts its safety property;
nothing measures it. A startup whose pitch is "trust is structural" must be
the first to attack itself, publicly, continuously, and publish signed
results. That instinct — *we measure the thing we claim* — is what makes
Localhost reviewers see a company rather than a demo.

---

## Phase 5 — Prava Production Access

Assume production access is granted before judging. What changes
architecturally, not operationally?

**Guarantees that strengthen.** The entire external-enforcement layer stops
being conditional. In sandbox, "the card network declines the over-cap charge"
carries an implicit asterisk. In production, the decline in beat two of the
attack sequence is a real Visa-rails decline of a real tokenized credential.
The strongest sentence in the demo — *"the ceiling lives outside our code"* —
becomes literally, checkably true.

**Demonstrations that become impossible to fake.** The Prava-dashboard
cross-check (design spec §8 calls it "the single strongest credibility moment
available") currently cross-checks a sandbox. In production it cross-checks a
system of record with real money behind it. Receipts gain the same property
transitively: an offline-verified receipt citing a production charge id is
evidence *two independent systems* corroborate.

**Limitations that disappear.** The runbook's contingency planning — mock
adapter fallbacks, "know which version of beats 4 and 5b you are giving" —
collapses. The sandbox's 30-transaction/day cap stops constraining anything
that actually reaches the adapter (note: most adversarial outcomes never reach
it — the engine refuses them with zero Prava calls — so even large attack
volumes are compatible with either environment).

**Experiments that become possible.** Exactly one new experiment matters:
**a real card, a real ceiling, and a hostile model, in the same room.** No
sandbox run can produce the sentence "there is real money behind this mandate
and the attacker still couldn't reach it."

**Does it justify changing the roadmap?** Partially. Production access is an
*amplifier*, not a milestone — it makes whatever is demonstrated unfakeable
but demonstrates nothing by itself. The correct posture: request access early
(the review requires a working sandbox flow, which exists today), migrate only
the headline beats, rehearse everything in sandbox, and treat production as
the finale's stage rather than the development environment. It raises the
stakes of the chosen milestone below; it does not compete with it.

---

## Phase 6 — Top 10 architectural opportunities

**1. The Standing Adversary — adversarial evaluation as a subsystem.**
An attack corpus plus a frontier reasoning model as red-team, run through the
*identical* pipeline (attack console surfaces: inbound messages, hostile
proposals), every outcome landing in the signed ledger; the result exported as
a signed, offline-verifiable adversarial record. *Thesis strengthened:* "the
agent cannot exceed authority even when manipulated" becomes measured over N
attacks, not asserted over one. *Sponsors:* OpenAI (evals culture, reasoning
model as attacker), Prava/Visa (every escaping attack dies at their layer, on
the record), Localhost (the metric that defines the category). *Depth:* fuses
the two most-built subsystems (attack console, receipts) into a new
capability; adds no trust — the adversary holds no authority. *Day-1 feel:* a
system claiming structural safety should have been attacking itself since the
first commit; the attack console was always this feature's larva. *Effort:*
moderate — corpus + loop + report over existing paths. *Risk:* low; every
path already exists. *Demo:* "overnight, a smarter model than ours ran the
attack; here is the signed record: N attempts, zero unauthorized charges —
verify it offline." *Judging:* directly answers the inevitable question
"you showed one attack — what about others?"

**2. Counterfactual authority preview — see authority act before signing it.**
Before a compiled policy is confirmed, replay the pure engine over a battery
of simulated proposals (the seeded history plus synthetic edge cases) and
render, in the confirmation modal: under these rules, the agent *would have*
auto-executed these, escalated these, denied these. *Thesis:* guards the
moment authority is created — the compiler is the spec's own "most dangerous
component," and today the human confirms rules they have never seen act.
*Sponsors:* Visa (instruction-matching begins with an unambiguous
instruction), Localhost (informed consent as product philosophy). *Depth:*
possible *only because* the engine is pure — the preview is free replay; the
feature is the determinism made visible. *Day-1:* "never sign authority you
haven't watched exercise itself" sounds like it was always an invariant.
*Effort:* low. *Risk:* minimal. *Demo:* quiet but profound — judges watch the
policy's consequences before the passkey ceremony. *Judging:* deepens the
compile beat that is already the differentiator.

**3. Two-sided reconciliation — the completeness proof.**
A reconciliation pass reading Prava's mandate charge history and proving
bidirectional containment: every network-side charge has a ledger entry;
every executed entry has a network-side charge. Surfaced as a standing
"books balance" attestation, and as a new attack-console beat: make an
off-ledger charge via the bypass, watch reconciliation catch it. *Thesis:*
closes the one logical gap — append-only proves nothing was *altered*, not
that nothing was *omitted*. *Sponsors:* Prava (their ledger becomes the
independent second book), Visa (dual-control accounting). *Depth:* real —
audit completeness across a trust boundary. *Day-1:* double-entry is the
oldest day-1 idea in finance. *Effort:* low-moderate (one Prava read endpoint
+ comparison). *Risk:* depends on charge-history endpoint fidelity in
sandbox. *Demo:* strong second act to the existing tamper beat. *Judging:*
preempts the sharpest question a payments person can ask.

**4. Proof-carrying charges — bind the rails to the receipts.**
Today receipts cite Prava charge ids (proof → payment). Close the loop by
reporting the receipt hash back through the charge-reporting call, so an
auditor can start from the payment rail and find the proof (payment → proof).
*Thesis:* every dollar points to a proof and every proof points to a dollar.
*Sponsors:* Visa (this is commerce signals, implemented), Prava (novel use of
charge reporting). *Depth:* high conceptually. *Day-1:* yes. *Effort:* small
*if* the reporting call carries metadata — **unverified**; if it does not,
the feature has no home. *Risk:* the highest in the list for its size.
*Demo:* subtle; needs narration to land. *Judging:* strong with technical
judges, invisible to others.

**5. Production migration of the headline beats.**
Real mandate, real tokenized credential, real Visa decline in beat two; the
dashboard cross-check against real money. *Thesis:* removes the sandbox
asterisk from the external-enforcement claim. *Sponsors:* Prava and Visa
maximally. *Depth:* none added — existing guarantees become unfakeable.
*Day-1:* n/a — it is a stage, not a structure. *Effort:* low engineering,
nonzero process (approval review). *Risk:* external approval timing; real
money discipline. *Demo/judging:* large multiplier on everything else. Ranked
here only because it amplifies rather than adds.

**6. Model invariance, demonstrated live.**
Formalize what the runbook already knows informally: hot-swap the proposer —
frontier model, cheaper model, the hostile stub — rerun the tick, show the
authority outcomes identical while only the `decided by` attribution changes.
*Thesis:* the guarantee is invariant to the model, shown rather than said.
*Sponsors:* OpenAI (a mature statement about where model trust belongs).
*Depth:* moderate — mostly making existing config switchable mid-demo.
*Day-1:* yes. *Effort:* low. *Risk:* low. *Demo:* crisp one-minute beat.
*Judging:* good, but a subset of what #1 proves more forcefully.

**7. Authority diffs — versioning made legible.**
When policy v2 supersedes v1, render the *delta of authority*: what became
auto-executable, what stopped being possible, which mandate parameters would
need a fresh passkey. *Thesis:* authority changes should be as auditable as
authority use. *Sponsors:* Localhost (product maturity), Visa (instruction
changes are re-authentication events). *Depth:* moderate; pure computation
over compiled rules. *Day-1:* yes. *Effort:* low-moderate. *Risk:* low.
*Demo:* strengthens the existing two-version beat. *Judging:* nice, not
decisive.

**8. Externally-held kill switch — revocation at Prava's layer.**
Demonstrate agent severance from the Prava dashboard, outside the app; the
next tick halts against `MANDATE_INACTIVE` / revoked agent — a wall the
application does not control. *Thesis:* the leash is held outside the code,
symmetric with where authority is granted. *Sponsors:* Prava (uses their
owner-level controls as designed). *Depth:* small but true. *Effort:* small.
*Risk:* dashboard capability availability. *Demo:* one strong sentence.
*Judging:* modest.

**9. The receipt specification — a named, versioned format with a polyglot
verifier.** Write PAR/1 as a short spec; the existing Node verifier plus one
second implementation in another language proves the format, not the code, is
the trust anchor. *Thesis:* portability is only real when a stranger can
implement it. *Sponsors:* Localhost (the named primitive; category play).
*Depth:* conceptual more than structural. *Effort:* low-moderate. *Risk:*
none. *Demo:* weak live; strong in the repo and README. *Judging:* founder
signal for Localhost specifically.

**10. Deterministic history replay.**
A command that re-adjudicates the entire ledger from its frozen evidence
snapshots and pinned policy versions, proving byte-identical verdicts —
determinism as an executable property of the *history*, not just a unit-tested
property of the function. *Thesis:* restates invariant 2 elegantly. *Depth:*
low — largely implied by existing purity + snapshots. *Effort:* low. *Risk:*
low. *Demo:* redundant with the verifier beat. Included for completeness;
rejected for redundancy.

---

## Phase 7 — Force ranking

**1 > 2** because #1 converts the product's *central* claim from demonstration
to measurement while #2 deepens a supporting claim; because #1 reuses the two
most invested subsystems (attack surface, signed ledger) so its cost is
mostly composition; and because #1 answers the question judges will actually
ask ("what about other attacks?") while #2 answers one they might.

**2 > 3** because #2 guards the creation of authority — the system's own spec
names the compiler its most dangerous component — at near-zero cost and using
the purity of the engine as its enabling insight, while #3, though logically
sharper, defends against an accusation (omission) the demo does not currently
provoke.

**3 > 4** because completeness is a genuine gap in the audit story while #4
enriches a story that already works; and because #3's dependency (reading
charge history) is verified Prava surface while #4's (metadata on charge
reporting) is not.

**4 > 5** because #4 adds a guarantee and #5 adds none — production is an
amplifier. (Operationally, do #5 anyway; it is process, not the milestone.)

**5 > 6** because an unfakeable stage beats a clever beat. **6 > 7** because
model invariance touches the thesis and authority diffs touch its
presentation. **7 > 8** because diffs produce a reusable surface while
external revocation is one demo sentence. **8 > 9** because a live halt beats
a document. **9 > 10** because a spec creates category surface while replay
proves something the verifier already implies.

---

## Phase 8 — The final milestone: **The Standing Adversary**

**Decision.** The last engineering milestone is the adversarial evaluation
subsystem: an attack corpus, a frontier reasoning model as the attacker, the
unmodified pipeline as the defender, and a **signed adversarial record** as
the output — exportable and verifiable offline like every other receipt.
Counterfactual preview (#2) is the designated fallback if the milestone must
shrink; production access (#5) is pursued in parallel as process, and its
finale is this milestone run against real rails.

**Why it is the highest-leverage evolution remaining.** Everything currently
built proves the guarantees *once*: one injection, one bypass, one tamper.
The architecture's entire value is that its safety is structural — and
structural properties are exactly the ones that survive quantification. No
other opportunity converts the thesis itself from anecdote to measurement;
every other candidate strengthens a supporting wall. It is also the only
candidate whose cost is mostly composition: the attack surface, the
deterministic engine, the ledger, the receipts, and the offline verifier are
all finished. The milestone is the system turned on itself.

**The architectural guarantee it adds.** Today: "no attack we showed you
succeeded." After: "no attack in a recorded, growing, adversarially-generated
corpus has ever produced an unauthorized charge — and that claim is signed,
hash-linked, and verifiable by someone who does not trust us, with the
application switched off." Safety becomes a *monotone, attested property of
the system's history* rather than a property of a rehearsal.

**The proof it enables.** A single artifact: the adversarial record — N
attempts, attack classes, per-attempt verdict and citing rule, zero
executions outside authority, Ed25519-signed over the same canonical
projection as every ledger entry. It is the product's thesis rendered as a
file a judge can carry out of the room and verify on their own laptop with
wifi off. No claim in the demo is stronger than a claim the audience can
check against the authors' will.

**Why judges will remember it.** Because of one inversion no other team will
have: *the attacker gets the bigger model.* Every agentic-commerce project
spends its intelligence budget making the agent smarter; this one spends it
making the adversary smarter, and wins anyway. "We gave a frontier reasoning
model one job — move money without authority — and here is the signed record
of it failing N times" is the most repeatable sentence available to this
product, and with production access it ends "…and there was real money behind
the mandate."

**Why it strengthens the thesis instead of extending the feature list.** It
adds no authority, no actuation, no new trust: the adversary holds the same
surfaces a real attacker holds — inbound messages and proposal content — and
the defended pipeline is byte-identical to the cron's (invariant 5 is
preserved: the gauntlet runs the same code path as the demo, which runs the
same code path as 3 a.m.). Every sponsor phase of this research converges on
it independently: it is OpenAI's evals culture applied to authority; it is
Visa's instruction-matching philosophy stress-tested at the policy layer; it
gives Prava the role of the wall that holds when everything above it is
hostile; it produces the measurable claim Localhost-grade companies define
their category with.

**Why it feels like Day-1 architecture.** The attack console was never a demo
prop — it was the first specimen of this subsystem, built before the subsystem
had a name. A product whose founding sentence is *"the agent cannot exceed
its authority even when it is wrong, manipulated, or compromised"* was always
going to have to prove the word **even**. This milestone is that proof, and
once it exists, the system carries its own adversary the way it already
carries its own verifier: the two halves of not asking to be trusted.
