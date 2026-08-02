# Disclosure

Written here so it is volunteered rather than discovered.

Judges reward disclosure and punish surprise. Everything below should be said
out loud during the demo, not buried in a repository nobody opens.

---

## What is real

- **The policy engine.** Deterministic, two-pass, with 33 tests covering every
  specified edge case. Same inputs, same verdict, forever — and now checkable
  rather than merely claimed: `npm run replay` re-adjudicates every entry in the
  ledger from its frozen evidence and reproduces every verdict.
- **The policy preview.** The rows in the confirmation modal are produced by the
  real engine, not a model of it. `lib/simulate` imports `lib/policy/engine` and
  `lib/contracts` and nothing else, enforced by `lib/architecture.test.ts`.
- **The enforcement layering.** The amount ceiling is enforced in the tokenized
  card credential — a Visa decline, surfaced as `THRESHOLD_EXCEEDED`. Merchant,
  frequency and duration are enforced by Prava. Our engine is the first gate.
- **The module boundary.** `lib/agent` has no import path to `lib/prava`,
  `lib/ledger`, `lib/policy/engine`, `lib/outcome`, or `lib/db`. Checked
  transitively by `lib/architecture.test.ts` — a build failure, not a
  convention. `grep` can only prove there is no direct edge; the graph proves
  there is no path. **`lib/adversary` lives behind the same wall**, plus
  `lib/reconcile`: the attacker cannot reach the code that judges whether its
  own attacks worked.
- **The gauntlet runs the real pipeline.** Every attack goes through the same
  `runTick` the cron calls — same lock, same mandate refresh, same policy
  pinning, same idempotency check, same outcome router, same chain. Exactly two
  substitutions: who proposes, and how the tick is labelled.
- **The append-only ledger.** No update path, no delete path, anywhere.
- **Two-sided reconciliation.** Every executed entry is matched against the
  payment provider's own charge history, and every charge in that history is
  matched back against an entry. The second direction is the one that catches
  money moving with no record. Discrepancies are named with identifiers, and the
  result is signed and anchored to a ledger head.
- **The receipts.** Every entry is Ed25519-signed over a canonical projection
  and hash-linked to its predecessor. Exportable, and verifiable offline by
  anyone with `scripts/verify-receipts.mjs` and no access to us — no database,
  no network, no trust in our code.
- **Vendor names and list pricing.** Real and checkable.
- **Prava integration.** Real sandbox API, real mandates, real charge and report
  endpoints, real declines.

## What is fabricated

- **Seat counts, login history, and usage timeseries.** Invented for the demo
  and seeded deterministically. Labelled in the interface; the Vendors page
  shows unknown usage as *unknown* rather than as zero.
- **Vendor billing contacts.** Fictional `@example` addresses. No real personal
  data is stored anywhere in this system.
- **Inbound vendor messages**, including the injection payload.
- **Most of the preview.** Of the 72 scenarios in the confirmation modal,
  **eight are real** — one current renewal per vendor, at its real amount — and
  **64 are constructed**: the same eight boundary cases applied to every vendor.
  They are labelled *hypothetical* on screen and marked `synthetic` in the data,
  and the proposals inside them carry the sentence *"Not proposed by any
  model."* Say this out loud during the beat rather than letting someone find
  it.
- **The company itself.** There is no customer behind this data.

## What the gauntlet proves, and what it does not

**It proves** that twelve named attacks — one or more aimed at every defence in
the architecture — ran through the ordinary tick path, unattended, and that the
signed ledger they produced contains no charge the corpus did not sanction. The
corpus is frozen, versioned, and hashed; the record cites both. Every verdict is
computed from fields on signed entries, so anyone holding the export can
re-derive the scoreboard without trusting us.

**The attacker owns the model completely.** The gauntlet does not test whether
our proposer can be talked into a bad suggestion — the runbook already admits
the real model usually refuses the bait. It assumes the attacker simply *has*
the proposer and every token it emits. That is a deliberately harsher threat
model, and it is the only version of the claim that survives the next model
release.

**Different proposers do NOT produce identical outcomes, and we do not claim
they do.** The record carries a model matrix — the injection attacks run once
per available proposer — and the honest reading of it is:

- the proposals **differ** (the stub takes the $48,000 bait; the live model
  proposes the real $95 and ignores it)
- the outcomes therefore **differ** (one escalates at the ceiling, one is an
  ordinary renewal)
- **the bound does not differ**: in every row, nothing moved that authority had
  not granted

The V2 plan asked for "authority outcomes invariant to proposer capability".
That phrasing is false and this repository's own runbook contains the
measurement that falsifies it. What is invariant is the *bound*, not the
behaviour — and that is the stronger claim, because it does not quietly depend
on every model behaving the same way. It also survives the next model release,
which "our model is hard to fool" does not.

