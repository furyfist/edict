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
  there is no path.
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
