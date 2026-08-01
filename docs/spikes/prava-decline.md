# Spike — Prava sandbox over-cap decline behavior

**Status:** UNVERIFIED — sandbox credentials not available in this environment.

**Question:** when a charge is attempted against a Prava mandate for an amount
exceeding the mandate's amount ceiling, does the Prava sandbox decline the
charge at the network, or does it accept the charge and reconcile later?

The demo climax depends on the answer. The claim is that the amount ceiling is
enforced in the tokenized credential itself — not by our policy engine. That
claim is only demonstrable if the sandbox actually declines.

## Why this is asked first

Answered on day one it costs an hour. Discovered on day five it costs the
project. The spike runs concurrently with setup and blocks nobody.

## Method

Throwaway script, not merged into `lib/`:

1. Create a sandbox session.
2. Create a mandate with an amount ceiling of 100.00 USD, merchant pinned to a
   single test merchant, single-use frequency.
3. Attempt a charge of 100.00 against that mandate. Record the response.
4. Attempt a charge of 250.00 against the same mandate. Record the response —
   status code, error code, and whether any charge id was issued.
5. Pause the mandate. Attempt a charge of 10.00. Record the response.

Step 4 answers the question. Step 5 establishes the fallback.

## Expected outcomes and what each means

| Result of step 4 | Meaning | Action |
|---|---|---|
| Declined at the network with a typed error | The claim holds | Over-cap decline is the demo climax |
| Accepted, reconciled later | The claim does not hold as stated | Fall back to the paused-mandate decline from step 5 |
| Error unrelated to the ceiling | Inconclusive | Re-run with a clean mandate before drawing a conclusion |

## Recorded answer

Not yet obtained. No Prava sandbox credentials were present when this spike was
scheduled, so it could not be executed.

**Consequence, decided now rather than on day five:** the system is built so
that the answer does not change any code. The adapter interface normalizes both
a network decline and a paused-mandate decline into the same typed failure,
`NETWORK_DECLINE`, carrying the reason the network gave. The outcome router
treats them identically: nothing is charged, a ledger entry is written, and the
decline is never retried.

**Fallback climax:** the paused-mandate decline (step 5). It exercises the same
code path, produces the same ledger entry shape, and makes the same point — the
refusal came from the network, not from us. It is available regardless of how
step 4 resolves.

**Before the demo:** run this spike against live credentials and replace this
section with the observed responses. If step 4 declines, use it. If it does not,
use step 5 and say so plainly.