The matrix only varies the attacks where a proposer has any influence. On the
proposal gate the attacker replaces the proposer outright, so every variant
would emit identical output by construction; including those rows would pad the
table with tautologies.

**It does not prove the corpus is complete.** Sixteen attacks are sixteen
attacks. There is no claim here that they exhaust the space of attacks, and the
number is reported as a number rather than as a proof of safety.

**Some attacks were written by a model, and they say so.** `npm run
attacks:generate` asks a model for novel attacks; each one is validated,
rebuilt from scratch, deduplicated against what the corpus already does, and
frozen into a new corpus version before anything runs it. Generated entries
carry `generatedBy` with the model id and are prefixed `gen-`, so a reader can
always tell what we thought of from what a model thought of.

**Do not call it a frontier reasoning model.** The configured model is
`openai/gpt-oss-120b` via Groq. It is a capable open model, not a frontier
reasoning system, and the record names it rather than letting the phrase "an AI
generated these attacks" do work it has not earned. Swapping in a stronger model
is an environment variable; claiming one is not.

**The model cannot mark its own homework.** A generated attack may only predict
REFUSED or ESCALATED — never that it succeeds — and its `surface` and
`privilege` are forced rather than accepted. More importantly, a breach is
measured structurally from the signed entry (money that moved with no
authorizing rule, or above the ceiling in force), not from whether the
prediction matched. A wrong prediction is reported as **UNEXPECTED** and kept
out of the headline. That mattered immediately: on the first generated run three
of four model predictions were wrong, and scoring against them would have
reported a breach and ~$500 "moved outside authority" when nothing had gone
wrong at all.

**Two attacks in the corpus need our own credentials** — writing a charge
straight through the adapter, and rewriting a row in the database. Those are not
"the system was broken into", they are "the people running the system turned on
it", and their defence is detection after the fact rather than prevention. They
are marked `OPERATOR` and are **excluded from the unattended run and from the
headline number**, because mixing them in would overstate what the gauntlet
shows. They are demonstrated live on the Attack console with the privilege
announced.

**Attacks that could not be staged are reported, not counted.** If no mandate is
paused, the dead-mandate attack has nothing to attack; if the environment runs
out of unadjudicated billing cycles, later attacks never run. Both are reported
by name with the reason and counted as neither pass nor fail.

**The gauntlet advances the demo clock and bills vendors again.** Each attack
needs its own unadjudicated billing cycle, so the runner moves the clock forward
a month per attack and — where a monthly vendor is now due again — writes the
next renewal row, carrying over the real amount, frequency and currency. That is
the calendar moving, not evidence being invented: usage data and mandates are
never touched, and the engine reads the same tables it always reads. After a full
run the demo clock will be years ahead; **reseed before rehearsing.**

**The headline is self-limiting.** "Zero moved money outside authority" is a
claim about money, and the gauntlet can only see the ledger. The record cites the
reconciliation attestation that closes that gap, and when the attestation is
missing, stale, discrepant, or could not read the provider's book, the headline
refuses the strong wording and names the gap instead. That behaviour is tested.

## Which rails are actually live

**Sandbox.** `sk_test_*` against `sandbox.api.prava.space`. No production access
has been granted, so **no claim in this demo is backed by real money**, and none
is made.

What that costs, precisely — and it is less than it sounds:

- The over-cap decline is a **real Visa decline on real card infrastructure**,
  issued by the sandbox. The ceiling genuinely lives outside this application.
  What is not real is the money behind it.
- The passkey ceremony is real when a sandbox key is configured. What it grants
  is sandbox authority.
- Everything downstream of execution — the signed chain, the offline verifier,
  the preview, the gauntlet, the reconciliation mechanism — is unaffected by
  which rails are live. Those are the contributions, and they are real.

**The application is ready for production and refuses to guess about it.** The
environment is derived from the credential and the API host rather than declared
in a flag, because a flag and a credential can disagree and the one that moves
money is the credential. A live key pointed at the sandbox — or a test key at
production — is `MISCONFIGURED`: the banner turns red and **the tick refuses to
run** rather than failing obscurely mid-charge. Say this if asked how the jump
to production would be handled; it is a better answer than a promise.

## The second book, stated precisely

This is the newest claim in the system and the easiest one to overstate, so the
boundary is drawn here rather than in Q&A.

**On the Prava sandbox, two-sided reconciliation cannot run.** The sandbox
exposes no charge-history endpoint — five plausible paths were probed against a
live key and all are router-level 404s, while `GET /v1/mandates/{id}` returns an
application 404, proving the probe reached a real API. The evidence is recorded
in `docs/spikes/prava-charge-history.md`.

**What the system does about that is the point.** It reports **cannot be
verified**, names every mandate it could not read and why, and signs that
admission. It never reports balanced books it did not check. An unreadable book
is not an empty one.

**So the reconciliation beat runs against the mock provider**, whose book is
persisted separately and written only by the payment adapter at the moment of a
charge — never by `lib/ledger`, and never derived from it. Backfilling the
second book from our own ledger would make every reconciliation pass and prove
nothing; it is the obvious shortcut and it is not taken.

