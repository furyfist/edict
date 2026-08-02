import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  FileSignature,
  Gauge,
  GitBranch,
  Landmark,
  Radar,
  ScrollText,
  ShieldCheck,
  Swords,
} from "lucide-react";
import { db } from "@/lib/db/client";
import { railsState } from "@/lib/config/rails";
import { formatCents } from "@/lib/contracts/money";
import type { Cents } from "@/lib/contracts";
import { cn } from "@/app/_lib/cn";
import { AmbientBackdrop } from "@/app/_components/marketing/ambient";
import { ButtonLink } from "@/app/_components/ui/button";
import { Badge } from "@/app/_components/ui/badge";
import { railsChip } from "@/app/_components/shell/rails";

export const dynamic = "force-dynamic";

/**
 * THE ENTRY PAGE.
 *
 * ---------------------------------------------------------------------------
 * WHY THE STATUS CARD HOLDS REAL NUMBERS
 *
 * This is a marketing surface for a product whose entire claim is that its
 * numbers can be checked. Putting invented figures in the hero would undercut
 * the argument before a reader reaches it, so the rail reads the same database
 * the console reads — and renders an em-dash, never a plausible-looking zero,
 * when it cannot.
 *
 * It is the only card on the page with real elevation (`shadow-e3`). At most
 * one level-4 card exists per screen; everything else is flat or lifts on
 * hover.
 * ---------------------------------------------------------------------------
 */

interface Snapshot {
  entries: number | null;
  refusals: number | null;
  authorized: number | null;
  remaining: number | null;
}

async function readSnapshot(): Promise<Snapshot> {
  try {
    const [entries, refusals, mandates] = await Promise.all([
      db.ledgerEntry.count(),
      db.ledgerEntry.count({ where: { outcome: "REFUSED" } }),
      db.mandate.findMany({ select: { capCents: true, remainingCents: true } }),
    ]);

    return {
      entries,
      refusals,
      authorized: mandates.reduce((sum, m) => sum + m.capCents, 0),
      remaining: mandates.reduce((sum, m) => sum + m.remainingCents, 0),
    };
  } catch {
    // Unknown stays unknown. A zero here would be a claim about a database we
    // could not read.
    return { entries: null, refusals: null, authorized: null, remaining: null };
  }
}

export default async function EntryPage() {
  const snapshot = await readSnapshot();
  const { rails } = railsState();
  const chip = railsChip(rails);

  return (
    <div className="bg-background relative min-h-dvh overflow-hidden">
      <AmbientBackdrop />

      <div className="relative mx-auto flex min-h-dvh max-w-[1680px] flex-col px-6 py-5 sm:px-8 lg:px-12">
        <SiteHeader />

        <main className="flex flex-1 flex-col">
          <Hero snapshot={snapshot} railsLabel={chip.label} />
          <Capabilities />
          <HowItWorks />
          <Surfaces />
          <Benefits />
          <CallToAction />
        </main>

        <SiteFooter />
      </div>
    </div>
  );
}

/* ========================================================================== */

function SiteHeader() {
  return (
    <header className="flex items-center justify-between gap-4 py-3">
      <span className="text-section-title text-foreground">Edict</span>

      <nav className="flex items-center gap-1 sm:gap-2" aria-label="Entry">
        <a
          href="#how-it-works"
          className="text-meta text-text-muted hover:text-foreground hidden rounded-md px-2.5 py-1.5 transition-colors sm:inline"
        >
          How it works
        </a>
        <a
          href="#surfaces"
          className="text-meta text-text-muted hover:text-foreground hidden rounded-md px-2.5 py-1.5 transition-colors sm:inline"
        >
          The console
        </a>
        <ButtonLink variant="outline" size="sm" href="/console/refusals">
          What it refused
        </ButtonLink>
        <ButtonLink size="sm" href="/console">
          Open the console
          <ArrowRight aria-hidden />
        </ButtonLink>
      </nav>
    </header>
  );
}

/* ========================================================================== */

