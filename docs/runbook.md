# Demo runbook

Everything needed to drive the demo, and to recover when something goes wrong.

**Read this before the first rehearsal, not during it.**

---

## Before the room

| Check | Command / action |
|---|---|
| Database reachable | `npm run db:push` |
| Connection pool | `DATABASE_URL` ends `connection_limit=20`. Worth ~0.2s since the Vendors page reads were grouped; keep it, but it is not load-bearing |
| Clean state | `npm run seed` |
| Tests green | `npm run test` — expect 209 passing. Includes the module-boundary check and the verifier-conformance check; if either fails, a claim you are about to make on stage is no longer true |
| **History replays** | `npm run replay` — expect `IDENTICAL`. If it diverges, the engine no longer reproduces a decision it already made, and beat 1's Q&A answer is gone. **~4s** |
| **Signing key is set** | `curl <url>/api/receipts/key` → `configured: true`. **If this is false every entry reads *unattested* and beat 7 evaporates.** Set `RECEIPT_SIGNING_KEY`, redeploy, re-run the tick |
| Verifier runs on the presentation machine | `npm run verify <bundle>` against an exported file, with wifi off |
| Build clean | `npm run build` |
| **Present from the production build** | `npm run build && npm start` — **never `npm run dev`.** Dev compiles each route on first visit, on top of the query cost below |
| **Warm every page** | After starting the server, load all seven pages once. Cheap insurance, and it is the moment you would notice a page failing |
| Deployed build is current | Redeploy, then load the URL |
| Prava sandbox live | Hit the Authority page; mandate statuses should read `active`. With `PRAVA_SECRET_KEY` unset the mock adapter runs: charges still decline over-cap, but the **live passkey ceremony and the Prava-dashboard cross-check are both unavailable** — know which version of beats 4 and 5b you are giving before you walk in |
| Which agent is live | Ledger entry → `decided by`. Says `deterministic fallback` when no `OPENAI_API_KEY` |
| **Agent for the live attack** | **Your configured model does not take the bait.** Measured: `openai/gpt-oss-120b` proposed the real `$95`, ignoring the injected `$48,000`. Only the stub takes it. Pre-run beat 2 with the real model, then restart with `OPENAI_API_KEY` unset before the room — beat 2's entries keep their real-model attribution and the live tick records `deterministic fallback`. **Disclose it**, see beat 5 |
| Which adapter is live | Ledger entry → `executed by`. `prava` vs mock |
| Fallback video plays | Open it on the actual presentation machine |
| Reseed works | `POST /api/demo/reseed` and confirm counts come back |
| **Never restart the server during a tick** | A tick holds a single-flight lock. Kill the process mid-run and the lock survives; every tick returns `haltReason: LOCK_HELD` until it goes stale at **5 minutes**. A ~107s tick is a wide window — if something looks wrong mid-tick, let it finish |

Set the browser to the **Ledger** page before you start talking. It is the
five-second impression.

## Timing — measured, plan around it

Every figure below is round-trip latency to a remote database and to the model,
not compute. Deploying close to the database collapses most of it.

Where a range is given it is the spread actually observed across repeated runs
on the same machine and database — the same operation varied by 15–20% between
runs. **Plan against the upper number.** A beat that finishes early costs you
nothing; one that overruns the number you rehearsed to costs you the room.

| Action | Measured | Implication |
|---|---|---|
| Full tick (8 vendors) | **92–107s** | **Pre-run this.** Do not run a cold tick live and talk over it |
| Injection tick (1 processed, 7 skipped) | **37–44s** | Live, but narrate through it. Plant the message, advance the clock, then talk while it runs |
| Repeat tick (all skipped) | ~25s | Still not instant — idempotency check is 8 round trips |
| Reseed | **80–95s** | Recovery, not a live beat. Start it before you need it. Writes ~12,400 usage rows; batched, so the count barely moves the clock |
| Kill switch engage/release | ~16s | Fine live |
| **Policy compile + preview** | **10.2–11.0s** | Live, but **narrate through it**. About 6–7s is the model, ~4s is the preview replaying 72 scenarios over eight vendors' evidence. Say what it is doing while it does it — see beat 1 |
| **Policy activation** | **8.7s** | Live. The server rebuilds the entire preview to check it matches the one you were shown before it will sign anything. That pause is a sentence, not an apology |
| **Behavioral diff** (`/policy`) | **4.0–4.4s** | Q&A only, on click. Never on the critical path |
| **History replay** (`npm run replay`, 8 entries) | **4.1–4.6s** | Q&A. Includes process start and connection |
| Engine bypass (either mode) | ~3s | Fine live. This is the climax and it is fast |
| Receipt export | ~2s | Fine live |
| Offline verification (8 entries) | **<1s** | Fine live. Local crypto, no round trips |
| Tamper / restore | ~1s each | Fine live, and repeatable — no reseed needed |
| Page load — ledger, refusals | ~1.4s | Fine live |
| Page load — policy | ~2.0s | Fine live. Up from ~1.4s: the page now also reads the activation record |
| Page load — approvals | ~3.0s | Fine live |
| Page load — authority, attack, vendors | ~3.9s | Fine live |

