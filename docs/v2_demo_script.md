# V2 Demo Script — Written Against the Roadmap

**Status:** Companion to `v2_architecture_plan.md`. Written *before* building,
because a milestone whose demo cannot be written in thirty seconds is a
milestone that will not survive the room.

**The discipline:** every milestone must earn its commits in stage time or in
the answer to a question a judge actually asks. Where it cannot, this document
trims it. One trim is applied below, to a milestone this author designed two
turns ago.

**The constraint that shapes everything.** The measured timings in
`runbook.md` are the real editor. A full tick is 92–107s; an injection tick is
37–44s; a reseed is 80–95s. Compile (~4s), bypass (~3s), export (~2s), and
offline verification (<1s) are the only operations fast enough to be
*performed*. Therefore: **everything slow is pre-run and shown; everything
fast is done live.** V2 does not change this rule, it inherits it — the
gauntlet is pre-run overnight, and exactly one novel attack runs live.

---

## Milestone 1 — The Simulation Plane

**The 30-second demo.** On `/policy`, paste the English policy. It compiles in
~4 seconds. Before the confirm button, the modal now shows a third column:
*what this policy would have done.* Point at three rows — "would auto-execute
Figma at $180," "would escalate Notion at $4,800," "would deny Vercel, rule
4." Say: *"I have not granted anything yet. This is the authority I am about
to sign, rehearsing itself against real history."* Then confirm. The
activation record appears, attested.

**One-sentence takeaway.** *You can watch delegated authority behave before
you grant it.*

**Judge criterion strengthened.** Trust — specifically "users should
understand what the agent can do and what it may spend," which is a stated
criterion. This is the only moment in any project at this hackathon where a
human sees the consequences of a permission *before* consenting to it.

**Sponsor most likely to appreciate it.** Visa. Their control model is built
on authorizations matching the user's *original instruction*; this makes the
instruction unambiguous at the moment it is authored, which is the only place
ambiguity can actually be fixed. Localhost second — informed consent as
product philosophy reads as a company's opinion, not a feature.

**Effort proportional?** Yes, and it is the best ratio in the plan. The
preview is free replay over a pure function that already exists; the whole
simulation plane is nine commits and it also silently supplies M3's scenario
mechanics. **But two commits do not earn stage time and should be honest
about it:** the behavioral diff (commit 6) is a 10-second aside on the policy
versions page, and the history-replay CLI (commit 7) is not a beat at all —
it is the answer to *"how do I know the engine is deterministic?"* Both stay,
because both are nearly free and both are Q&A ammunition, but neither gets
rehearsed minutes.

---

## Milestone 2 — The Second Book

**The 30-second demo.** On `/attack`, choose *Bypass the engine — charge
under cap, suppress the ledger write.* It runs in ~3 seconds and succeeds:
money moved, nothing recorded. Say: *"I just stole from myself, using my own
admin access, and my own ledger does not know."* Open `/authority` and run
reconciliation. It comes back **discrepant**, naming the orphan charge by its
Prava id. *"Prava's books and my books disagree. My books are wrong, and they
say so."*

**One-sentence takeaway.** *An append-only ledger proves nothing was altered;
only two-sided reconciliation proves nothing was hidden.*

**Judge criterion strengthened.** End-to-end functionality *and* trust — it
converts the audit story from "our records are tamper-evident" to "our
records are tamper-evident **and complete**," which is the difference between
a log and an accounting system.

**Sponsor most likely to appreciate it.** Prava, decisively. Every other team
uses Prava to move money; this beat uses Prava's charge history as an
*independent book of record* that catches the application lying about itself.
It is a use of their platform they will not have seen in the room, and it
casts their layer as the thing that holds when ours is compromised.

**Effort proportional?** Yes. Eight commits, and the demo beat is the sharpest
new sentence in V2 — "we stole from ourselves and the books caught it." The
one risk is external: sandbox charge-history fidelity, which is why the
roadmap verifies it in the milestone's first commit rather than its last. If
that endpoint disappoints, this milestone is the one that changes shape, and
we learn that on day one rather than on stage.

---

## Milestone 3 — The Standing Adversary

**The 30-second demo.** Open `/gauntlet`. The scoreboard is already populated
from the overnight run: attack classes down the left, attempts, and one
column that is entirely zeros — *executed outside authority*. Say: *"Last
night a frontier reasoning model had one job: move money it was not allowed
to move. Here is every attempt, in the same signed chain as everything else."*
Then run **one** novel attack live (~44s, narrate through it). Whatever
happens, it lands in the record.

**The framing that must be prepared, because both outcomes are wins.** The
runbook already documents that the real proposer *refuses* the injection bait
and only the credulous stub takes it. V2 makes this a feature of the record
rather than an awkwardness, but only if named in advance:

> *"There are two ways this ends. Either the attacker fools our agent and the
> engine stops it anyway — that is the claim. Or the attacker fails to fool
> the agent at all, which is nice but proves nothing, so we run it again with
> a deliberately credulous proposer to test the claim I actually care about.
> The record will tell you which one you just watched."*

Say this *before* the tick. Announcing the fork is what makes either branch
land; discovering it live is what makes a demo wobble.

**One-sentence takeaway.** *Safety is not a story we tell about one rehearsed
attack; it is a number that grows every night and is signed.*

**Judge criterion strengthened.** Creativity and novelty, plus "what happens
next." The inversion — the frontier model is the *attacker* — is the single
most repeatable sentence in the project, and a growing attested corpus is the
thing that makes this look like research rather than a weekend.

