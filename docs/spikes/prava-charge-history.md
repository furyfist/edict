# Spike — does Prava expose a charge-history read?

**Status:** ANSWERED — negative, on the sandbox, as of 2026-08-01
**Owner:** WS-B
**Blocks:** M2's headline claim on real rails. Does not block the code.
**Probed with:** a live `sk_test_*` key against `https://sandbox.api.prava.space`

---

## The question

Two-sided reconciliation needs the payment network's own list of charges for a
mandate. Direction one — every executed ledger entry has a network-side charge —
can be answered one charge at a time. **Direction two — every network-side charge
has a ledger entry — cannot.** It requires enumeration, and enumeration requires
an endpoint.

Direction two is the one that catches money moving without a record, which is the
entire point of the milestone.

## What was probed

| Path | HTTP | Body shape | Reading |
|---|---|---|---|
| `GET /v1/mandates/{id}` | 404 | `{"error":{"code":"MANDATE_NOT_FOUND"}}` | **Route exists.** Application-level miss — the seeded mandate ids are local mirror rows, not real Prava mandates |
| `GET /v1/mandates/{id}/charges` | 404 | `{"message":"Route GET:… not found","statusCode":404}` | **No such route** |
| `GET /v1/mandates/{id}/transactions` | 404 | router miss | No such route |
| `GET /v1/mandates/{id}/history` | 404 | router miss | No such route |
| `GET /v1/charges?mandateId=…` | 404 | router miss | No such route |
| `GET /v1/transactions?mandateId=…` | 404 | router miss | No such route |

The two 404 shapes are the finding. A Fastify router miss (`"Route GET:… not
found"`) and an application miss (`{"error":{"code":"MANDATE_NOT_FOUND"}}`) are
distinguishable, which is what makes this a real answer rather than a guess.

**Auth is fine.** No 401 anywhere; the key is live and the API is reachable.

## Result

**No charge-history endpoint was found on the sandbox.** Five plausible paths,
all router-level misses.

This is evidence, not proof. It does not rule out an endpoint under a path nobody
guessed, or one gated behind production access. What it does rule out is
*assuming* one exists, which the V2 plan did.

## Decision

Ship reconciliation with the unknown isolated in the adapter, exactly as the
adapter exists to do.

- `PaymentBoundary.listCharges` returns a **typed result**, never a bare list.
- The real adapter attempts `/v1/mandates/{id}/charges` — the collection the
  documented report endpoint (`/v1/mandates/{id}/charges/{txnId}/report`) is
  nested under, the only principled guess available — and classifies a router
  miss as `UNSUPPORTED`.
- **`UNSUPPORTED` never renders as balanced books.** Direction two is reported as
  unverifiable, by name, everywhere it surfaces. A reconciliation that cannot
  enumerate has not found nothing; it has failed to look.
- The mock adapter keeps its own persisted book (`MockCharge`), so the beat is
  fully exercisable offline and in tests.

If Prava documents or ships the endpoint, `listChargesFor` in
`lib/prava/prava.ts` is the single function that changes.

## What to say on stage

Do not claim two-sided reconciliation against real Prava rails unless the
endpoint has been confirmed by then. The honest sentence, which is still strong:

> *"Direction one runs against the real network. Direction two — proving nothing
> moved that we did not record — needs an enumeration endpoint this sandbox does
> not expose, so you are watching it against our fallback provider. The
> reconciler says so itself; it will not tell you the books balance when it
> could not read one of them."*

Volunteer the limit. The mechanism is the contribution, and it is real either
way.