Every page is now comfortably clickable. `/vendors` used to be the exception at
**~10.2s**; it reads in one grouped wave of seven queries rather than five per
vendor, and lands at ~2.7–4.0s depending on what else is in flight.

`connection_limit` in `DATABASE_URL` is 20. Worth about 0.2s now that the reads
are grouped — keep it, but nothing depends on it.
| Page load, `npm run dev`, first hit | **4–11s** | `/vendors` measured at 10.8s cold. **Present from `npm run build && npm start`**, and load every page once before the room |

**Full recovery is reseed + tick ≈ 200s.** Three and a half minutes of dead air
if you start it in front of people. Decide to reseed early or not at all.

The demo-safe order: pre-run the overnight tick, then do policy compile,
approvals, and the bypass live — all of those are seconds.

---

## The arc

Six beats. The tension is in 4 and 5 — everything before is setup.

**1. Here is the policy, in English — and here is what it would do.** `/policy`.
Type the three sentences into the composer and press **Compile**.

**~11s. Narrate through it, do not wait in silence.** The model turns English
into rules, then the rules are replayed against every renewal on the books and
every boundary case the history does not contain — 72 scenarios.

The modal is the beat. Three counts across the top, then the rows. Point at
exactly three and then stop:

> *"It would auto-execute Figma at $180 — that is rule 1, and there is the
> sentence it came from. It would bring Notion at $4,800 to me, and notice it is
> not my policy that stopped it, it is the mandate ceiling. It would refuse
> Vercel outright, quoting the words 'Never auto-renew Vercel.'*
>
> *I have not granted anything yet. This is the authority I am about to sign,
> rehearsing itself against my real vendors."*

Then confirm. **~9s**, and say why while it runs:

> *"It is rebuilding that entire preview server-side to check it matches the one
> I was just shown. If they disagree it refuses to activate — so the record it
> is about to sign cannot claim I saw something I did not."*

The activation record appears, reading **attested**, carrying the preview hash
and the ledger head it was anchored to.

**Say "hypothetical", never "example".** Sixty-four of the 72 rows are
constructed boundary cases and they are labelled as such on screen. Volunteer
that before anyone squints at it: *"one row per vendor is real, the rest are
boundary cases we built — over the ceiling by one cent, missing usage data, a
paused mandate. We do not get to choose which vendors get the awkward cases;
every case is applied to every vendor."*

**If the preview fails to compute**, the modal says so and offers to activate
without one. That is a working state, not a broken one — but the record will
say the authority was granted with nothing proving what was shown, so prefer to
recompile.

*Left over for Q&A, not for the stage:* on any older version in the history
list, "what changed between v1 and v5?" replays both versions over one battery
and names the authority that moved — *6 became automatic, 6 newly refused,*
row by row. It is the answer to "how do you know what that edit did?"

**2. We let it run overnight.** `/` — the ledger. Point at an entry with no
human in the attribution chain. The absence *is* the proof.

*(Genuinely pre-run this. Do not fake it.)*

**3. Walk one decision.** Expand the Figma entry. Evidence chips, the
counterfactual, the rejected alternative, and the four actors: decided by agent,
authorized by policy rule, executed by Prava, recorded here.

**4. Here is one it would not do alone.** `/approvals` — Datadog, a 62% price
increase past the mandate ceiling. Approve it. Note the button says *needs
passkey*: approving in the app records intent and moves no ceiling. Complete the
ceremony.

**If `PRAVA_SECRET_KEY` is not set, this beat still works — differently, and
arguably better.** The app cannot open a ceremony, so it says so:

> No payment provider is connected, so no passkey ceremony can be opened.
> Your approval is recorded and the ceiling is unchanged — approving here never
> moves it. Without a ceremony there is no new authority, and this system will
> not pretend otherwise.

Run the beat as the invariant instead of the ceremony:

> *"I just approved a $4,800 charge against a $500 ceiling. Watch what happened
> to the ceiling: nothing. Approving in my application records that I want it —
> it cannot grant it. That takes a passkey, and with no provider connected there
> is no passkey, so there is no new authority. The system refuses to invent one."*

Verified: approval goes to `APPROVED`, `passkeyAt` stays `null`, mandate cap
stays **$500.00**. Show them the Authority page afterwards — the meter has not
moved. **There is deliberately no mock ceremony**; a simulated passkey would be
a fabricated security ceremony, and that is the one thing here that would
genuinely deserve to be called dishonest.

