# Disclosure

Written here so it is volunteered rather than discovered.

Judges reward disclosure and punish surprise. Everything below should be said
out loud during the demo, not buried in a repository nobody opens.

---

## What is real

- **The policy engine.** Deterministic, two-pass, with 33 tests covering every
  specified edge case. Same inputs, same verdict, forever.
- **The enforcement layering.** The amount ceiling is enforced in the tokenized
  card credential — a Visa decline, surfaced as `THRESHOLD_EXCEEDED`. Merchant,
  frequency and duration are enforced by Prava. Our engine is the first gate.
- **The module boundary.** `lib/agent` has no import path to `lib/prava`,
  `lib/ledger`, `lib/policy/engine`, `lib/outcome`, or `lib/db`. Checked
  transitively by `lib/architecture.test.ts` — a build failure, not a
  convention. `grep` can only prove there is no direct edge; the graph proves
  there is no path.
- **The append-only ledger.** No update path, no delete path, anywhere.
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
- **The company itself.** There is no customer behind this data.

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
