# PAR/1 — Portable Authority Records

**Status:** normative for this repository. Version 1.
**Implementations:** `lib/attest` (signer) and `scripts/verify-receipts.mjs`
(verifier). They share no code, deliberately.

A format for signed, anchored, offline-verifiable statements about what an
autonomous agent did and what it was permitted to do.

Short on purpose. If it takes longer than ten minutes to read, nobody will
implement it.

---

## 1. What problem this solves

An agent that spends money produces two kinds of statement:

- **records of actions** — "this charge happened, under this rule, at this time"
- **claims about those records** — "a human saw what this policy would do before
  granting it"; "nothing moved that is missing from these records"; "N attacks
  ran and none moved money"

The first is a log. The second is the interesting one, and it is normally a
sentence somebody says rather than an object anyone can check.

PAR/1 makes both the same kind of object: canonical, signed, anchored, and
verifiable by a stranger with the issuing application switched off.

---

## 2. Canonical form

Every signature is over the UTF-8 bytes of a canonical string. One logical value
MUST have exactly one byte representation, or signatures become coin flips and
the failures look like key problems.

1. **Objects** — keys sorted ascending by UTF-16 code unit (JavaScript's default
   sort), serialized `{"k":v,...}`, no whitespace.
2. **`undefined`** — a key whose value is `undefined` is **omitted**. A key whose
   value is `null` is **kept**. Absence and emptiness are different facts.
3. **Arrays** — order preserved, never sorted. Order is data here: rule
   ordinals, price history, attack results. `undefined` inside an array becomes
   `null`, because omitting it would shift every later index.
4. **Strings** — Unicode NFC, then JSON string escaping.
5. **Numbers** — MUST be finite. `NaN` and `Infinity` throw rather than silently
   becoming `null`. Money is always an integer number of cents.
6. **Booleans** — literal `true` / `false`.
7. **Dates** — rejected. Callers pass ISO-8601 strings, so the thing signed is
   the thing a reader reconstructs.
8. **Output** — UTF-8 bytes.

`canonVersion` is `sg-canon-1`. It is carried on every receipt so a record
signed under an older scheme is identifiable rather than silently invalid.

### 2.1 Test vectors

Generated from the reference signer. A conforming implementation MUST reproduce
these exactly.

| case | canonical form | sha-256 (first 16) |
|---|---|---|
| empty object | `{}` | `44136fa355b3678a…` |
| key ordering | `{"C":3,"a":2,"b":1}` | `27e01c26743085bf…` |
| null kept, undefined dropped | `{"kept":null}` | `7d426c28974164d6…` |
| array order preserved | `{"xs":[3,1,2]}` | `34cf5d58bf597197…` |
| NFC normalization | `{"v":"Café"}` | `296e013f9d12c5e1…` |
| large integer | `{"v":9007199254740991}` | `210e9afd5b97d466…` |
| nested, unsorted at every depth | `{"a":[1,{"q":null}],"z":{"a":{"b":false,"c":true},"y":1}}` | `acc8a989c9c26951…` |

The NFC case is the one most often got wrong: the input is `"Café"`
(decomposed), and the canonical form is the composed `"Café"`.

---

## 3. Receipts

A receipt binds a record to a predecessor and to a key.

```
Receipt {
  canonVersion : string     // "sg-canon-1"
  prevDigest   : hex-64     // predecessor, or 64 zeroes at genesis
  digest       : hex-64     // sha-256 over the canonical PAYLOAD below
  signature    : base64|null // Ed25519 over the same bytes; null = unattested
  keyId        : string|null
}
```

The signed payload is:

```
{ canonVersion, prevDigest, record }
```

**`prevDigest` is inside the payload, not beside it.** If it sat outside, an
attacker could relink records into a different order and every signature would
still verify.

A receipt with `signature: null` is **UNATTESTED**, not invalid. A record
written before signing existed is not a forgery, and conflating the two is the
same mistake as conflating zero with unknown.

---

## 4. Records and claims

### 4.1 Action records

Chained. Each links to its predecessor by `prevDigest`, forming a hash chain
that proves nothing was removed from between two entries.

Chain order is `(createdAt asc, id asc)` — both sides MUST sort identically or
the chain does not reconstruct.

### 4.2 Claims

A claim is a statement *about* a set of records. It is **anchored**, not
sequenced.