**5. Someone attacks it.** `/attack`. **Hand the keyboard to a judge.** Let them
write the injection.

Leave the vendor on **CloudSync Pro**, which the console selects for you. It is
the only vendor with a renewal cycle the overnight run did not consume; plant
elsewhere and the tick correctly finds nothing to adjudicate and the beat dies
quietly.

Advance the clock **+30d**, then run the tick — **~44s**, so keep talking. One
vendor processes: the one they just attacked. The agent proposes paying the
injected amount. Nothing moves.

Say this before the tick, not after:

> *"The agent running this beat is our deterministic fallback, not the live
> model — our model didn't fall for this message, and I'm not going to pretend
> it did. The fallback is credulous on purpose, because the claim I want to test
> is what happens when the agent IS fooled."*

That is the honest version and it is the stronger one: the point was never that
the model is hard to fool. Check `decided by` on the new entry — it says
`deterministic fallback`, and the ledger tells the audience that before you do.

**What the engine actually says**, measured:

> Escalated CloudSync Pro. **The amount exceeds the authorized ceiling**, which
> requires a new approval. Nothing was charged.

Read the counterfactual underneath it out loud — it is the whole beat in one
line: *"Do nothing and you pay **$95.00** on 2026-04-01."* The real price is
$95. The agent was talked into $48,000. The ceiling is what stopped it.

**Say escalated, not refused.** Over-ceiling is not a policy question — it
needs a human and a passkey, so the verdict is `REQUIRE_APPROVAL` and the entry
reads ESCALATED. "Nothing moved, and it stopped to ask" is the accurate line and
it is stronger than "refused", because asking is the behaviour you want.

Then say, out loud, before clicking:

> *"I am now bypassing our own policy engine to show you the layer underneath."*

Click **Charge over the ceiling**. Prava declines it — `THRESHOLD_EXCEEDED`, a
Visa decline, not an application error.

**6. "How do I know this ledger isn't just what you typed?"** `/attack`, section
5. Export the receipts and **hand the file to a judge** — every entry is signed
and hash-linked to the one before it.

Have them run it on their own machine, with wifi off:

```bash
node scripts/verify-receipts.mjs edict-receipts.json
```

It resolves each entry back to the sentence the owner wrote. Then say, out loud,
before clicking:

> *"Our application cannot edit this record — there is no update path in the
> code. I am going in through the database, which is the only way it can be
> done at all."*

Click **Rewrite this entry**. The ledger badge flips to *receipt does not
match*. Re-export, re-run the verifier: that entry fails, and the summary line
reads **CHAIN COMPROMISED**. Click **Restore** and it verifies again.

Three sentences carry it: *the application cannot edit this record. Someone with
the database can. And even then, you would know.*

**Do not overstate it.** A receipt proves the record was not altered after it
was written and that we wrote it. It does not prove the record was true when
written — the cross-check for that is the Prava dashboard, which beat 3 already
does. Volunteer the limit.

**7. Kill switch.** `/authority`. Type `HALT`. Every mandate pauses, and the
halted banner appears on every page.

---

## The precise claim

Say this, exactly:

> The amount ceiling is enforced in the tokenized credential. Merchant, frequency
> and duration are enforced by Prava. Our policy engine is the first gate. Three
> independent layers — and none of them is the language model.

**Do not say** the card network enforces the whole policy. It enforces the
amount, which is exactly the constraint under attack.

---

## When it goes wrong

| Symptom | Do this |
|---|---|
| Over-cap charge does **not** decline | Use **Fallback: pause then charge** on the attack console. Enforcement fully under our control |
| Passkey ceremony fails | Cut to the fallback recording. Do not retry live |
| No provider connected (`PRAVA_SECRET_KEY` unset) | Not a failure. The approval panel states it plainly and the ceiling stays put — run beat 4 as the invariant, see the arc. Nothing leaks the variable name to the screen; the hint goes to the server log |
| Model slow, rate-limited, or down | Unset `OPENAI_API_KEY` and restart — the stub agent takes over and is credulous by design, so the attack beat still works |
| Prava sandbox down | Unset `PRAVA_SECRET_KEY` and restart — the mock adapter declines over-cap charges the same way |
| Tick returns `halted` | Read `haltReason`. `KILL_SWITCH` → release it on Authority. `NO_POLICY` → activate one. `LOCK_HELD` → the usual cause is a server restart during a tick. Waiting out the 5-minute stale window keeps your pre-run ledger; a reseed clears the lock instantly but destroys it and costs ~200s to rebuild. **Wait**, unless the state was already ruined |
| Demo state is a mess | `POST /api/demo/reseed`. **Up to ~95s** against a remote DB, and you almost certainly need the tick after it at up to ~107s — budget **~200s**. Start it before you need it; never mid-beat |
| A charge succeeded that should not have | Stop the demo. Say so plainly. This is a real finding and pretending otherwise is worse than the bug |
| Every entry reads `unattested` | `RECEIPT_SIGNING_KEY` is not set on that build. Nothing is broken and nothing was lost — receipts were simply never issued. Set it, redeploy, re-run the tick. **Check this before the room, not in it** |
| Tamper will not restore | The original amount comes from the entry's frozen `financialImpact`. If that is gone, reseed and re-run the tick (**~200s total**). Sequence beat 6 late so this never costs you a demo |
| Verifier reports a chain break you did not cause | An entry was written by something outside the tick — usually a stray bypass call. Reseed and re-run the tick for a clean chain |