function Hero({
  snapshot,
  railsLabel,
}: {
  snapshot: Snapshot;
  railsLabel: string;
}) {
  return (
    <section className="mx-auto grid w-full max-w-[1400px] items-center gap-10 py-16 lg:grid-cols-[minmax(0,1fr)_408px] lg:gap-16 lg:py-24">
      <div>
        <p className="text-label text-text-subtle">
          Delegated, network-enforced authority
        </p>

        <h1 className="text-foreground mt-4 max-w-2xl text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.03em] sm:text-[3.25rem]">
          An agent that cannot exceed its budget — even when it is wrong.
        </h1>

        <p className="text-body text-text-muted mt-6 max-w-xl leading-7">
          A human writes a spending policy in English. It compiles into mandates
          held in a tokenized credential. The agent proposes renewals unattended,
          a deterministic engine adjudicates them, and the payment network
          executes only what is permitted.
        </p>

        <p className="text-body text-foreground mt-4 max-w-xl leading-7">
          The claim is not that the agent is clever. It is that the agent cannot
          exceed its authority even when it is manipulated or compromised.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <ButtonLink size="lg" href="/console">
            Open the console
            <ArrowRight aria-hidden />
          </ButtonLink>
          <ButtonLink variant="outline" size="lg" href="/console/gauntlet">
            <Swords aria-hidden />
            See the attack results
          </ButtonLink>
        </div>

        <div className="text-meta text-text-subtle mt-6 hidden flex-wrap items-center gap-x-4 gap-y-2 sm:flex">
          <span>No wall-clock time in domain logic</span>
          <span aria-hidden>·</span>
          <span>No model in the authorization path</span>
          <span aria-hidden>·</span>
          <span>No update path in the ledger</span>
        </div>
      </div>

      <StatusCard snapshot={snapshot} railsLabel={railsLabel} />
    </section>
  );
}

/**
 * The one elevated card on the page, and the only one carrying live data.
 *
 * `grid-cols-2 divide-x divide-y` draws the four cells with no border maths and
 * no chance of a doubled hairline where two cells meet.
 */
function StatusCard({
  snapshot,
  railsLabel,
}: {
  snapshot: Snapshot;
  railsLabel: string;
}) {
  const cells: Array<{ label: string; value: string | null }> = [
    {
      label: "ledger entries",
      value: snapshot.entries === null ? null : String(snapshot.entries),
    },
    {
      label: "refused",
      value: snapshot.refusals === null ? null : String(snapshot.refusals),
    },
    {
      label: "authorized",
      value:
        snapshot.authorized === null
          ? null
          : formatCents(snapshot.authorized as Cents),
    },
    {
      label: "remaining",
      value:
        snapshot.remaining === null
          ? null
          : formatCents(snapshot.remaining as Cents),
    },
  ];

  return (
    <div className="border-border-strong/70 bg-card shadow-e3 overflow-hidden rounded-xl border">
      <div className="border-border flex items-center justify-between gap-2 border-b px-5 py-4">
        <span className="text-card-title text-foreground">Live state</span>
        <Badge tone={railsLabel === "production" ? "high" : "medium"}>
          {railsLabel}
        </Badge>
      </div>

      <div className="divide-border grid grid-cols-2 divide-x divide-y">
        {cells.map((cell) => (
          <div key={cell.label} className="px-5 py-4">
            <p className="text-label text-text-subtle">{cell.label}</p>
            <p className="text-foreground mt-1 text-[1.65rem] leading-none font-semibold tracking-[-0.03em] tabular-nums">
              {cell.value ?? (
                <span
                  className="text-text-subtle"
                  title="No database connection — this figure was not read."
                >
                  —
                </span>
              )}
            </p>
          </div>
        ))}
      </div>

      <div className="border-border border-t px-5 py-4">
        <p className="text-meta text-text-muted">
          Read from the same database the console reads. Usage data is seeded and
          labelled as such; the enforcement is not.
        </p>
        <Link
          href="/console"
          className="text-info text-meta group mt-3 inline-flex items-center gap-1 hover:underline"
        >
          Open the ledger
          <ArrowRight
            className="size-3.5 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
      </div>
    </div>
  );
}

/* ========================================================================== */

const CAPABILITIES = [
  {
    icon: ScrollText,
    title: "Policy written in English",
    body: "You write a sentence. It compiles into rules, each one quoting the exact span of your sentence it came from. Nothing enforces anything it cannot quote back to you.",
  },
  {
    icon: ShieldCheck,
    title: "Enforcement outside the application",
    body: "The amount ceiling lives in the tokenized credential, not in our code. Bypass our policy engine entirely and the charge is still declined — by somebody else's infrastructure.",
  },
  {
    icon: FileSignature,
    title: "A ledger you can verify offline",
    body: "Every entry is signed and hash-linked to the one before it. Export the chain and run the verifier with this application closed. None of our code is required to believe the answer.",
  },
  {
    icon: Gauge,
    title: "Authority you can see the size of",
    body: "Remaining budget is a depleting bar per vendor. An abstract security property becomes a physical quantity, and a ceiling you can see reads as safe in a way prose never does.",
  },
  {
    icon: Radar,
    title: "Two-sided reconciliation",
    body: "Append-only proves nothing was altered. Only comparing both books proves nothing was hidden — and a book that could not be read is reported as unverifiable, never as balanced.",
  },
  {
    icon: Swords,
    title: "A standing adversarial measurement",
    body: "A frozen corpus of attacks aimed at every defence in the architecture, run unattended into a signed record. The difference between an anecdote and a number.",
  },
];

