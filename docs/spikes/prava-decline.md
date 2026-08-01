# Spike — Prava sandbox over-cap decline behavior

**Status:** ANSWERED FROM DOCUMENTATION — awaiting live sandbox confirmation
**Owner:** WS-B
**Blocks:** the demo narrative. Does not block any code.
**Must be confirmed live:** Day 1. Not later.

---

## Documented answer

Prava's API reference states it directly:

> `THRESHOLD_EXCEEDED` is **not** a Prava error code — it is a Visa decline (an
> over-cap charge) surfaced in a failed charge's `errorCode` / `errorMessage`
> within the response body, not the top-level error envelope.

This is the answer the demo needs, and it is stronger than hoped: the decline
originates at the **card network**, not at Prava's application layer. An over-cap
charge returns HTTP 200 with `status: "failed"` and `errorCode: THRESHOLD_EXCEEDED`
in the body — it is not an API error, it is a declined transaction.

`lib/prava/prava.ts` maps that to `DECLINED_OVER_CAP`, which the outcome router
records as `NETWORK_DECLINE` and never retries.

**Still required:** one live sandbox run to confirm the shape. The narrative is
de-risked; the wire format is not.

---

## Related surface, also now documented

| Operation | Method | Path |
|---|---|---|
| Charge a mandate | POST | `/v1/mandates/{id}/charge` |
| Report a charge | POST | `/v1/mandates/{id}/charges/{txnId}/report` |
| Get a mandate | GET | `/v1/mandates/{id}` |
| Pause / Resume / Cancel | POST | `/v1/mandates/{id}/{pause\|resume\|cancel}` |
| Create session / mandate setup | POST | `/v1/sessions` |

Two details that shaped the adapter:

1. **Amounts are decimal strings**, e.g. `"40.00"` — not integer cents. The
   adapter converts at the boundary; nothing above it ever sees a decimal.
2. **A charge returns `awaiting_result`**, and the outcome must be settled with
   the report endpoint. A charge is not complete until it is reported.

---

## The question

**Does Prava's sandbox decline a mandate charge whose amount exceeds the mandate's amount cap?**

A yes/no answer. Nothing else is being investigated.

## Why it matters

The demo climax has two beats:

1. The agent is prompt-injected, proposes an over-cap payment, and the deterministic
   policy engine refuses it.
2. The policy engine is **deliberately and audibly bypassed**, the over-cap charge is
   issued directly through the adapter, and Prava declines it — proving the ceiling
   lives outside the application entirely.

Beat 2 depends entirely on this behavior. It is the only unfakeable moment in the
demo, and it rests on an assumption about someone else's sandbox.

Answered on Day 1 this costs an hour. Discovered on Day 5 it costs the project.

## Procedure

1. Obtain sandbox keys from the Prava developer dashboard (`sk_test_*`).
2. Create a payment session with a `mandate_setup` block. Approve it with a passkey.
3. Confirm the mandate is `active` and note its amount cap.
4. Charge the mandate for an amount **within** the cap. Confirm it succeeds.
5. Charge the same mandate for an amount **above** the cap.
6. Record the exact HTTP status, error code, and message body.

Throwaway script. Do not merge it into `lib/`. Only this document is committed.

## Result

> Fill this in. Do not leave it blank and do not summarize — paste the raw response.

**Over-cap charge outcome:** _unanswered_

**HTTP status:** _unanswered_

**Error code:** _unanswered_

**Raw response body:**

```
(paste here)
```

## Decision

Pick one and delete the other. This is a one-way door for the demo narrative.

- [ ] **DECLINED as expected.** Beat 2 stands as designed. The refusal is recorded
      as `NETWORK_DECLINE`, never retried.

- [ ] **NOT declined.** Beat 2 is replaced by the **paused-mandate decline**: pause
      the mandate, then attempt the charge. That path is enforcement fully under our
      control. Update the demo narrative and the error table in the specification.

## Wording constraint on the result

Per the verified Prava guardrails documentation, only the **amount** constraint is
enforced technically in the tokenized card credential. Merchant, frequency, duration,
and product scope are enforced by Prava's own layer.

The claim on stage is therefore precise:

> The amount ceiling is enforced in the tokenized credential. Merchant, frequency and
> duration are enforced by Prava. Our policy engine is the first gate. Three
> independent layers, none of them the language model.

Do not say the card network enforces the whole policy. It enforces the amount — which
is exactly the constraint the injection attack tests.