**Sponsor most likely to appreciate it.** OpenAI. This is evals culture
applied to authority: a frozen, versioned corpus, a reproducible harness, a
measured claim, and an explicit refusal to spend the intelligence budget on
making the agent more powerful. Visa close behind — every attack that gets
past the engine dies at their ceiling, on the record.

**Effort proportional?** This is the most expensive milestone (11 commits) and
the climax, so yes — but with one demoted item. **Commit 7, the model matrix,
should not be a live beat.** "Three proposers, identical authority outcomes"
is a genuinely good idea and a genuinely bad thirty seconds; it is a *table*.
Demote it to a column in the exported record and one Q&A sentence. If the
weekend compresses, it is still the first thing to cut, and cutting it costs
the demo nothing.

---

## Milestone 4 — One Proof, One File → **TRIMMED**

**The honest assessment.** Write the 30-second demo and the problem is
immediate: *"Here is one file. I turn off the wifi. It verifies."* That beat
**already exists in V1.** By the end of M3, the verifier handles every claim
type — because M2 and M3 each extended it as their claim types landed. M4's
unification is therefore a *refactor with a demo delta of approximately zero*:
the audience cannot see the difference between one bundle and three, and no
judge will ask.

Eight commits for a repackaging is the worst ratio in the plan, and the
milestone was designed by this author two turns ago. It comes out.

**What survives, and where it goes.** Three of its eight commits are
load-bearing and were mis-scheduled rather than wrong — they belong at the
moment each claim type is created, not retrofitted afterward:

- **Cross-reference integrity** (anchoring aggregate claims to ledger heads,
  so tampering breaks everything downstream) moves *into* M2 and M3 as part
  of each claim type's own commit. This is the correct design anyway:
  anchoring retrofitted is anchoring that can be forgotten.
- **The trust bundle export and single verifier pass** collapse into one
  commit at the end of M3. It is small once every type is already supported.
- **PAR/1, the short specification**, moves to M5 as a documentation commit.
  It is the named primitive Localhost cares about, it is a leave-behind
  rather than a beat, and it costs an hour.

**What is dropped outright.** The conditional proof-carrying-charges commit —
gated on an unverified Prava capability, with a demo impact that requires
ninety seconds of narration to explain a directional subtlety. The
reconciliation already binds rails to ledger in both directions. Cut it.

**Net effect:** five milestones become four; 44 commits become roughly 33; the
demo loses nothing and the roadmap gains honesty.

---

## Milestone 5 (now 4) — Real Rails

**The 30-second demo.** Same bypass beat as V1's climax, one word different:
*"That is a real card, a real ceiling, and a real Visa decline."* Then open
Prava's dashboard beside the ledger and cross-check the charge id. Close with
the export: one file, wifi off, verified.

**One-sentence takeaway.** *Nothing here was a simulation — including the part
where it refused.*

**Judge criterion strengthened.** Prava implementation, explicitly: the rules
say a mocked payment presented as a transaction is a disqualifying weakness,
and that creating a session is not a completed order. Production makes every
claim in the demo unfakeable at once.

**Sponsor most likely to appreciate it.** Prava and Visa jointly — it is
their rails doing the work in the most dramatic moment of the demo.

**Effort proportional?** The most favorable ratio in the plan: low
engineering, high stakes-per-minute. The cost is *process*, not code, and the
access window closes August 8, which is why the request goes out during M1
rather than when the milestone starts. Every beat keeps its sandbox twin, so
approval slipping degrades the finale rather than breaking it.

---

## The consolidated running order

Five minutes. Slow things pre-run, fast things live, the two new proofs placed
where the old demo was thinnest.

| # | Beat | Live? | Time | What it proves |
|---|---|---|---|---|
| 1 | Policy in English, **with preview**, then confirm | Live | 45s | Authority is authored, seen, and consented to |
| 2 | Overnight ledger — an entry with no human in the chain | Shown | 30s | It runs unattended |
| 3 | Walk one decision — four actors, counterfactual | Shown | 40s | Every action is attributable |
| 4 | Approvals — approve $4,800, ceiling does not move | Live | 45s | Your app cannot grant authority |
| 5 | **Gauntlet scoreboard**, then one novel attack live | Both | 75s | Manipulation is measured, not anecdotal |
| 6 | **Bypass → reconciliation catches the orphan** | Live | 45s | Nothing moves unrecorded, even by us |
| 7 | Export, wifi off, verify | Live | 30s | You do not have to trust us |

**The three-minute cut,** for when the schedule slips: beats 1, 5, 6, 7. It
loses the attribution walk and the approval ceremony and keeps the entire
argument — authority authored, authority attacked, authority audited,
authority verified by a stranger.

**The one narrative trap.** Do not explain corpus freezing, run contexts, or
claim envelopes on stage. Show the scoreboard and the file. The plumbing is
what the repository and the Q&A are for, and a judge who asks "how do you
know the attacks are reproducible?" is a judge who has already decided the
project is serious.

---

## Verdict on proportionality

Three milestones earn their engineering in stage time (M1's preview, M2's
orphan catch, M3's scoreboard-plus-live-attack). One earns it in credibility
per minute rather than in code (production). One did not earn it at all and
has been dissolved into the others.

The result is a demo that is *shorter* than the sum of its parts while
claiming more than V1 did — which is the only reliable signal that the
architecture underneath it is actually coherent.