function Capabilities() {
  return (
    <Band
      eyebrow="What it does"
      title="Six properties, none of which depend on the model behaving."
    >
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {CAPABILITIES.map(({ icon: Icon, title, body }) => (
          <article
            key={title}
            className={cn(
              "border-border/70 bg-card/95 shadow-e1 h-full rounded-lg border p-5",
              "transition-[transform,box-shadow,border-color,background-color]",
              "duration-[var(--duration-hover)] ease-[var(--ease-standard)]",
              "hover:border-border-strong/70 hover:bg-card hover:shadow-e3 hover:-translate-y-1",
            )}
          >
            <span className="bg-accent-subtle text-primary flex size-9 items-center justify-center rounded-md">
              <Icon className="size-4" aria-hidden />
            </span>
            <h3 className="text-card-title text-foreground mt-4">{title}</h3>
            <p className="text-meta text-text-muted mt-1.5 leading-5">{body}</p>
          </article>
        ))}
      </div>
    </Band>
  );
}

/* ========================================================================== */

const STEPS = [
  {
    title: "You write the policy",
    body: "One paragraph of English. It compiles into rules and is rehearsed against every renewal currently on your books before it governs anything.",
  },
  {
    title: "You read what it would do",
    body: "The preview shows which renewals would auto-execute, which would come to you, and which would be refused. Only then can the authority be granted.",
  },
  {
    title: "The agent proposes, unattended",
    body: "It reads vendor mail and usage, and proposes an action. It has no import path to the payment adapter, the ledger, or the database — checked transitively on every build.",
  },
  {
    title: "The engine adjudicates, deterministically",
    body: "No clock, no randomness, no model. Missing evidence and unmatched rules resolve to approval-required or denial. Unknown is never permission.",
  },
  {
    title: "The network executes what is permitted",
    body: "One module can move money, with one caller. The ceiling is enforced in the credential, so exceeding it is refused outside this application entirely.",
  },
  {
    title: "The ledger records four separate actors",
    body: "Who decided, who authorized, who executed, who recorded. Appended, signed, hash-linked — and correctable only by a new entry referencing the old one.",
  },
];

function HowItWorks() {
  return (
    <Band
      id="how-it-works"
      eyebrow="How it works"
      title="Six steps, and the model appears in exactly one of them."
    >
      <ol className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-4">
            <span
              className="text-label bg-surface-subtle text-text-muted flex size-7 shrink-0 items-center justify-center rounded-full tabular-nums"
              aria-hidden
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <h3 className="text-body-strong text-foreground">{step.title}</h3>
              <p className="text-meta text-text-muted mt-1 leading-5">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Band>
  );
}

/* ========================================================================== */

const SURFACES = [
  {
    href: "/console",
    title: "Ledger",
    body: "What the agent did, most recent first, each entry expanding into its evidence and its receipt.",
  },
  {
    href: "/console/authority",
    title: "Authority",
    body: "The leash: remaining budget per vendor, the kill switch, and whether the books balance.",
  },
  {
    href: "/console/gauntlet",
    title: "Gauntlet",
    body: "The scoreboard. Attacks run, defended, breached, and cents moved outside authority.",
  },
];

/**
 * Deliberately dashed placeholders rather than screenshots.
 *
 * A screenshot on a marketing page ages into a lie the first time the interface
 * changes. A dashed frame says "this is the shape of a surface you can go and
 * look at right now", and the link beside it is the honest version of the same
 * promise.
 */
function Surfaces() {
  return (
    <Band
      id="surfaces"
      eyebrow="The console"
      title="Eight surfaces, each answering exactly one question."
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {SURFACES.map((surface) => (
          <Link
            key={surface.href}
            href={surface.href}
            className="group border-border bg-card hover:border-border-strong/70 hover:shadow-e2 flex flex-col rounded-lg border p-4 transition-[box-shadow,border-color] duration-[var(--duration-hover)]"
          >
            <div
              className="border-border bg-surface-subtle/60 flex aspect-[16/10] items-center justify-center rounded-md border border-dashed"
              aria-hidden
            >
              <span className="text-label text-text-subtle">
                {surface.title}
              </span>
            </div>
            <h3 className="text-card-title text-foreground mt-4">
              {surface.title}
            </h3>
            <p className="text-meta text-text-muted mt-1.5 flex-1 leading-5">
              {surface.body}
            </p>
            <span className="text-info text-meta mt-3 inline-flex items-center gap-1">
              Open
              <ArrowRight
                className="size-3.5 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </span>
          </Link>
        ))}
      </div>
    </Band>
  );
}