---

## Questions you will get

**"Is the usage data real?"**
No — seeded, and labelled in the interface. The enforcement is not seeded, and
that is the half that matters.

**"Can you edit the ledger?"**
No — and you do not have to take our word for it. Append-only, no update path,
no delete path. Every entry is Ed25519-signed and hash-linked to its
predecessor, and you can verify the export yourself with our app closed. Then
show them beat 6.

**"So you could just re-sign everything."**
Yes, if we rewrote the whole chain — there is no external anchor, and we hold
the key. That is the honest limit of what this proves, and a third-party notary
is what would close it. Say this before it is asked.

**"What if the record was wrong when you wrote it?"**
A signature cannot help you there, and we do not claim it does. That is what the
Prava mandate and charge identifiers are for — cross-check them in Prava's own
dashboard.

**"Doesn't pausing a mandate just decline the charge, not cancel the contract?"**
Correct — and that is why the agent drafts the cancellation email. Volunteer
this before you are asked.

**"What if the model is jailbroken?"**
It was, on stage. It proposed $48,000. Nothing moved.

**"How is the confidence score computed?"**
There isn't one. Confidence is expressed as behaviour: confident enough to act,
or it escalates.

**"How do I know the engine is deterministic?"**
Run it. `npm run replay` re-adjudicates every entry in the ledger from its own
frozen evidence and the exact policy version it ran under, and compares the
re-derived verdict against the one recorded. It prints `IDENTICAL`. If the
engine ever acquired a hidden input — a clock, a cache, an environment variable
— that goes red.

Its limit, volunteered: it proves the decision reproduces. It cannot prove the
evidence was true when it was frozen, and nothing replayed from a snapshot
could. The cross-check for that is still Prava's dashboard.

**"Isn't the preview just a demo of your own code agreeing with itself?"**
It is the same function. Not a model of the engine, not a second implementation
— `lib/simulate` calls `evaluate` and does nothing else with the answer, and
`lib/architecture.test.ts` fails the build if that module ever acquires a
database read, a clock, or a path to `lib/prava`. A preview that could disagree
with the engine would be worse than no preview, so it is not allowed to be a
different thing.

**"How do you know the scenarios aren't cherry-picked?"**
There is no picking. The battery is the complete cross product: eight boundary
cases applied to every vendor with a renewal, in a fixed order, plus the one
real renewal per vendor. The only judgement is which boundaries exist, and that
list is nine lines in `lib/simulate/battery.ts`. A scenario is skipped only when
it cannot be constructed — you cannot ask a vendor with no mandate what happens
one cent over its ceiling.

**"Could you sign an activation record for a preview nobody saw?"**
Not without the browser and the server agreeing on a hash. The client sends the
digest of what it rendered; the server rebuilds the preview from the same books
and refuses the activation if they differ. That refusal is a 409 and it names
both digests. It is also why activation takes ~9s.

**"What stops the agent calling Prava directly?"**
`lib/agent` has no import path to `lib/prava` — and that is enforced by a test
that fails the build, not by a convention. Offer to break it in front of them:
add the import, run `npm run test`, and watch `lib/architecture.test.ts` name
the forbidden route.

The stronger half of the answer is that the check is **transitive**. `grep`
proves there is no direct edge; it cannot prove there is no path. Import
`@prisma/client` into `lib/contracts` — a one-line "cleanup" that looks like
tidying — and grep still comes back clean while the agent has quietly gained a
route to the database. The graph catches it. That is the difference between a
convention and a mechanism.

Its limit, if pressed: it does not stop someone deleting the test. Nothing in a
repository can. It turns a silent regression into a loud one, and removing the
alarm is itself a visible act.

---

## Fallback recording

Record the passkey ceremony **the day it first works**, not on the last day.

- Screen recording, audio off, 20–40 seconds
- Stored locally on the presentation machine, not streamed
- Verified playable on that machine, in that room, on that projector