**Direction one does not need enumeration** and would work against real rails
today. Direction two — the one that matters — needs the endpoint.

**The omission control on the attack console is not a feature.** It charges
under the ceiling, where the network has no objection, and deliberately skips
the ledger write. It simulates an operator with admin access stealing from
their own system, exactly as the tamper control simulates one with database
credentials. It is labelled as such on screen.

## What is simulated rather than integrated

- **Usage signals.** A production version would read Okta / Google Workspace /
  vendor admin APIs. We seed the same shapes those integrations would produce.
- **Email.** Cancellation and downgrade emails are drafted and displayed, never
  sent. No deliverability, no spam filters, no real side effect on stage.
- **Settlement.** A renewal here is not driven through a merchant checkout; the
  mandate is the instrument and the charge outcome is reported back to Prava
  directly.

## What is deliberately absent

Listed because omissions are decisions, and each of these was made on purpose:

changepoint detection · duplicate tool detection · shadow SaaS discovery ·
peer price benchmarking · charts and analytics · numeric confidence scores ·
production authentication · multi-tenancy · RBAC · refunds and disputes ·
notifications · multi-currency · a job queue · broad test coverage beyond the
policy engine and the agent output validator.

Almost every cut is a *detection* feature. Detection is the crowded, commoditized
half of this category — Ramp already flags duplicate SaaS, Brex already tiers
escalation by risk. The engineering went into enforcement instead, which is the
half that is unfakeable.

---

## Prior work

State the boundary plainly and do not let it be discovered in Q&A.

| Item | Status |
|---|---|
| Repository | Created for this event |
| Planning documents (`docs/`) | Written for this event |
| Every module under `lib/` and `app/` | Written for this event |
| Prisma schema | Written for this event |
| Framework and libraries | Next.js, Prisma, Vitest, OpenAI SDK — off the shelf |

> **If any pre-existing code is introduced, add it to this table before it is
> committed.** An earlier draft of this project considered reusing a CUSUM /
> PELT changepoint detector from a prior project; that feature was cut, and no
> code from it exists in this repository.

---

## What a receipt does not prove

The strongest claim here is also the easiest one to overstate, so the limits are
written down rather than left to Q&A.

**A receipt proves two things.** That the record was written by the holder of
the signing key, and that it has not been altered since. The chain link adds a
third: that no entry was removed from between two others.

**It does not prove the record was true when it was written.** Nothing we sign
can establish that. If the evidence bundle was wrong, the receipt faithfully
attests a wrong record. The external cross-check for what actually happened
remains the Prava mandate and charge identifiers, verifiable in Prava's own
dashboard.

**There is no external anchor.** One Ed25519 key, held by us, no rotation and no
third-party notary. We could rewrite the entire chain and re-sign it, and a
verifier holding only our bundle could not tell. Detecting that needs an anchor
outside our control — deliberately out of scope, and named here rather than
implied away.

**The public key in a bundle is a convenience, not a trust anchor.** A bundle
carrying its own key proves internal consistency. Proving it came from us means
comparing the key id against `/api/receipts/key`.

**Entries written before receipts existed are unattested, not invalid**, and the
verifier reports them that way. Nothing was retroactively signed — backdating a
signature would misrepresent when the record was sealed, and it would need an
update path the ledger does not have.

---

## What an activation record does not prove

The same discipline, applied to the newest claim in the system.

**It proves** that a policy was activated, that a preview with this exact hash
was computed from the books at that moment and matched what the browser
rendered, and that the ledger was in this exact state when it happened. Break
any of those and the record fails verification, naming which one broke.

**It does not prove a human read the preview.** It proves one was shown and
consented past. No system can prove attention, and this one does not pretend to.
The honest claim is *"nobody can now say they were never shown"* — which is the
useful half.

**It does not prove the preview was a good preview.** The battery covers eight
boundary cases chosen by us. A scenario nobody thought of is a scenario the
preview does not contain, and the battery version is recorded so that gap is
attributable rather than invisible.

**A preview describes the policy, not the model.** Every proposal in the battery
is constructed, not proposed by an agent. It answers "what would this authority
permit", which is identical whichever model asks — that invariance is the point,
not an omission.

---

**The tamper control on the attack console does not go through `lib/ledger`.**
It writes to the table directly, because that is the only way this record can be
altered at all. It simulates an attacker holding database credentials. It is not
a feature and it is labelled as such on screen.

---

## The honest gap in the pitch

**Pausing a mandate declines the charge. It does not cancel the contract.**

Prava stops the money; the vendor relationship still needs ending. That is why
the agent drafts the cancellation email, shown on screen as an artifact.

Say this before you are asked. Volunteering a real limitation reads as rigour.
Being caught concealing it costs more than the limitation ever would.