/* ========================================================================== */

const ACTORS = [
  { role: "who decided", body: "The policy version and the rule that matched." },
  { role: "who authorized", body: "The mandate, by its identifier at Prava." },
  { role: "who executed", body: "The charge, findable in the network's own dashboard." },
  { role: "who recorded", body: "The signing key, and the digest it linked to." },
];

function Benefits() {
  return (
    <Band
      eyebrow="Why it holds"
      title="Every action names four separate actors."
      description="Accountability that survives a hostile reader is accountability that names who did what, in terms somebody outside this application can go and check."
    >
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border sm:grid-cols-4">
        {ACTORS.map((actor) => (
          <div key={actor.role} className="bg-card px-5 py-4">
            <dt className="text-label text-text-subtle">{actor.role}</dt>
            <dd className="text-meta text-text-muted mt-1.5 leading-5">
              {actor.body}
            </dd>
          </div>
        ))}
      </dl>

      <div className="border-border bg-card mt-3 flex flex-wrap items-start gap-4 rounded-lg border p-5">
        <Landmark className="text-text-subtle mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-body text-foreground">
            A useful review question for any change to this system:{" "}
            <em>does this give the language model a path to money that did not
            exist before?</em>
          </p>
          <p className="text-meta text-text-muted mt-1.5">
            Anything other than a flat no is a rejection — and the module graph,
            not a prompt, is what answers it.
          </p>
        </div>
      </div>
    </Band>
  );
}

/* ========================================================================== */

function CallToAction() {
  return (
    <section className="mx-auto w-full max-w-[1400px] py-16 lg:py-24">
      <div className="border-border-strong/70 bg-card shadow-e2 flex flex-col items-start gap-6 rounded-xl border p-8 sm:p-10 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <h2 className="text-display text-foreground">
            Try to break it. That is what the console is for.
          </h2>
          <p className="text-body text-text-muted mt-2 leading-7">
            Plant your own injection, advance the clock, and run the same
            endpoint the cron calls. Then bypass the policy engine and watch the
            charge get declined anyway.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-3">
          <ButtonLink size="lg" href="/console/attack">
            Open the attack console
            <ArrowRight aria-hidden />
          </ButtonLink>
          <ButtonLink variant="outline" size="lg" href="/console/policy">
            Write a policy
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

/* ========================================================================== */

function SiteFooter() {
  return (
    <footer className="border-border border-t py-8">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-md">
          <p className="text-body-strong text-foreground">Edict</p>
          <p className="text-meta text-text-muted mt-1.5 leading-5">
            Payments run against a sandbox — no real money moves. Vendor names
            and list pricing are real; seat counts and usage are seeded for the
            demonstration and labelled as such in the interface.
          </p>
          <p className="text-meta text-text-subtle mt-2 leading-5">
            Receipts prove integrity, not truth. A signature shows a record was
            written by the keyholder and has not been altered since — it does not
            show the record was correct when written.
          </p>
        </div>

        <nav className="flex flex-col gap-2" aria-label="Footer">
          {[
            { href: "/console", label: "Ledger" },
            { href: "/console/refusals", label: "Refusals" },
            { href: "/console/policy", label: "Policy" },
            { href: "/console/gauntlet", label: "Gauntlet" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-meta text-text-muted hover:text-foreground transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-col gap-2">
          <a
            href="/api/receipts?download=1"
            className="text-meta text-text-muted hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
          >
            <BookOpenText className="size-3.5" aria-hidden />
            Export the receipt chain
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="text-meta text-text-muted hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
          >
            <GitBranch className="size-3.5" aria-hidden />
            Source
          </a>
        </div>
      </div>
    </footer>
  );
}

/* ========================================================================== */

/** One page section. Every band on the entry page uses this rhythm. */
function Band({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="border-border mx-auto w-full max-w-[1400px] border-t py-16 lg:py-24"
    >
      <p className="text-label text-text-subtle">{eyebrow}</p>
      <h2 className="text-foreground mt-3 max-w-2xl text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] sm:text-[2rem]">
        {title}
      </h2>
      {description ? (
        <p className="text-body text-text-muted mt-3 max-w-xl leading-7">
          {description}
        </p>
      ) : null}
      <div className="mt-10">{children}</div>
    </section>
  );
}