```
ClaimEnvelope {
  claimVersion : 1
  claimType    : "ACTIVATION" | "RECONCILIATION" | "ADVERSARIAL"
  claimedAt    : ISO-8601
  ledgerHead   : hex-64      // digest of the last action record at claim time
  subject      : object      // one shape per claimType
}
```

The envelope is signed as the `record` of a receipt whose `prevDigest` **equals
`ledgerHead`**. A verifier MUST check that equality. Without it, `ledgerHead`
would be a display field an attacker could edit freely while the signature still
verified.

**Why anchoring matters:** tamper with any action record and the chain breaks —
and so does every claim anchored at or after it. One tampered node fails
everything downstream, instead of leaving a signed attestation that still
cheerfully verifies against a record that no longer exists.

### 4.3 Claim subjects

Subjects are open — an implementation MAY add fields. Three are defined here.

- **ACTIVATION** — authority was granted after a preview was shown. Carries the
  policy version, the English it compiled from, and the **digest of the preview
  projection a human was actually shown**. `previewDigest: null` is legal and
  means no preview was shown; it MUST NOT be rendered as an empty preview.

- **RECONCILIATION** — the records were compared, in both directions, against a
  payment provider's own book. Carries `status` of `BALANCED` | `DISCREPANT` |
  `UNVERIFIABLE`, the provider identity, and every discrepancy **with
  identifiers**. `UNVERIFIABLE` MUST NOT be reported as balanced: a book that
  could not be read is not an empty book.

- **ADVERSARIAL** — an attack corpus was run. Carries the corpus version **and
  its digest**, per-class tallies, every result, and a citation of the
  reconciliation attestation the headline depends on. A claim of the form "N
  attacks, zero money moved" is a claim about *money* but is computed from
  *records*; without a completeness proof the two are different statements and
  the record MUST say so.

---

## 5. Verification

Given a bundle of records, claims, and a public key:

1. **Records**, in chain order. For each: check `prevDigest` against the running
   expected value (64 zeroes at genesis, unless the bundle is marked `partial`);
   recompute the payload digest; verify the signature. Continue from what each
   record *claims* as its digest, so one break does not cascade.
2. **Claims**, in any order. For each: check `receipt.prevDigest ==
   envelope.ledgerHead`; recompute; verify.
3. **Verdict.** Any `INVALID` or `BROKEN_LINK` fails the bundle.

Four states, never three: `VALID`, `INVALID`, `BROKEN_LINK`, `UNATTESTED`.
`BROKEN_LINK` and `INVALID` are different accusations — relinked versus
rewritten — and a verifier MUST say which.

**A `partial` bundle** (a slice rather than the whole chain) cannot prove nothing
was removed before its first record. It MUST NOT be verified against genesis,
and the verifier MUST say so rather than implying a guarantee it does not have.

---

## 6. What this format does not prove

Stated here because a format that oversells itself is worse than none.

- **Not that a record was true when written.** A signature proves authorship and
  integrity. If the evidence was wrong, the receipt faithfully attests a wrong
  record. The external check is the payment provider's own dashboard.
- **Not that anyone read a preview.** ACTIVATION proves one was computed, shown,
  and consented past. No system can prove attention.
- **Not freshness.** A claim is a statement about a moment. Anchoring makes
  staleness *detectable* — the head moves on — but a verifier holding only a
  bundle cannot know how much later "now" is.
- **Not independence of the issuer.** One key, held by the issuer, no rotation
  and no third-party notary. The whole chain could be rewritten and re-signed,
  and a verifier holding only the bundle could not tell. Closing that needs an
  anchor outside the issuer's control, which is out of scope for version 1 and
  named here rather than implied away.
- **The public key in a bundle is a convenience, not a trust anchor.** It proves
  internal consistency. Proving provenance means comparing `keyId` against a key
  the issuer publishes separately.

---

## 7. Conformance

Two independent implementations are the point. `scripts/verify-receipts.mjs`
re-implements §2 from this description and imports nothing from `lib/`, because
a verifier that shares code with the signer only proves the issuer agrees with
itself.

`lib/attest/verifier-conformance.test.ts` spawns the real verifier as a separate
process against freshly signed bundles — including deliberately awkward records
(decomposed Unicode, nulls beside absent keys, unsorted nested keys, large
integers) and every tamper this document forbids. It is the executable form of
this specification, and it is what catches the two implementations drifting
apart.
