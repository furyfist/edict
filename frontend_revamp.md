# ATC Operator Console — Design System Teardown

A reverse-engineered, portable specification of the design language in `web/`.
Written so a developer or an agent can rebuild a frontend with the same quality
and character **without seeing this repository**.

Everything below is derived from the shipped code. Where the source-of-truth spec
(`docs/FRONTEND_RFC.md` §7) and the implementation disagree, the code wins and the
disagreement is named explicitly under "Spec-vs-code drift".

Primary artifacts:

| Concern | File |
|---|---|
| Raw tokens | `web/src/styles/tokens.css` |
| Tailwind theme mapping + type roles | `web/src/styles/tokens.css` (`@theme inline`, `@utility`) |
| Global reset / font loading | `web/src/styles/globals.css` |
| Shell | `web/src/app/AppShell.tsx`, `SidebarNav.tsx`, `TopBar.tsx` |
| Primitives | `web/src/components/ui/*` (shadcn, style `radix-nova`) |
| Layout atoms | `web/src/components/layout/*` |
| Semantic atoms | `web/src/components/domain/*` |
| Tone map (single source of colour meaning) | `web/src/lib/risk.ts` |

---

## 1. Overall design philosophy

### 1.1 The one-line thesis

> **Trustworthy infrastructure.** Calm, precise, and quiet enough that the one
> alarming thing on screen is unmistakably alarming.

Every other rule in this document is downstream of that sentence. This is a
governance console: a human decides whether an autonomous agent is allowed to
run a destructive command. The UI's job is to make the *cost of a decision*
legible in under five seconds and to never cry wolf.

### 1.2 Visual style

- **Light, near-white, hairline-driven.** Background `#FCFCFD`, surfaces pure
  white, separated by 1px `#E8EAED` borders. Almost nothing floats.
- **Neutral-dominant, colour-scarce.** Roughly 90% of the pixel area is one of
  five greys. Colour is *reserved for meaning* — risk, status, decision — never
  for branding or decoration.
- **Monospace as a semantic device.** Machine facts (ids, tools, SQL, paths,
  policy hashes, rule ids) always render in JetBrains Mono; human prose always
  renders in Inter. That distinction is itself information, not styling.
- **Flat by default.** The default elevation is `e0` = flat + 1px border. Shadows
  exist (`e1/e2/e3`) but appear in only ~9 places in the entire app, all of them
  overlays or the marketing entry page.
- **Chips, not fills.** Every semantic badge is *tinted background + coloured
  text + 1px coloured border at 40% opacity*. There are no saturated colour
  blocks in the console.

### 1.3 Design principles (extracted, in priority order)

1. **One question per screen.** Every page header carries a literal question as
   its description: "What requires my attention?", "What decision do I need to
   make?", "Which agents are healthy?", "Is the new policy safer?", "Is the pager
   actually working?" (`OverviewPage.tsx:15`, `ApprovalsPage.tsx:20`,
   `FleetPage.tsx:16`, `DiffDetailPage.tsx:37`, `NotificationsPage.tsx:29`.)
2. **Never fabricate a value.** Unknown renders as an em-dash `—` with a tooltip
   explaining why, never as `0`. See `RiskScoreTile.tsx` ("Awaiting next
   heartbeat"), `PolicyVersionTag.tsx`, `ArgsBlock.tsx`.
3. **Colour is never the only signal.** Every risk badge carries its text label;
   every heartbeat dot has adjacent time text; the diff matrix uses tint *and*
   number.
4. **Motion communicates state change; it never decorates.** Exactly one element
   in the console is permitted to animate on arrival: the pending-approvals badge
   (`animate-badge-pulse`, one shot, 600ms).
5. **Destructive is asymmetric.** Deny is one click. Approving an *irreversible*
   action requires a typed confirmation string (`DecisionButtons.tsx:83`,
   `typedConfirmation="APPROVE"`). The guarded path is the *approve* path — the
   inverse of every other approval tool.
6. **Empty is often the good state.** The all-quiet approvals state is written to
   reassure, not to apologise: *"No calls are being held. Every risky tool call
   from the fleet is intercepted here before it executes."*
7. **Every state is explicit.** A list renders exactly one of five states:
   loading / empty-no-data / empty-no-matches / error / data. `EmptyState`
   requires a `variant` prop precisely so "no data yet" can never be conflated
   with "no matches for your filter".
8. **Deep-linkability is mandatory.** Drawers, tabs, and filter sets are all real
   URLs (`routes.tsx`, `useUrlFilters.ts`). Nothing important lives in component
   state.
9. **Delegate rather than duplicate.** No charts, no trace waterfalls. Where a
   time series is the answer, the UI renders `Open in SigNoz ↗` and gets out of
   the way. Refusing scope is a design decision, and it shows.

### 1.4 Why it feels clean

- **Exactly one border colour** at rest (`--border #E8EAED`) and one stronger
  variant for inputs (`--border-strong #D6D9DE`). No mixed-weight dividers.
- **No shadow stacking.** Cards at rest have zero shadow. There is no "card on
  card on shadow" pile-up that makes most dashboards feel muddy.
- **Named typography roles instead of ad-hoc sizes.** Nine `@utility` classes
  (`text-display` … `text-stat`). A component *never* writes
  `text-sm leading-5 font-semibold tracking-tight`; it writes `text-body-strong`.
  This is the single largest contributor to the app's visual consistency.
- **Tone mapping is centralised.** `lib/risk.ts` maps every domain enum
  (risk level / severity / action status / replay decision) to one of eight tones,
  and `TONE_CLASSES` maps tone → Tailwind triple. Five different badge components
  therefore *cannot* drift from each other.
- **Fixed information order.** The approval card is always WHO → WHAT → WHY HELD →
  COST → CLOCK → DECISION. The incident dossier is always seven blocks in one
  order. Repetition across records makes scanning free.

### 1.5 Why it feels modern

- Tailwind v4 CSS-first theming (`@theme inline`, `@utility`) — no JS config file.
- Radix primitives with `data-slot` / `data-state` attribute styling rather than
  className juggling.
- Variable Inter, self-hosted, with negative tracking on large type
  (`-0.02em` display, `-0.01em` section title) — the current "product-grade sans"
  signature.
- `tabular-nums` on every changing number, so counters never jitter.
- Pill badges (`rounded-4xl` on a 20px-tall element), 10–14px radii on
  containers, 3px translucent focus rings.
- Command palette (`⌘K`) with prefix modes, live-connection indicator, pause-live
  toggle — the current vocabulary of operational tools (Linear/Vercel/Sentry).

### 1.6 Target user persona

A **single on-call operator or platform engineer**, on a desktop, watching a
system that acts without them. They are: interrupt-driven, time-pressured,
keyboard-first, and accountable for what they approve. They read the same screen
dozens of times a day.

Design consequences that follow directly:
- Density over decoration; no onboarding fluff, no illustrations.
- Every list is keyboard-navigable; `⌘1–7` jump to sections; `?` shows shortcuts.
- Live updates can be **paused** so a list stops reordering under the cursor
  mid-read (`TopBar.tsx:28`) — a pure operator affordance.
- Absolute timestamps always available in a tooltip behind relative ones.
- Copy buttons on every id (trace ids, policy hashes) because operators paste
  into Slack and tickets.

### 1.7 Information hierarchy

Four levels, applied identically on every page:

| Level | Mechanism | Example |
|---|---|---|
| L1 Page identity | `text-display` (24/32/600/-0.02em) + question subtitle, `pb-6` | `PageHeader` |
| L2 Section | `text-section-title` (18/26/600/-0.01em), `pb-3` | `Section` |
| L3 Card / row title | `text-card-title` (15/22/600) or `text-body-strong` (14/21/550) | `ApprovalCard` tool name |
| L4 Metadata | `text-meta` (13/19/400) in `--text-muted`, `text-label` (11/16/600/0.06em uppercase) in `--text-subtle` | timestamps, key labels |

The *hero exception*: `text-stat` (30/34/600, tabular-nums) is used only inside
`StatTile`. A number rendered at 30px against 11px uppercase labels is the
loudest thing in the layout — that's the intended reading order on dashboards.

### 1.8 Density: compact, but not cramped

This is a **compact** system with generous *vertical grouping*:

- Control heights: button `h-8` (32px) default, `h-7` (28px) `sm`, input `h-8`,
  select trigger `h-8`/`h-7`, badge `h-5` (20px), top bar `h-14` (56px).
- Table rows 44px (`DataTable.ROW_HEIGHT_PX`), header 40px (`h-10`).
- Sidebar nav item `px-2 py-1.5` → 30px tall, `gap-0.5` (2px) between items.
- But: sections on a page are separated by `gap-8` (32px), dossier blocks by
  `gap-6` (24px), card interiors are a comfortable `p-4` (16px).

The rule is: **tight inside a component, generous between components.**

### 1.9 How whitespace is used

- **Whitespace is the divider.** Section separation is achieved with `gap-6`/
  `gap-8`, not with `<Separator>`. The console renders almost no horizontal rules;
  the only structural borders are the sidebar edge, the top-bar bottom, the table
  frame, and card outlines.
- **Asymmetric header spacing.** `PageHeader` uses `pb-6` (24px) below and zero
  above; `Section` uses `pb-3` (12px). Headings sit close to their content and
  far from what precedes them — classic proximity grouping.
- **Empty states get `py-12`** (48px) — deliberately airy, because an empty state
  is usually the good state here.
- **The 4px micro-scale does real work**: `mt-1`, `mt-1.5`, `mt-0.5` are used to
  attach a caption to its owner (label→value, value→delta, field→hint). 25 uses
  of `mt-1.5` alone.

### 1.10 Visual rhythm

The page rhythm is a repeating three-beat: **title (18px semibold) → 12px gap →
content block → 32px gap**. Because `Section` is one component used everywhere,
that rhythm is literally impossible to break by accident.

Inside components the rhythm is `gap-2` (8px) — 63 uses, by far the most common
spacing value in the codebase. Chip clusters step down to `gap-1.5` (6px); card
lists step up to `gap-3` (12px); stat grids to `gap-4` (16px).

### 1.11 Consistency rules (the enforcement mechanisms)

1. shadcn files in `components/ui/` are **never hand-edited**. Variants are added
   via `cva` in sibling files so `npx shadcn add` stays non-destructive.
2. Typography is only ever applied through the nine `@utility` role classes.
3. Semantic colour is only ever applied through `TONE_CLASSES` in `lib/risk.ts`.
4. Every page starts with `<PageHeader>`; every content group is a `<Section>`;
   every detail panel is a `<KeyValueGrid>`.
5. Feature folders may import from `components/`, `hooks/`, `lib/` — **never from
   another feature**. Cross-feature needs get promoted to `components/domain/`.
6. No dependency without a written justification (see §14).

---

## 2. Layout system

### 2.1 Two distinct page archetypes

The app has **two shells**, not one:

**A. The console shell** (`AppShell.tsx`) — everything under `/console`:

```
┌───────────┬──────────────────────────────────────────────┐
│           │  TopBar            h-14, border-b, px-6      │
│ Sidebar   ├──────────────────────────────────────────────┤
│ w-60      │  ConnectionBanner  (conditional, py-1.5)     │
│ border-r  ├──────────────────────────────────────────────┤
│ h-full    │  <main> flex-1 overflow-y-auto px-6 py-6     │
│           │    <ErrorBoundary><Outlet/></ErrorBoundary>  │
└───────────┴──────────────────────────────────────────────┘
```

```tsx
// AppShell.tsx
<div className="flex h-screen w-full overflow-hidden">
  <SidebarNav pendingCount={pending?.length} />
  <div className="flex min-w-0 flex-1 flex-col">
    <TopBar onOpenSearch={() => setOpen(true)} />
    <ConnectionBanner />
    <main className="flex-1 overflow-y-auto px-6 py-6">…</main>
  </div>
  <Toaster /> <CommandPalette /> <ShortcutsSheet />
</div>
```

Three details worth stealing verbatim:
- `h-screen` + `overflow-hidden` on the outer flex: **only `<main>` scrolls.**
  The sidebar and top bar never scroll away.
- `min-w-0` on the content column: without it, a wide table forces the flex child
  to overflow and blows out the sidebar. This is the single most common layout
  bug in sidebar apps.
- Global overlays (`Toaster`, `CommandPalette`, `ShortcutsSheet`) mount once at
  the shell, never per page.

**B. The entry / marketing shell** (`EntryPage.tsx`) at `/`:

```tsx
<div className="relative min-h-screen overflow-hidden bg-background">
  <div className="pointer-events-none absolute inset-0 overflow-hidden"> … ambient layers … </div>
  <div className="relative mx-auto flex min-h-screen max-w-[1680px] flex-col px-8 py-4 lg:px-12 lg:py-5">
    <header …/>
    <div className="mx-auto grid w-full max-w-[1400px] flex-1 items-center gap-10
                    lg:grid-cols-[minmax(0,1fr)_408px] lg:gap-16">
```

An asymmetric two-column hero: fluid left column, **fixed 408px right rail**
holding a live status card. `minmax(0,1fr)` (not `1fr`) is what stops long
content from expanding the left track.

### 2.2 Content width

| Context | Constraint |
|---|---|
| Console `<main>` | **Unbounded** — `px-6` gutters only |
| Entry outer | `max-w-[1680px]`, `px-8` → `lg:px-12` |
| Entry inner grid | `max-w-[1400px]` |
| Hero copy | `max-w-2xl` (heading), `max-w-xl` (paragraph) |
| Forms & Settings | `max-w-lg` (32rem) — `SettingsPage.tsx:38`, `ReplayLaunchForm.tsx:107` |
| Empty-state description | `max-w-sm` |
| Tooltip | `max-w-xs` |
| Popover | `w-72` default, `w-64` for the operator identity popover |
| Sheet/drawer | `w-3/4`, `sm:max-w-sm` |
| Dialog | `max-w-[calc(100%-2rem)]`, `sm:max-w-sm` |
| Table viewport | `maxHeight: 560px`, sticky header |

> **Drift note.** The RFC specifies a 1440px page max-width and an 880px reading
> column for detail pages. Neither is implemented — console pages are full-width.
> On a 27" monitor the incident dossier's `KeyValueGrid` stretches to ~2000px.
> **If you port this system, add a `max-w-[1440px] mx-auto` wrapper in `<main>`
> and a `max-w-[880px]` variant for prose/detail routes.**

### 2.3 Padding rules

| Element | Padding |
|---|---|
| `<main>` | `px-6 py-6` (24px) |
| Top bar | `px-6`, `h-14` |
| Sidebar brand row | `px-4 py-4` |
| Sidebar nav container | `px-2` |
| Sidebar nav item | `px-2 py-1.5` |
| Sidebar footer | `px-2 py-3`, `border-t` |
| Card (hand-rolled) | `p-4` |
| Card (shadcn) | `py-(--card-spacing)` with `[--card-spacing:--spacing(4)]`, `sm` size → `--spacing(3)` |
| Dialog / AlertDialog | `p-4`, footer `-mx-4 -mb-4 p-4` |
| Sheet header/footer | `p-4` |
| Popover | `p-2.5` |
| Tooltip | `px-3 py-1.5` |
| Code block (`ArgsBlock`) | `p-3` |
| Empty state | `py-12` |
| Table cell | `px-2` inside a `px-2` row (→ 16px outer inset) |
| Table header cell | `h-10 px-2` |

### 2.4 Margin rules

Margins are used **only for attachment**, never for layout separation (that's
`gap`'s job):

- `mt-0.5` (2px) — value directly under its micro label (`DeltaStat`).
- `mt-1` (4px) — description under a title (`PageHeader`), stat value under label.
- `mt-1.5` (6px) — input under its `<Label>`; the most common margin in forms.
- `mt-2` / `mt-3` (8/12px) — next block inside a card.
- `mb-4` (16px) — under a `FilterBar` or a tab strip.
- `-mb-px` — tab underline overlapping the container border (see §7 Tabs).

### 2.5 Grid system

There is **no 12-column grid**. Layout is Flexbox-first with purpose-built CSS
Grid where a matrix is genuinely needed:

| Use | Classes |
|---|---|
| Stat tiles (overview) | `grid grid-cols-2 gap-4 sm:grid-cols-4` |
| Stat tiles (replay summary, 6 up) | `grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6` |
| Agent cards | `grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3` |
| Adapter cards | `grid grid-cols-1 gap-3 sm:grid-cols-2` |
| Key/value detail | `grid grid-cols-2 gap-x-6 gap-y-3` + `display: contents` on each pair |
| Diff deltas | `grid grid-cols-2 gap-6 sm:grid-cols-4` |
| Decision matrix | `inline-grid grid-cols-4 gap-1` (label column + 3 decisions) |
| Entry metric tiles | `grid grid-cols-2 divide-x divide-y divide-border` |
| Entry summary links | `grid grid-cols-4 gap-px bg-border` (1px hairline grid via gap) |
| DataTable row | inline `gridTemplateColumns: repeat(N, minmax(0,1fr))` |

Two techniques worth stealing:

**`display: contents` for definition lists** — `KeyValueGrid` wraps each
`<dt>/<dd>` pair in a `<div className="contents">` so the pair keys off the
parent grid while keeping valid `<dl>` semantics:

```tsx
<dl className="grid grid-cols-2 gap-x-6 gap-y-3">
  {items.map((item) => (
    <div key={item.label} className="contents">
      <dt className="text-label text-muted-foreground">{item.label}</dt>
      <dd className="text-body text-foreground">{item.value}</dd>
    </div>
  ))}
</dl>
```

**`gap-px` on a coloured parent** to draw a perfect 1px hairline grid without any
border-collapse math (`EntryPage.tsx:476`): `grid grid-cols-4 gap-px bg-border`
with `bg-surface` children.

### 2.6 Responsive behaviour & breakpoints

Only **three** Tailwind breakpoints are used: `sm` (640px), `md` (768px), `lg`
(1024px). No `xl`/`2xl`. The design is desktop-first-in-spirit but coded
mobile-first (base classes are the narrow case).

Observed responsive moves:
- Stat grids: `2 → 4` at `sm`.
- Card grids: `1 → 2` at `sm` `→ 3` at `lg`.
- Entry hero: stacked → `lg:grid-cols-[minmax(0,1fr)_408px]`.
- Entry capability cards: stacked → `md:grid-cols-3`.
- Entry meta badges: `hidden … sm:flex`.
- Sidebar `⌘N` hints: `hidden lg:inline`.
- Hero type: `text-[3rem] → sm:text-[3.5rem]`.
- Inputs: `text-base md:text-sm` — 16px on mobile prevents iOS auto-zoom, 14px on
  desktop. Do not remove this.

> **Drift note.** The sidebar is a fixed `w-60` and **never collapses**. The RFC
> specifies collapse-to-64px, and `SettingsContext` even persists a
> `sidebarCollapsed` flag — but nothing reads it and no collapse UI exists. Below
> ~640px the sidebar consumes 37% of the viewport. **If porting, implement the
> collapse (icon-only rail at `w-16`) or hide the sidebar behind a `Sheet` under
> `lg`.**

### 2.7 Container sizing summary

```
Sidebar          240px (w-60), fixed, shrink-0
Top bar           56px (h-14), fixed, shrink-0
Entry right rail 408px, fixed
Table viewport   560px max height
Table row         44px
Table header      40px
Badge             20px (h-5)
Button           24 / 28 / 32 / 36px  (xs / sm / default / lg)
Icon button      24 / 28 / 32 / 36px  (icon-xs / icon-sm / icon / icon-lg)
```

---

## 3. Sidebar analysis

Source: `web/src/app/SidebarNav.tsx` (149 lines, the whole thing).

### 3.1 Structure

```
aside  w-60  h-full  shrink-0  bg-sidebar  border-r border-sidebar-border  flex-col
├─ Brand row       px-4 py-4   "ATC" (text-section-title) + env pill Badge
├─ nav  flex-1 overflow-y-auto px-2
│   └─ per section  mb-4
│       ├─ div  text-label text-text-subtle px-2 pb-1   ("LIVE")
│       └─ ul   flex-col gap-0.5
│           └─ li > NavLink  px-2 py-1.5 rounded-md gap-2
│               ├─ icon   size-4 shrink-0
│               ├─ label  flex-1 truncate
│               ├─ badge  (approvals only, when count > 0)
│               └─ kbd    hidden lg:inline  "⌘1"
└─ footer  border-t  px-2 py-3  gap-2
    ├─ LiveIndicator            (Radio icon + state dot + label)
    └─ OperatorIdentityPopover  (User icon + "operator: himanshu")
```

### 3.2 Width and collapse

- **Expanded: 240px** (`w-60`), `shrink-0` so it never compresses.
- **Collapsed: not implemented.** See the drift note in §2.6. The intended
  behaviour is a 64px icon rail with labels moving to tooltips.

### 3.3 Navigation grouping

Four sections named after **operator intent**, not backend modules:

| Section | Items | Shortcut |
|---|---|---|
| `LIVE` | Overview, Approvals, Fleet | ⌘1 ⌘2 ⌘3 |
| `RECORD` | Activity, Incidents | ⌘4 ⌘5 |
| `POLICY` | Replay Runs, Comparisons | ⌘6 ⌘7 |
| `SYSTEM` | Notifications, Settings | — |

The grouping encodes a mental model: *what needs me now* → *what already
happened* → *is my policy right* → *plumbing*. The two most-used sections sit at
the top; the two least-used at the bottom, without shortcuts. **The absence of a
shortcut is itself a hierarchy signal.**

### 3.4 Section headers

```tsx
<div className="text-label text-text-subtle px-2 pb-1">{section.title}</div>
```

11px / 600 / `0.06em` tracking / uppercase, in the *lightest* text colour
(`#8B93A1`). `px-2` aligns the label's text edge with the nav item's text edge
(both have `px-2`), so the left rag is perfect. `pb-1` (4px) glues the header to
its group; `mb-4` (16px) separates groups. **This 4px-vs-16px asymmetry is the
entire grouping mechanism — no dividers needed.**

### 3.5 Active / hover / selected state

```tsx
className={({ isActive }) => cn(
  "text-body-strong flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
  isActive
    ? "bg-sidebar-accent text-sidebar-accent-foreground"   // #EEF2FF bg, #3B5BDB text
    : "text-sidebar-foreground hover:bg-sidebar-accent/60", // 60% of the same tint
)}
```

- **Active** = a soft indigo pill (`--accent-subtle #EEF2FF`) with indigo text
  (`--accent #3B5BDB`). No border, no shadow, no bold-weight change.
- **Hover** = the *same* tint at 60% opacity. Hover is literally a preview of
  active — the most under-used trick in nav design and a big part of why this
  feels right.
- Radius `rounded-md` = **10px** (from the token override), on a 30px-tall pill.
- `transition-colors` at the default duration.

> The RFC also specifies a "2px left accent bar" on the active item. Not
> implemented. The tinted pill alone is used. (Adding the bar is a one-line
> `before:` pseudo-element if you want a stronger active cue.)

### 3.6 Icons

Nine icons, one per route, all `lucide-react`, all `size-4` (16px), all
`shrink-0`, all `aria-hidden`:

`Gauge` Overview · `ShieldAlert` Approvals · `Bot` Fleet · `ListChecks` Activity ·
`AlertTriangle` Incidents · `Repeat` Replay Runs · `GitCompare` Comparisons ·
`Bell` Notifications · `Settings` Settings.

Each icon is a **metaphor for the question the page answers**, not for the data
type: `Gauge` = "read the instruments", `ShieldAlert` = "something is being held",
`Repeat` = "run it again offline", `GitCompare` = "A vs B".

### 3.7 Labels

Single words wherever possible ("Overview", "Fleet", "Activity"), title case,
`text-body-strong` (14px / **550** weight). `flex-1 truncate` guarantees a long
label degrades to an ellipsis rather than wrapping or pushing the badge out.

The 550 weight is doing subtle work: it's heavier than body (400) but lighter than
a semibold heading (600), so nav labels read as *navigable* without competing with
page titles.

### 3.8 The live badge (the one animated element)

```tsx
{item.to === "/console/approvals" && pendingCount ? (
  <Badge variant="outline"
    className={cn("bg-risk-medium-bg text-risk-medium border-risk-medium/40",
                  pulsing && "animate-badge-pulse")}>
    {pendingCount}
  </Badge>
) : null}
```

- Amber tinted chip; only rendered when `pendingCount` is truthy — **no `(0)`**,
  and `undefined` (data not loaded) renders nothing rather than a fabricated zero.
- `usePulseOnIncrease()` compares the previous count and fires a **600ms one-shot
  ring** only when the number *goes up*:

```css
@keyframes badge-pulse {
  0%   { box-shadow: 0 0 0 0 var(--risk-medium); }
  100% { box-shadow: 0 0 0 6px transparent; }
}
```

This is the *only* arrival animation in the product. Its scarcity is what makes
it work.

### 3.9 Keyboard hints

```tsx
<kbd className="text-text-subtle text-meta hidden lg:inline">⌘{item.shortcut}</kbd>
```

Unstyled (no border/background) in the lightest colour — present for discovery,
invisible for scanning. Hidden below `lg` because the shortcut isn't usable there
anyway.

### 3.10 Divider usage

Exactly **two** borders in the sidebar: the right edge (`border-r`) and the
footer's `border-t`. Section separation is pure whitespace. That restraint is why
the sidebar reads as one calm surface.

### 3.11 Footer

`LiveIndicator` (a `Radio` icon + a 6px state dot + label, with a tooltip showing
last-event time) and `OperatorIdentityPopover` (a full-width button that opens a
`w-64` popover to set the audit attribution name). Both `text-meta` in muted grey
— present, never loud.

### 3.12 Why it feels good

1. Hover is a 60% preview of active — continuous, not a different visual language.
2. Only two dividers; grouping is done with 4px/16px spacing asymmetry.
3. Icon column, label column, and badge/shortcut column form three perfect
   vertical rails via `gap-2` + `flex-1 truncate` + `shrink-0`.
4. Everything is `text-meta`/`text-label` grey except the *labels* and the *one*
   amber badge. The eye lands where the work is.
5. `bg-sidebar` is aliased to `--bg` (`#FCFCFD`), i.e. **the sidebar is the same
   colour as the app background** — separated only by a hairline. No slab of
   contrasting grey. This is the biggest single reason it feels light.

---

## 4. Colour system

All tokens are plain CSS custom properties in `:root`
(`web/src/styles/tokens.css`), then aliased into Tailwind's namespace via
`@theme inline`.

### 4.1 Raw palette (copy this block verbatim)

```css
:root {
  /* neutrals */
  --bg:              #fcfcfd;   /* app background, and the sidebar */
  --surface:         #ffffff;   /* cards, panels, popovers */
  --surface-subtle:  #f7f8fa;   /* table headers, code blocks, inset rows, hover */
  --border:          #e8eaed;   /* every hairline, everywhere */
  --border-strong:   #d6d9de;   /* inputs, focused containers */
  --text:            #12141a;   /* primary text */
  --text-muted:      #5f6672;   /* secondary text */
  --text-subtle:     #8b93a1;   /* tertiary: labels, disabled, placeholders */

  /* accent */
  --accent:          #3b5bdb;   /* primary action, active nav, focus ring */
  --accent-subtle:   #eef2ff;   /* active backgrounds, info tint */

  /* risk (foreground / background pairs) */
  --risk-low:        #2f855a;  --risk-low-bg:    #edf7f0;
  --risk-medium:     #b7791f;  --risk-medium-bg: #fdf6e7;
  --risk-high:       #c53030;  --risk-high-bg:   #fdf0f0;

  /* semantic aliases */
  --success:         #2f855a;
  --warn:            #b7791f;
  --danger:          #c53030;
  --info:            #2b6cb0;
}
```

Note the deliberate collapse: `--success === --risk-low`, `--warn ===
--risk-medium`, `--danger === --risk-high`. **Three chromatic hues total** (green,
amber, red) plus two blues (indigo accent, steel info). That's it.

### 4.2 Tailwind theme mapping

```css
@theme inline {
  --font-sans: "Inter Variable", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, Consolas, monospace;

  /* shadcn contract */
  --color-background: var(--bg);              --color-foreground: var(--text);
  --color-card: var(--surface);               --color-card-foreground: var(--text);
  --color-popover: var(--surface);            --color-popover-foreground: var(--text);
  --color-primary: var(--accent);             --color-primary-foreground: #ffffff;
  --color-secondary: var(--surface-subtle);   --color-secondary-foreground: var(--text);
  --color-muted: var(--surface-subtle);       --color-muted-foreground: var(--text-muted);
  --color-accent: var(--accent-subtle);       --color-accent-foreground: var(--text);
  --color-destructive: var(--danger);         --color-destructive-foreground: #ffffff;
  --color-border: var(--border);
  --color-input: var(--border-strong);
  --color-ring: var(--accent);

  /* sidebar contract */
  --color-sidebar: var(--bg);
  --color-sidebar-foreground: var(--text);
  --color-sidebar-primary: var(--accent);      --color-sidebar-primary-foreground: #ffffff;
  --color-sidebar-accent: var(--accent-subtle);--color-sidebar-accent-foreground: var(--accent);
  --color-sidebar-border: var(--border);       --color-sidebar-ring: var(--accent);

  /* direct-access aliases so app code can name tokens semantically */
  --color-surface: var(--surface);        --color-surface-subtle: var(--surface-subtle);
  --color-border-strong: var(--border-strong);
  --color-text: var(--text);              --color-text-muted: var(--text-muted);
  --color-text-subtle: var(--text-subtle);
  --color-accent-subtle: var(--accent-subtle);
  --color-risk-low: …; --color-risk-low-bg: …; /* etc. */
  --color-success: …; --color-warn: …; --color-danger: …; --color-info: …;
}
```

The **two-layer alias design** is the important part: raw semantic tokens
(`--bg`, `--text-muted`) are the vocabulary; the `@theme` block is an *adapter*
that satisfies shadcn's expected names **and** publishes the raw names as
utilities. Adding a dark theme means editing exactly one `:root` block.

### 4.3 The tone map — the single source of colour meaning

`web/src/lib/risk.ts`:

```ts
export type Tone = "neutral"|"low"|"medium"|"high"|"success"|"warn"|"danger"|"info";

export const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-surface-subtle  text-text-muted   border-border",
  low:     "bg-risk-low-bg     text-risk-low     border-risk-low/40",
  medium:  "bg-risk-medium-bg  text-risk-medium  border-risk-medium/40",
  high:    "bg-risk-high-bg    text-risk-high    border-risk-high/40",
  success: "bg-risk-low-bg     text-success      border-success/40",
  warn:    "bg-risk-medium-bg  text-warn         border-warn/40",
  danger:  "bg-risk-high-bg    text-danger       border-danger/40",
  info:    "bg-accent-subtle   text-info         border-info/40",
};
```

Plus four pure functions mapping domain enums → tone:

```ts
riskTone:     LOW→low, MEDIUM→medium, HIGH→high
severityTone: high→high, medium→medium, info→neutral
statusTone:   PENDING→medium, AUTO_ALLOWED→success, APPROVED→success,
              DENIED→danger, EXPIRED→warn
decisionTone: allowed→success, held→medium, denied→danger
```

**This is the highest-leverage idea in the whole system.** `RiskBadge`,
`StatusBadge`, `SeverityChip`, `DecisionChip`, `ReversibilityChip`, `StatTile`
deltas, and `DiffVerdictBanner` all read from it, so a colour decision is made
once and cannot drift.

The badge formula is always the same triple:

> **tinted background + coloured text + 1px coloured border at 40% opacity**

### 4.4 Where each colour actually appears

| Token | Usage sites |
|---|---|
| `--bg` | body, sidebar, top bar |
| `--surface` | cards, popovers, dialogs, sheets, table body |
| `--surface-subtle` | table header, `<pre>` blocks, row hover, neutral chips, dialog footer (`bg-muted/50`), skeletons |
| `--border` | every hairline: card outlines, table grid, sidebar edge, dividers |
| `--border-strong` | `border-input` on inputs/selects/textareas/checkboxes/radios; entry status card outline |
| `--text` | headings, values, primary content, tooltip *background* (inverted) |
| `--text-muted` | descriptions, timestamps, table meta, "operator: …" |
| `--text-subtle` | uppercase micro labels, `—` placeholders, keyboard hints, sort chevrons |
| `--accent` | primary button fill, active nav pill text, focus ring, links |
| `--accent-subtle` | active nav pill bg, info chips, capability-card icon tiles, demo banner |
| `--risk-low/-bg` | LOW risk, approved, allowed, heartbeat <60s, `DecisionMixBar` allowed segment |
| `--risk-medium/-bg` | MEDIUM, PENDING, held, expiring, connection banner, countdown track, heartbeat <180s, non-diagonal matrix cells |
| `--risk-high/-bg` | HIGH, DENIED, quarantined, `CANNOT BE UNDONE`, error state, countdown ≤20s |
| `--info` | external links ("Open in SigNoz"), `undo available` chip, running status |

### 4.5 Hover colours (a very short list)

| Surface | Hover |
|---|---|
| Nav item | `hover:bg-sidebar-accent/60` |
| Table row | `hover:bg-surface-subtle` |
| List row / link row | `hover:bg-surface-subtle` |
| Button `default` | `hover:bg-primary/80` |
| Button `outline` / `ghost` | `hover:bg-muted` (= `--surface-subtle`) |
| Button `secondary` | `hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]` |
| Button `destructive` | `bg-destructive/10 → hover:bg-destructive/20` |
| Text link | `hover:underline` (no colour change) |
| Entry nav text | `transition-colors hover:text-foreground` |
| Entry card | `hover:-translate-y-1 hover:border-border-strong/70 hover:bg-card hover:shadow-e3` |

Note that the **console** almost never changes colour on hover — it changes
*background tint* only. Hover is a whisper.

### 4.6 Why the palette works

1. **Value-first, hue-second.** The five neutrals are spaced by *lightness*
   (`#FCFCFD → #FFFFFF → #F7F8FA → #E8EAED → #D6D9DE`) so structure reads even in
   greyscale. Hue only ever encodes meaning.
2. **Warm-neutral greys.** All neutrals sit slightly blue-cool (`#12141A` is a
   blue-black, `#5F6672` a slate). Against pure white cards this produces a
   "software", not "print", feel — and it harmonises with the indigo accent.
3. **Muted, desaturated semantics.** `#2F855A`, `#B7791F`, `#C53030` are all
   pulled well off primary green/yellow/red. They read as *serious*, not as
   traffic lights. Their backgrounds are ~4% saturation tints — visible, never
   loud.
4. **One accent, used sparingly.** `#3B5BDB` appears on: primary buttons, active
   nav, focus rings, links. Nothing else. It never becomes a brand wash.
5. **Saturated colour is rationed.** The design rule is "saturated red appears at
   most twice per screen" — the `CANNOT BE UNDONE` chip and an active quarantine.
   Everything else is tint.
6. **Contrast is real.** `#12141A` on `#FFFFFF` ≈ 17.6:1. `#5F6672` on `#FFFFFF`
   ≈ 6.3:1. `#C53030` on `#FDF0F0` ≈ 5.4:1. `#B7791F` on `#FDF6E7` ≈ 3.7:1 (the
   weakest pair — see §13).

### 4.7 Dark theme

Explicitly out of scope for v1, but structurally prepared: tokens are *all* in a
single `:root` block, so adding `[data-theme="dark"] { … }` touches one file.
shadcn primitives already ship `dark:` variants throughout. The `Toaster` is
hard-pinned to `theme="light"` (`components/ui/sonner.tsx`) — that's the one line
to change.

---

## 5. Typography

### 5.1 Families

```css
--font-sans: "Inter Variable", system-ui, -apple-system, "Segoe UI", sans-serif;
--font-mono: "JetBrains Mono", ui-monospace, Consolas, monospace;
```

Both **self-hosted** via `@fontsource-variable/inter` and
`@fontsource/jetbrains-mono` (weights 400 and 500 only), imported in
`globals.css`. No Google Fonts, no CDN — the product must work air-gapped, and it
also removes a render-blocking third-party request.

### 5.2 The nine type roles

Defined as Tailwind v4 `@utility` classes so they are composable, purgeable, and
impossible to half-apply:

| Utility | Size | Line-height | Weight | Tracking | Extra |
|---|---|---|---|---|---|
| `text-display` | 24px (1.5rem) | 32px | 600 | −0.02em | page titles |
| `text-section-title` | 18px (1.125rem) | 26px | 600 | −0.01em | section headings |
| `text-card-title` | 15px (0.9375rem) | 22px | 600 | — | card headings |
| `text-body` | 14px (0.875rem) | 21px | 400 | — | default body |
| `text-body-strong` | 14px | 21px | **550** | — | emphasised body, nav labels |
| `text-meta` | 13px (0.8125rem) | 19px | 400 | — | timestamps, captions, hints |
| `text-label` | 11px (0.6875rem) | 16px | 600 | +0.06em | UPPERCASE micro labels |
| `text-mono` | 13px | 20px | 450 | — | `--font-mono`, machine facts |
| `text-stat` | 30px (1.875rem) | 34px | 600 | −0.02em | `tabular-nums` |

Actual usage frequency across `.tsx` files:

```
text-meta         72     text-body-strong  16
text-mono         51     text-section-title 4
text-body         18     text-display       4
text-label        17     text-card-title    4
                         text-stat          1
```

That distribution *is* the design: an operator console is mostly metadata and
machine strings.

### 5.3 Heading hierarchy

| Level | Component | Class | Semantics |
|---|---|---|---|
| H1 | `PageHeader` | `text-display text-foreground` | one `<h1>` per route |
| H2 | `Section` | `text-section-title text-foreground` | `<h2>` |
| H3 | `Card` / drawer titles | `text-card-title` or `text-base font-medium` | `<div>` / Radix Title |
| micro | `KeyValueGrid` `<dt>`, `StatTile` label, table `<th>` | `text-label text-muted-foreground` | — |

`MarkdownView` remaps rendered markdown into the same ladder so server-generated
reports inherit the app's hierarchy:

```tsx
"[&_h1]:text-display [&_h2]:text-section-title [&_h3]:text-card-title [&_code]:text-mono"
```

### 5.4 Paragraph, caption, label styles

- **Paragraph**: `text-body text-muted-foreground` — 14/21, muted. Descriptions
  under headings, hint text under fields.
- **Long-form paragraph**: `text-body … leading-7` (entry hero) — line-height is
  opened from 21px to 28px for reading, not scanning.
- **Caption**: `text-meta text-muted-foreground`, sometimes `leading-5` (20px)
  when the caption wraps (`EntryPage` card descriptions).
- **Micro label**: `text-label text-muted-foreground` (in-content) or
  `text-label text-text-subtle` (sidebar section headers, entry eyebrows). The
  11px/600/+0.06em/uppercase combination is what makes a 30px number look like a
  *metric* rather than just a big number.
- **`<kbd>`**: two treatments — bare (`text-text-subtle text-meta`, sidebar) and
  boxed (`text-mono bg-surface-subtle border-border rounded-sm border px-1.5
  py-0.5`, shortcuts sheet).

### 5.5 Button typography

Buttons deliberately **do not** use the role utilities — they carry their own
scale from `buttonVariants`:

```
default / lg : text-sm     (14px) font-medium
sm           : text-[0.8rem] (12.8px) font-medium
xs           : text-xs     (12px) font-medium
```

`font-medium` (500) rather than 600: buttons are actions, not headings, and 500
at 14px keeps them from competing with `text-body-strong` (550) nav labels.

### 5.6 Letter spacing

Only three values, applied by size:

- `-0.02em` on 24px and 30px (display, stat) — large type must tighten.
- `-0.01em` on 18px (section title).
- `+0.06em` on 11px uppercase (label) — small caps must open.
- `-0.03em` / `-0.04em` on the entry page's 26.4px metric numbers and 48–56px
  hero headline — the same principle pushed further for display sizes.

Nothing between 13px and 15px carries tracking. **Optical tracking by size is one
of the clearest "designed, not defaulted" signals in this codebase.**

### 5.7 Line height

Ratios are ~1.5 for body/meta, tightening as size grows:

```
11px → 16px  (1.45)   18px → 26px  (1.44)
13px → 19px  (1.46)   24px → 32px  (1.33)
14px → 21px  (1.50)   30px → 34px  (1.13)
15px → 22px  (1.47)   48px → 47px  (0.98, `leading-[0.98]` hero)
```

### 5.8 tabular-nums

`font-variant-numeric: tabular-nums` is baked into `text-stat` and applied
manually on the entry page's metric values and summary links. Rule: **any number
that can change while you're looking at it must be tabular** — countdowns, live
counts, latencies. Otherwise digit-width shifts make the layout twitch.

### 5.9 How typography creates hierarchy

Four independent axes are varied *together*, never one alone:

| | Display | Section | Body strong | Body | Meta | Label |
|---|---|---|---|---|---|---|
| Size | 24 | 18 | 14 | 14 | 13 | 11 |
| Weight | 600 | 600 | 550 | 400 | 400 | 600 |
| Colour | `--text` | `--text` | `--text` | `--text` | `--text-muted` | `--text-subtle` |
| Tracking | −.02 | −.01 | 0 | 0 | 0 | +.06 |

Note the two-step drop between `text-body` and `text-meta`: only 1px of size, but
a full colour step. **Colour, not size, is the primary de-emphasis tool here** —
which is why the console can be dense without feeling noisy.

---

## 6. Spacing system

### 6.1 The scale

Strict **4px base**, Tailwind's default (`0.25rem` per step). The permitted
values, in order of actual usage:

| px | Tailwind | Uses | Where |
|---|---|---|---|
| **2** | `0.5` | `gap-0.5`, `mt-0.5` | sidebar item list, label→value attachment |
| **4** | `1` | `gap-1`, `mt-1`, `p-1`, `pb-1` | icon↔text micro gaps, title→description, section header→list |
| **6** | `1.5` | `gap-1.5`, `mt-1.5`, `py-1.5`, `px-1.5` | **chip clusters**, label→input, nav item vertical padding, list row padding |
| **8** | `2` | `gap-2`, `mt-2`, `px-2`, `py-2` | **the default gap** (63 uses); table cell padding; sidebar horizontal padding |
| **10** | `2.5` | `px-2.5`, `p-2.5` | button/input horizontal padding, popover padding |
| **12** | `3` | `gap-3`, `mt-3`, `p-3` | card lists, code blocks, section header→content |
| **14** | `3.5` | `gap-3.5`, `size-3.5` | entry capability grid |
| **16** | `4` | `gap-4`, `p-4`, `mb-4` | **card interior**, stat grids, dialog/sheet padding, nav section separation |
| **20** | `5` | `px-5`, `gap-5` | entry status-card rows |
| **24** | `6` | `gap-6`, `px-6`, `py-6` | **main gutters**, dossier block separation, KeyValueGrid column gap |
| **32** | `8` | `gap-8`, `px-8` | **page section separation**, entry outer gutter |
| **40** | `10` | `gap-10` | entry hero column gap |
| **48** | `12` | `py-12`, `lg:px-12` | empty states |
| **64** | `16` | `lg:gap-16` | entry hero column gap at `lg` |

Values 4/8/12/16/24/32 carry ~85% of all spacing. 6px and 10px exist for the
*small-control* tier (chips, buttons, inputs) where 8px is too loose and 4px too
tight.

### 6.2 The semantic assignment (steal this table)

| Value | Meaning |
|---|---|
| 2px | items in the same repeated list (sidebar links) |
| 4px | a label and the thing it names |
| 6px | sibling chips / a field and its control |
| **8px** | **the default gap between any two related elements** |
| 12px | sibling cards in a vertical stack |
| 16px | inside a card; between cards in a grid; between nav groups |
| 24px | between blocks in a document (dossier panels); page gutters |
| 32px | between top-level page sections |
| 48px | around an empty state |

### 6.3 Component-level spacing constants

```
main gutters        px-6 py-6         (24px)
top bar             h-14 px-6         (56 / 24)
sidebar             w-60, px-2 nav, px-4 py-4 brand, px-2 py-3 footer
nav item            px-2 py-1.5, gap-2, gap-0.5 between
card                p-4, gap-3 to next card
stat grid           gap-4
key/value grid      gap-x-6 gap-y-3
page sections       gap-8
dossier blocks      gap-6
section header      pb-3   (page header pb-6)
chip row            gap-1.5
button internal     gap-1.5 (default) / gap-1 (sm, xs)
badge internal      gap-1
table row           height 44, px-2 outer + px-2 cell
table header        h-10
empty state         py-12, gap-2
form field stack    gap-4, label→input mt-1.5
```

### 6.4 Enforcement

`--card-spacing` is a CSS variable on the shadcn `Card`
(`[--card-spacing:--spacing(4)]`, `data-[size=sm]` → `--spacing(3)`), consumed by
header/content/footer as `px-(--card-spacing)`. Changing card density is a
one-attribute change, and header/body/footer can never drift out of alignment.

---

## 7. Components

Legend for each: **style · radius · shadow · border · padding · hover · focus ·
disabled · loading · animation · reusability**.

Radius values below are the *resolved* pixel values given the token overrides:
`rounded-sm` = 6px, `rounded-md` = 10px, `rounded-lg` = 14px, `rounded-xl` = 12px
(⚠️ see the drift note at the end of this section), `rounded-4xl` = 32px,
`rounded-full` = pill.

---

### 7.1 Cards

There are **two** card implementations. Know which you're using.

**A. Hand-rolled card** (the console default — `ApprovalCard`, `AgentCard`,
`AdapterHealthCard`, `SigNozDelegationCard`):

```tsx
<div className="rounded-lg border border-border bg-card p-4">
```

- Style: flat white on near-white; the 1px hairline *is* the card.
- Radius 14px · **no shadow** · 1px `--border` · `p-4` (16px).
- Hover: none by default. Link cards add `hover:bg-surface-subtle`.
- Reusability: it's three utility classes — copied inline everywhere, deliberately.

**B. shadcn `Card`** (entry page, dialogs) — `components/ui/card.tsx`:

```tsx
"flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card
 py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10
 [--card-spacing:--spacing(4)]
 has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0
 data-[size=sm]:[--card-spacing:--spacing(3)]
 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl"
```

- Uses `ring-1 ring-foreground/10` **instead of a border** — a ring doesn't
  participate in layout, so nested content aligns to the outer edge exactly.
- `overflow-hidden` + `rounded-t-xl`/`rounded-b-xl` on first/last images so media
  bleeds to the card edge without a wrapper.
- Sub-parts: `CardHeader` (a grid with `has-data-[slot=card-action]:grid-cols-[1fr_auto]`
  so an action button auto-docks right), `CardTitle`, `CardDescription`,
  `CardContent`, `CardAction`, `CardFooter` (`border-t bg-muted/50`, and the parent
  auto-drops its bottom padding via `has-data-[slot=card-footer]:pb-0`).

**Elevated card** (entry page hero rail) — the only card in the app with real
depth: `shadow-e3 border border-border-strong/70`.

**Interactive card** (entry capability cards):

```tsx
"h-full gap-3 border border-border/60 bg-card/95 py-4 shadow-e1
 transition-[transform,box-shadow,border-color,background-color]
 duration-[var(--duration-hover)] ease-[var(--ease-standard)]
 hover:-translate-y-1 hover:border-border-strong/70 hover:bg-card hover:shadow-e3"
```

Note: the transition lists **exactly four properties**, never `transition-all`.

---

### 7.2 Buttons

`components/ui/button.tsx`, built with `cva`.

Base:
```
group/button inline-flex shrink-0 items-center justify-center rounded-lg
border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap
transition-all outline-none select-none
focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50
active:not-aria-[haspopup]:translate-y-px
disabled:pointer-events-none disabled:opacity-50
aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20
[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4
```

| Variant | Classes |
|---|---|
| `default` | `bg-primary text-primary-foreground hover:bg-primary/80` |
| `outline` | `border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted` |
| `secondary` | `bg-secondary … hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]` |
| `ghost` | `hover:bg-muted hover:text-foreground` |
| `destructive` | `bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:ring-destructive/20` |
| `link` | `text-primary underline-offset-4 hover:underline` |

| Size | Height | Padding | Icon size |
|---|---|---|---|
| `xs` | 24px | `px-2`, `text-xs` | `size-3` |
| `sm` | 28px | `px-2.5`, `text-[0.8rem]` | `size-3.5` |
| `default` | 32px | `px-2.5`, `gap-1.5` | `size-4` |
| `lg` | 36px | `px-2.5` | `size-4` |
| `icon` / `icon-xs` / `icon-sm` / `icon-lg` | 32 / 24 / 28 / 36px square | — | — |

Behaviours worth copying:
- **`active:translate-y-px`, never `scale`.** A 1px press is physical; a scale is
  cartoonish. `not-aria-[haspopup]` exempts menu triggers (a dropdown opening
  shouldn't feel like a press).
- **Auto-sized icons.** `[&_svg:not([class*='size-'])]:size-4` means you write
  `<Button><Search />Search</Button>` and the icon is correct — no per-call-site
  sizing.
- **Optical padding for icons.** `has-data-[icon=inline-start]:pl-2` /
  `has-data-[icon=inline-end]:pr-2` tightens the side that holds an icon, because
  an icon has more visual air than a glyph.
- **`destructive` is a tinted button, not a red slab** — `bg-destructive/10` with
  destructive text. Solid red is reserved for the confirm-dialog action
  (`bg-danger text-white`).

**Loading state** is textual, not spinner-based:
```tsx
{deny.isPending ? "Denying…" : "Deny"}
{approve.isPending ? "Approving…" : "Approve"}
{isPending ? "Launching…" : "Launch replay run"}
{busy ? "Working…" : confirmLabel}
```
Present-participle + ellipsis, with `disabled={busy}`. This avoids layout shift
and reads better than a spinner on a 28px control.

---

### 7.3 Inputs

```
h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1
text-base transition-colors outline-none placeholder:text-muted-foreground
focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50
disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50
disabled:opacity-50
aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20
md:text-sm
```

- 32px tall, 14px radius, **transparent background** (not white) so an input
  inherits whatever surface it sits on.
- `border-input` = `--border-strong` (`#D6D9DE`) — inputs are the only elements
  with a heavier hairline, which is how they read as "editable".
- `text-base md:text-sm`: 16px on mobile (prevents iOS zoom-on-focus), 14px above.
- `min-w-0` so an input inside a flex row can actually shrink.
- Focus: border turns accent **and** a 3px 50%-opacity accent ring appears. The
  double signal is what makes it visible on both light and tinted surfaces.
- Textarea is identical plus `field-sizing-content min-h-16` — it auto-grows.

Field composition pattern (every form in the app):

```tsx
<div>
  <Label htmlFor="policy_path">Policy path</Label>
  <Input id="policy_path" className="mt-1.5" placeholder="/path/to/risk_rules.yaml"
         {...register("policy_path")} />
  {errors.policy_path ? <p className="text-danger text-meta mt-1">{errors.policy_path.message}</p> : null}
</div>
```

Label → 6px → control → 4px → error. Always.

---

### 7.4 Search

There is **no permanent search input in the chrome**. Search is:

1. A `⌘K` command palette (`cmdk` via `components/ui/command.tsx`) opened from a
   top-bar button that renders its own shortcut hint:
   ```tsx
   <Button variant="outline" size="sm" onClick={onOpenSearch} title="Search">
     <Search aria-hidden /> Search
     <kbd className="text-text-subtle ml-1">Ctrl+K</kbd>
   </Button>
   ```
2. A per-page free-text `Input` inside `FilterBar` (`className="h-8 w-48"`), which
   writes to a URL query param.

The palette has four modes selected by input prefix — none = commands + recent,
`>` = commands only, `#` = jump to a record id, `@` = jump to an agent — and it
**labels its own scope** ("Actions (loaded)", "No matches in loaded records") so
the operator is never misled into thinking it searched full history. That honesty
is a design decision worth copying.

---

### 7.5 Dropdowns / Selects

`SelectTrigger`:
```
flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input
bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors
outline-none select-none
focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50
disabled:cursor-not-allowed disabled:opacity-50
data-placeholder:text-muted-foreground
data-[size=default]:h-8 data-[size=sm]:h-7
```

`SelectContent`:
```
rounded-lg bg-popover shadow-md ring-1 ring-foreground/10 duration-100
max-h-(--radix-select-content-available-height)
origin-(--radix-select-content-transform-origin)
data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95
data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95
data-[align-trigger=true]:animate-none
```

- `ring-1 ring-foreground/10` + `shadow-md` — overlays use a ring, not a border.
- `origin-(--radix-select-content-transform-origin)` makes the zoom animation
  originate from the trigger, so the menu *grows out of* the button.
- `data-[align-trigger=true]:animate-none` — item-aligned menus don't animate,
  because animating a menu that's already positioned over its trigger looks broken.
- `SelectItem` reserves right-side space (`pr-8`) for the check indicator so items
  don't shift when selected.

`FilterBar` uses `<SelectTrigger size="sm" className="w-auto">` so filter chips
size to their content, giving a natural chip-row rhythm.

---

### 7.6 Tabs

Two different tab systems, chosen by whether the tab is a *route*:

**A. Route tabs** (`ReplayRunLayout.tsx`) — hand-rolled, because tabs must be
deep-linkable:

```tsx
<nav className="border-border mb-4 flex gap-1 border-b" aria-label="Run detail tabs">
  <NavLink className={({isActive}) => cn(
    "text-body-strong -mb-px border-b-2 px-3 py-2",
    isActive ? "border-accent text-foreground"
             : "text-muted-foreground border-transparent hover:text-foreground")}
  />
</nav>
```

`-mb-px` pulls the 2px underline over the container's 1px `border-b` so the
active indicator *replaces* the rule instead of sitting under it. That one class
is the difference between "designed" and "close enough".

**B. shadcn `Tabs`** (`components/ui/tabs.tsx`) — two variants:
- `default`: segmented control, `bg-muted` track, `p-[3px]`, active pill gets
  `data-active:bg-background` + `shadow-sm`.
- `line`: transparent track, active indicated by an `after:` pseudo-element bar
  (`after:h-0.5 after:bottom-[-5px]`) that fades in via `after:opacity-0 →
  data-active:after:opacity-100`. Animating opacity, not size, is why it doesn't
  jitter.

---

### 7.7 Tables

Two implementations, again by purpose.

**A. `DataTable`** (`components/data/DataTable.tsx`) — the app's real table.
Deliberately **CSS Grid + ARIA roles, not `<table>`**, so identical row markup
works virtualized or not:

```tsx
<div ref={scrollRef} role="table"
     className="border-border overflow-auto rounded-md border"
     style={{ maxHeight: 560 }}>
  <div role="rowgroup" className="bg-card sticky top-0 z-10">
    <div role="row" className="border-border grid border-b px-2"
         style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
      <div role="columnheader" aria-sort={…}
           className="text-label text-muted-foreground flex h-10 items-center gap-1 truncate px-2 cursor-pointer select-none">
```

Row:
```tsx
<div role="row" tabIndex={0} data-row-index={i}
     className="hover:bg-surface-subtle border-border grid items-center border-b px-2
                focus:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
     style={{ gridTemplateColumns: columnTemplate, height: 44 }}>
  <div role="cell" className="text-body truncate px-2">…</div>
```

Features: TanStack Table sorting (`ArrowUp`/`ArrowDown`/`ChevronsUpDown` at
`size-3`, the idle chevron in `text-text-subtle`), `aria-sort`, sticky header,
`@tanstack/react-virtual` above 200 rows, `ArrowUp`/`ArrowDown`/`Enter` row
navigation via `data-row-index` focus hopping, and a **required `emptyState`
prop** so a caller cannot forget the empty case.

- Radius 10px on the frame; every cell `truncate`; row height fixed at 44px.
- Header is `text-label` (11px uppercase) — headers are labels, not content.

**B. shadcn `Table`** — semantic `<table>` for simple lists
(`th`: `h-10 px-2 text-left font-medium`; `td`: `p-2 align-middle whitespace-nowrap`;
`tr`: `border-b transition-colors hover:bg-muted/50`).

---

### 7.8 Badges & chips

One primitive, `components/ui/badge.tsx`:

```
inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden
rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium
whitespace-nowrap transition-all
has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5
[&>svg]:pointer-events-none [&>svg]:size-3!
```

20px tall, fully pill (`rounded-4xl` = 32px on a 20px element), 12px text at 500,
icons hard-forced to 12px.

Semantic chips are all one line on top of it:

```tsx
export function RiskBadge({ level }: { level: RiskLevel }) {
  return <Badge variant="outline" className={TONE_CLASSES[riskTone(level)]}>{level}</Badge>;
}
```

The chip family (`components/domain/`):

| Chip | Vocabulary | Notes |
|---|---|---|
| `RiskBadge` | LOW / MEDIUM / HIGH | |
| `StatusBadge` | PENDING / AUTO_ALLOWED / APPROVED / DENIED / EXPIRED | live vocabulary |
| `SeverityChip` | high / medium / info | |
| `DecisionChip` | allowed / held / denied | replay vocabulary — **deliberately kept distinct** from `StatusBadge` because conflating two vocabularies misleads |
| `ReversibilityChip` | `⚠ CANNOT BE UNDONE` / `↺ undo available` | the loudest chip; renders **nothing** for the unremarkable REVERSIBLE case |
| `BlastRadiusChip` | `~1,904,221 rows affected` | escalates from neutral to `high` tint above 10,000 rows |
| `RunStatusPill` | running / completed / failed | |

Three transferable rules:
1. **A chip for the default state is noise.** `ReversibilityChip` returns `null`
   for `REVERSIBLE`. Only render a chip when it changes a decision.
2. **Write the consequence, not the enum.** The label is `CANNOT BE UNDONE`, not
   `IRREVERSIBLE`.
3. **Different domains get different vocabularies**, and the type system keeps
   them apart.

---

### 7.9 Dialogs

`Dialog` (informational) and `AlertDialog` (decisional) both:

```
fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)]
-translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm
ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm
data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95
data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95
```

Overlay:
```
fixed inset-0 z-50 bg-black/10 duration-100
supports-backdrop-filter:backdrop-blur-xs
data-open:animate-in data-open:fade-in-0 …
```

- **`bg-black/10`, not `/50` or `/80`.** A 10% scrim plus a tiny backdrop blur
  keeps the page legible behind the dialog. This is a major "premium" tell — most
  apps black out the background and it feels heavy.
- `supports-backdrop-filter:` guards the blur so it degrades cleanly.
- Footer uses negative margins to bleed to the dialog edge:
  `-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4
   sm:flex-row sm:justify-end`. `flex-col-reverse` → `sm:flex-row` puts the
  primary action **last on desktop, top on mobile**, which is correct for both
  platforms' conventions.
- Small dialogs (`sm:max-w-sm` = 384px). Decisions are small; data is not.

**`ConfirmDialog`** (`components/feedback/ConfirmDialog.tsx`) is the app's own
wrapper, and it is where the product's ethics live:

```tsx
<ConfirmDialog
  title={`Approve ${action.tool}?`}
  description={<>This action is classified <strong>irreversible</strong> — once approved,
                 it cannot be undone. It targets <span className="text-mono">{resource}</span>.</>}
  confirmLabel="Approve" destructive busy={isPending}
  typedConfirmation="APPROVE"
/>
```

- `typedConfirmation` disables the confirm button until the exact string is typed.
- The destructive confirm is the **only** solid-red control in the app:
  `bg-danger text-white hover:bg-danger/90`.
- The description is written prose naming the real consequence, with the resource
  in mono. Compare the undo copy: *"This is a real write. It cannot itself be
  undone."*

---

### 7.10 Drawers (Sheet)

`components/ui/sheet.tsx`, Radix Dialog under the hood, `data-side` driven:

```
fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm shadow-lg
transition duration-200 ease-in-out
data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full
data-[side=right]:w-3/4 data-[side=right]:border-l
data-[side=right]:sm:max-w-sm
data-[side=right]:data-open:slide-in-from-right-10
data-[side=right]:data-closed:slide-out-to-right-10
```

- Slides only **10px** (`slide-in-from-right-10` = 2.5rem), combined with a fade.
  A drawer that flies in from off-screen reads as slow; a short slide + fade reads
  as instant.
- Used for `ApprovalDrawer`, `ActionDrawer`, `ShortcutsSheet`.
- Drawers are **overlay routes** (`/console/activity/:actionId`) — the list stays
  mounted underneath, so closing is instant and refetch-free.
- Internal layout: `SheetHeader` `p-4 gap-0.5`, then `flex flex-col gap-6 px-4 pb-4`
  of `<Section>` blocks, then `overflow-y-auto` on the content.

---

### 7.11 Alerts

Three distinct alert treatments, chosen by *persistence semantics*:

**A. `ErrorState`** — retryable, section-scoped:
```tsx
<div className="border-danger/40 bg-risk-high-bg flex flex-col items-start gap-2 rounded-md border p-4">
  <div className="text-danger flex items-center gap-2">
    <AlertTriangle className="size-4" /> <span className="text-body-strong">{message}</span>
  </div>
  {detail ? <p className="text-mono text-foreground/80 whitespace-pre-wrap">{detail}</p> : null}
  <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
</div>
```
The server's error `detail` is rendered **verbatim in mono** — machine text stays
machine text.

**B. `UndoResultAlert`** — persistent, non-dismissible, for the 502
partial-restore case. Same palette, `items-start gap-2 p-3`, icon `mt-0.5
shrink-0` so it optically aligns with the first text line. **A toast would be
wrong here** — an unresolved data-integrity warning must not vanish after 4s.

**C. `ConnectionBanner`** — full-width, ongoing state:
```tsx
<div className="bg-risk-medium-bg text-risk-medium border-risk-medium/40 border-b px-6 py-1.5 text-center text-meta">
```
Amber, `py-1.5` (6px) tall, centred, sits between the top bar and `<main>` so it
pushes content rather than covering it.

Plus shadcn `Alert` (`grid has-[>svg]:grid-cols-[auto_1fr] gap-x-2`, with
`*:[svg]:row-span-2 *:[svg]:translate-y-0.5`) for generic use — note the 2px icon
nudge for optical baseline alignment.

---

### 7.12 Toasts

`sonner`, mounted once in `AppShell`, configured in `components/ui/sonner.tsx`:

```tsx
<Sonner theme="light"
  icons={{ success: <CircleCheckIcon className="size-4"/>, info: …, warning: …,
           error: <OctagonXIcon className="size-4"/>, loading: <Loader2Icon className="size-4 animate-spin"/> }}
  style={{ "--normal-bg": "var(--popover)", "--normal-text": "var(--popover-foreground)",
           "--normal-border": "var(--border)" }} />
```

Toasts inherit app tokens rather than sonner defaults, and all five status icons
are overridden to Lucide at `size-4` so the toast icon set matches the rest of the
app. Usage carries an action:

```tsx
toast(`Undone · ${action.tool}`, {
  action: { label: "View compensation", onClick: () => navigate(paths.action(id)) },
});
```

Policy: 4s default; **destructive/consequential outcomes never auto-dismiss** —
they become persistent alerts instead.

---

### 7.13 Navigation items

Covered in §3. The reusable formula:

```
flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors
+ text-body-strong
+ active   : bg-<accent-subtle> text-<accent>
+ inactive : text-<foreground> hover:bg-<accent-subtle>/60
+ icon size-4 shrink-0 | label flex-1 truncate | trailing shrink-0
```

---

### 7.14 Stat tiles

```tsx
<div className="rounded-md border border-border bg-card p-4">
  <div className="text-label text-muted-foreground">{label}</div>
  <div className="text-stat text-foreground mt-1">{value}</div>
  {delta ? <div className={cn("text-meta mt-1", DELTA_TONE_CLASS[tone])}>{delta}</div> : null}
</div>
```

Three lines, 11px uppercase → 30px tabular number → 13px toned delta, on 4px
attachment margins. `tone` maps through the same `Tone` union as every badge.

Loading is a `Skeleton` of the **exact same height** (`h-24 w-full rounded-md`),
so nothing shifts when data lands — and each tile gates on only *its own* query,
so one slow endpoint never blanks the row (`NeedsAttentionStats.tsx`).

The entry page has a denser variant: a `grid grid-cols-2 divide-x divide-y` where
each cell is `px-5 py-4` with a 26.4px value at `tracking-[-0.03em] tabular-nums`.

---

### 7.15 Charts

**There is no charting library, on purpose.** Three CSS-only visualisations:

**`DecisionMixBar`** — stacked bar from flex children:
```tsx
<div className="flex h-4 w-full overflow-hidden rounded-full">
  {segments.map(seg => <div className={seg.className} style={{width: `${pct}%`}} title={…}/>)}
</div>
// legend: 8px dots + text-meta labels, gap-4
```

**`DecisionChangeMatrix`** — a 3×3 `inline-grid grid-cols-4 gap-1` of 48×64px
buttons; diagonal (no-change) cells are inert `bg-surface-subtle`, off-diagonal
non-zero cells are amber and clickable, zero cells are `opacity-40
cursor-not-allowed`, selection is `ring-ring ring-2`. Clicking a cell filters the
table below.

**`HoldCountdown`** — a depleting track, the product's most important
visualisation:
```tsx
<div className="bg-surface-subtle h-1.5 w-full overflow-hidden rounded-full">
  <div className={cn("h-full rounded-full transition-[width]", urgent ? "bg-risk-high" : "bg-risk-medium")}
       style={{ width: `${pct}%`, transitionDuration: "var(--duration-countdown)" }} />
</div>
```
6px tall, amber → red at ≤20s, driven by **one shared 1s clock** for all cards on
screen (`useSharedClock`), paused while the tab is hidden. The numeric readout is
secondary text underneath. Design note from the RFC: *"a depleting track reads
instantly and numbers create anxiety."*

**`LatencyPercentiles`** — not a chart at all: a `flex gap-6` row of
label/value pairs. Sometimes the right chart is a table.

---

### 7.16 Forms

React Hook Form + zod (`@hookform/resolvers`). Reference:
`ReplayLaunchForm.tsx`.

```tsx
<form onSubmit={handleSubmit(onSubmit)} className="flex max-w-lg flex-col gap-4">
```

- `max-w-lg` (512px) — forms never span the viewport.
- `gap-4` between fields; label → `mt-1.5` → control → `mt-1` → error.
- Errors: `<p className="text-danger text-meta mt-1">`.
- **Server errors map to fields**: a 422/403 from the API is routed into
  `setError("dataset_root", { message: err.detail })` so the server's own message
  lands under the field that caused it.
- **Adaptive controls**: if the chosen adapter reports discovered dataset roots,
  the field renders as a `<Select>`; otherwise as a free-text `<Input>`. The
  control shape follows the data.
- **Radio groups carry explanations**: each option is
  `text-body-strong` label + `text-meta text-muted-foreground` description,
  `items-start gap-2` with the radio nudged `mt-0.5`. Never a bare enum.
- **Advanced fields are collapsed** behind a `Collapsible` with a ghost button
  whose chevron rotates: `<ChevronDown className={advancedOpen ? "rotate-180" : ""} />`.
- Submit: `<Button type="submit" disabled={isPending} className="w-fit">` with
  present-participle label.

---

### 7.17 Skeletons

```tsx
function Skeleton({ className }) {
  return <div data-slot="skeleton" className={cn("animate-pulse rounded-md bg-muted", className)} />
}
```

Pre-shaped variants in `components/feedback/Skeletons.tsx`, each matching the real
component's dimensions exactly:

```tsx
SkeletonRows     → h-11 (44px, = table row) w-full rounded-md, gap-2
SkeletonCards    → h-32 w-full rounded-lg, gap-3
SkeletonStatGrid → grid grid-cols-2 gap-4 sm:grid-cols-4, h-24 rounded-md
```

**Rule: no spinner above the fold, ever.** A skeleton with the real dimensions
means zero layout shift on data arrival. Spinners appear only inside buttons
(sonner's loading icon) and as the word "Checking…".

---

### 7.18 Empty states

```tsx
<div className="flex flex-col items-center justify-center gap-2 rounded-md
                border border-dashed border-border py-12 text-center">
  <Icon className="text-text-subtle mb-1 size-6" aria-hidden />
  <p className="text-body-strong text-foreground">{title}</p>
  <p className="text-meta text-muted-foreground max-w-sm">{description}</p>
  <Button variant="outline" size="sm" className="mt-2">{action.label}</Button>
</div>
```

- **`border-dashed`** distinguishes "a container that could hold things" from a
  real card. One class, huge semantic payload.
- **`variant` is a required prop**: `"no-data"` (icon `Inbox`) vs `"no-matches"`
  (icon `SearchX`). Conflating those two is the most common dashboard bug, and the
  type system prevents it here.
- The `no-matches` variant always offers a "Clear filters" action.
- Icon at `size-6` (20–24px) in the *lightest* colour — present, not sad.

---

### 7.19 Other reusable atoms worth porting

| Component | What it does |
|---|---|
| `CopyButton` | `variant="ghost" size="icon-xs"` with `Copy` → `Check` swap for 1.2s; `aria-label` flips to "Copied" |
| `RelativeTime` | `<time dateTime>` with relative text + absolute tooltip; ticks 1/s **only while the tab is visible** |
| `PolicyVersionTag` | 6-char mono hash + `CopyButton`, `title` = full hash, `—` when null |
| `TraceLink` | truncated mono id + copy + conditional `Open in SigNoz ↗` |
| `ArgsBlock` | mono `<pre>` on `bg-surface-subtle`, `max-h-32` collapsed, Expand/Collapse text button + copy |
| `AgentChip` | 6px heartbeat dot (green <60s, amber <180s, grey otherwise) + id + `(persona)`, links to the agent |
| `KeyValueGrid` | the two-column `<dl>` every detail panel uses |
| `Section` | title + optional description + optional actions + children |
| `PageHeader` | `h1` + description + right-docked actions, `pb-6` |

---

### ⚠️ Radius drift (fix this when porting)

The theme overrides `--radius-sm/md/lg` but leaves `--radius-xl` at Tailwind's
default:

```
--radius-sm  → 0.375rem (6px)   [overridden]
--radius-md  → 0.625rem (10px)  [overridden]
--radius-lg  → 0.875rem (14px)  [overridden]
--radius-xl  → 0.75rem  (12px)  [DEFAULT — not overridden]
```

Result: **`rounded-xl` (12px) is smaller than `rounded-lg` (14px)**, so shadcn
cards/dialogs (`rounded-xl`) are slightly *tighter* than hand-rolled panels
(`rounded-lg`) — visible when they sit next to each other. Fix by adding
`--radius-xl: 1.125rem;` (18px) to the `@theme` block, or by standardising all
containers on `rounded-lg`.

Second minor bug: `components/ui/sonner.tsx` sets
`"--border-radius": "var(--radius)"`, but `--radius` is defined nowhere in this
project. Point it at `var(--radius-md-value)`.

---

## 8. Icon system

### 8.1 Library

**`lucide-react` only** (v1.25). No second icon set, no custom SVG icon files —
the only hand-authored SVG in the app is the decorative aircraft glyph in
`FlightPath.tsx`, which is deliberately not an icon.

### 8.2 Size standards

| Size | Class | Where |
|---|---|---|
| **16px** | `size-4` | the default — sidebar nav, button icons (auto-applied), alerts, table undo marker |
| **14px** | `size-3.5` | secondary inline affordances — entry meta links, `DeltaStat` arrows, "Open section" arrow |
| **12px** | `size-3` | icons *inside running text or a badge* — `ExternalLink` after a link, sort chevrons, copy/check, `LiveIndicator` radio |
| **20–24px** | `size-6` | empty-state icon |
| **32px** | `size-8` | error-boundary icon |

Enforced automatically in `Button`
(`[&_svg:not([class*='size-'])]:size-4`, `sm` → `size-3.5`, `xs` → `size-3`) and
in `Badge` (`[&>svg]:size-3!` — with `!` so it cannot be overridden).

### 8.3 Stroke width

Every icon uses **Lucide's default `stroke-width: 2`** — no `strokeWidth` prop is
set anywhere in `src/` on a Lucide icon.

> **Drift note.** The RFC specifies `stroke-width: 1.75`. Not implemented. If you
> want the intended (slightly lighter, more premium) look, set it once globally:
> ```css
> .lucide { stroke-width: 1.75; }
> ```
> At 16px, 1.75 vs 2 is a visible refinement — thinner icons sit better next to
> 14px/400 text.

### 8.4 Filled vs outline

**100% outline.** Lucide has no filled variants, and none are simulated. The only
"filled" marks in the app are geometric primitives that aren't icons:
`rounded-full` status dots at `size-1.5` (6px) and `size-2` (8px).

That distinction is itself a system rule: **icons are outlines; state indicators
are filled dots.** You can tell at a glance which is which.

### 8.5 Colour usage

Icons never carry their own colour — they inherit:

- Default: `currentColor` from the parent's text class.
- Muted affordances: `text-text-subtle` (`CopyButton`, sort chevrons, keyboard
  hints).
- Semantic: `text-danger` (`AlertTriangle` in errors), `text-info` (`Undo2` in the
  activity table), `text-primary` (entry capability icons).
- Decorative: `text-border`, `text-text-muted/25` (the ambient flight paths).

There is **no** icon that is coloured differently from its adjacent label.

### 8.6 When icons are used — and when they are not

Used:
- Sidebar navigation (one per route, always).
- Button affordances where the verb is spatial or repeated (`Search`, `Pause`,
  `Play`, `Copy`, `X` clear, `ChevronDown` expand, `ArrowRight` continue).
- Status/severity markers where the icon adds meaning the text can't
  (`ShieldAlert` on `CANNOT BE UNDONE`, `Undo2` on `undo available`).
- Empty states and error states (exactly one, centred).
- External-link markers (`ExternalLink` at `size-3` after the text).
- Table sort direction.

**Not** used:
- Never inside `KeyValueGrid` labels.
- Never on a badge that already has a clear word (`RiskBadge`, `StatusBadge`,
  `SeverityChip` are text-only).
- Never as a bullet or list decoration.
- Never as a decorative flourish next to a heading.

### 8.7 Why they look cohesive

1. One library → one grid, one corner radius, one optical weight.
2. Three sizes only, and the size is chosen by *context* (inline text / control /
   hero), not by taste.
3. `aria-hidden` on every icon that sits next to a text label — icons are never
   the only label, and `size-3` icons in text are always paired with words.
4. `shrink-0` on every icon in a flex row, so a long label never squashes an icon
   into an ellipse.
5. Icons always inherit colour, so they can never clash with their text.

### 8.8 Rules for choosing an icon

- **Choose for the question, not the noun.** `Gauge` for "read the instruments",
  not `BarChart` for "there is a chart here".
- **One icon = one meaning, app-wide.** `ShieldAlert` only ever means "held for
  approval"; `Undo2` only ever means undo/compensation; `AlertTriangle` only ever
  means "something went wrong"; `ExternalLink` only ever means "this leaves the
  app".
- **Prefer a common icon over a clever one.** `Repeat` for replay beats
  `RotateCcw`; `GitCompare` for diff beats `Columns`.
- **If the label already says it, drop the icon.**

### 8.9 The vocabulary in use

```
Navigation   Gauge · ShieldAlert · Bot · ListChecks · AlertTriangle · Repeat ·
             GitCompare · Bell · Settings
Status       ShieldAlert (held) · Undo2 (undoable) · Radio (live) · AlertTriangle (error)
Actions      Search · Pause · Play · Copy · Check · X · Plus · ArrowRight ·
             ChevronDown · ChevronsUpDown · ArrowUp · ArrowDown · User
Empty        Inbox (no data) · SearchX (no matches)
External     ExternalLink · BookOpenText (docs) · GitBranch (GitHub)
Entry/hero   ShieldCheck · Radar · SearchCheck
Toast        CircleCheck · Info · TriangleAlert · OctagonX · Loader2
Primitive    ChevronRight (breadcrumb) · MoreHorizontal (menu) · CheckIcon (select/checkbox)
```

---

## 9. Animations

### 9.1 The duration token set

Motion is tokenised **per transition, not as a generic scale** — deliberately, so
a reduced-motion override can single out *functional* motion from *decorative*
motion:

```css
--ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);
--ease-out: ease-out;
--ease-in: ease-in;

--duration-hover:       120ms;
--duration-card-enter:  200ms;
--duration-card-exit:   180ms;
--duration-drawer:      220ms;
--duration-dialog:      160ms;
--duration-toast-in:    200ms;
--duration-toast-out:   150ms;
--duration-skeleton:    1.6s;
--duration-countdown:   1s;    /* functional — never reduced */
--duration-badge-pulse: 600ms;
```

`cubic-bezier(0.2, 0.8, 0.2, 1)` is the house curve: fast out of the gate,
decelerating hard at the end. It's what makes movement feel *arrived* rather than
*eased*.

### 9.2 What actually animates

| Interaction | Implementation |
|---|---|
| Nav item hover | `transition-colors` (background tint) |
| Table/list row hover | `transition-colors` |
| Button hover | `transition-all` from the cva base |
| Button press | `active:translate-y-px` (1px, instant) |
| Entry card hover | `transition-[transform,box-shadow,border-color,background-color] duration-[var(--duration-hover)] ease-[var(--ease-standard)]` → `-translate-y-1 + shadow-e1→e3` |
| Arrow nudge on hover | `group-hover:translate-x-1` / `translate-x-0.5` |
| Dialog / AlertDialog | `duration-100` + `fade-in-0 zoom-in-95` ↔ `fade-out-0 zoom-out-95` |
| Sheet / drawer | `duration-200 ease-in-out` + `slide-in-from-right-10` + fade |
| Select / Popover / Dropdown | `duration-100` + `zoom-in-95` from the trigger's transform origin, plus a 2px directional slide |
| Tooltip | `fade-in-0 zoom-in-95`, `delayDuration={0}` |
| Skeleton | `animate-pulse` |
| Approvals badge arrival | `animate-badge-pulse` — 600ms one-shot expanding ring, fires **only on increase** |
| Countdown track | `transition-[width]` with `transitionDuration: var(--duration-countdown)` |
| Reconnecting dot | `animate-pulse` on `bg-risk-medium` |
| Collapsible chevron | `rotate-180` |
| Tabs (`line` variant) | `after:opacity-0 → data-active:after:opacity-100` |
| Entry flight paths | native SVG `<animateMotion>`, 29–36s loops |
| Entry checkpoint marker | `animate-checkpoint-pulse`, 2.6s `ease-in-out` infinite |

### 9.3 What does **not** animate

No page transitions. No route fades. No staggered list cascades. No parallax. No
spring physics. No scroll-triggered reveals. No scale on button hover. No skeleton
shimmer sweep (just opacity pulse).

**This is the point.** In a tool where the screen changes because *the world*
changed, animating things the user did not cause is actively harmful — it implies
an event that didn't happen.

### 9.4 Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-hover: 80ms;      --duration-card-enter: 80ms;
    --duration-card-exit: 80ms;  --duration-drawer: 80ms;
    --duration-dialog: 80ms;     --duration-toast-in: 80ms;
    --duration-toast-out: 80ms;  --duration-skeleton: 0s;
    --duration-badge-pulse: 0s;
  }
}
```

Two subtleties worth stealing:

1. **`--duration-countdown` is deliberately excluded.** It conveys real elapsed
   time; collapsing it would be a lie, not an accommodation.
2. **Looping animations are gated in JS, not CSS.** A looping animation can't
   collapse to "fast" the way a one-shot can, so `FlightPath` calls
   `usePrefersReducedMotion()` and simply **does not mount** the moving aircraft
   or the pulsing marker; it renders a static dot instead.

```tsx
const reducedMotion = usePrefersReducedMotion();
{!reducedMotion
  ? <circle className="animate-checkpoint-pulse" r="3" … />
  : <circle r="2.5" className="text-text-subtle/20" … />}
```

The `@media` block is also placed **physically after** the `@theme`/`@utility`
blocks in `tokens.css`, with a comment explaining that an earlier nested `:root`
broke Tailwind v4 utility resolution. Ordering matters in Tailwind v4.

### 9.5 Micro-interactions inventory

- Copy → check-mark for exactly 1.2s, with `aria-label` flipping to "Copied".
- Sort chevron cycles `ChevronsUpDown` → `ArrowUp` → `ArrowDown`.
- `Pause`/`Play` toggle in the top bar, whose label becomes `"3 new"` while paused
  — the button reports the cost of staying paused.
- `aria-expanded:bg-muted` on buttons — a dropdown trigger stays visually
  "pressed" while its menu is open.
- Entry summary links: arrow slides 2px right on hover (`group-hover:translate-x-0.5`).
- Expand/Collapse toggle on `ArgsBlock` is a text button, not an icon.

### 9.6 Why the animations feel smooth

1. **Everything is 100–220ms.** Nothing is slow enough to wait for.
2. **Only compositor-friendly properties** move: `opacity`, `transform`,
   `box-shadow`, `background-color`. Never `height`, `top`, or `width` (except the
   countdown track, which is intentionally a 1s width interpolation).
3. **Transitions name their properties.** `transition-[transform,box-shadow,
   border-color,background-color]` — no accidental `transition-all` on layout
   properties.
4. **Distances are tiny**: 1px press, 4px card rise, 10px drawer slide, 5% zoom.
5. **Transform origins are correct** — dropdowns grow from the trigger, not the
   viewport centre.
6. **Timers are shared, not per-component.** One 1s `useSharedClock` drives every
   countdown on screen; `useInterval` auto-pauses on `visibilitychange`. Twenty
   approval cards cost one interval, and a backgrounded tab costs zero.

---

## 10. Visual hierarchy

### 10.1 Contrast

Three independent contrast channels, layered:

- **Text colour**: `#12141A` → `#5F6672` → `#8B93A1`. Three steps, each clearly
  distinguishable, all AA-compliant on white.
- **Weight**: 600 (headings) / 550 (nav, emphasis) / 500 (buttons) / 450 (mono) /
  400 (body). Five weights, but only ~50 units apart at the top — subtle enough to
  never look bolded.
- **Surface**: `#FCFCFD` page / `#FFFFFF` card / `#F7F8FA` inset. Only 3–5 units of
  lightness between them, so structure is legible without any surface shouting.

### 10.2 Font size as hierarchy

The size ladder is *compressed* (11 · 13 · 14 · 15 · 18 · 24 · 30) precisely so
that a jump reads as intentional. Note there is **no 16px** — the gap between body
(14) and card title (15) is one point, carried entirely by weight, while the jump
to a section title (18) is unmistakable.

### 10.3 Colour as hierarchy

Colour marks **exceptions**, not categories. On a healthy Overview screen there is
zero chromatic colour on the page. When one thing goes wrong, exactly one amber
chip appears — and it is the only coloured pixel on screen. That's why it works.

`StatTile` demonstrates this precisely: `tone` is `"neutral"` when the count is
zero and `"medium"`/`"high"`/`"danger"` only when there is something to act on.

```tsx
<StatTile label="Needs decision" value={String(pendingCount)}
          tone={pendingCount ? "medium" : "neutral"} />
<StatTile label="Quarantined" value={String(quarantinedCount)}
          tone={quarantinedCount ? "danger" : "neutral"} />
```

### 10.4 Spacing as hierarchy

Proximity does the grouping. The ratios are deliberate:

```
label → value            4px       (1×)
sibling chips            6px       (1.5×)
related elements         8px       (2×)
sibling cards           12px       (3×)
inside a card           16px       (4×)
document blocks         24px       (6×)
page sections           32px       (8×)
```

Because each level is a clean multiple, the eye reads the grouping without any
lines.

### 10.5 Grouping

- `Section` wraps every content group with its own `h2`.
- `KeyValueGrid` groups all facts about one thing into one two-column block.
- `ConsequenceRow` groups the three chips that answer "what does approving cost
  me?" into one `flex flex-wrap gap-1.5` row.
- The incident dossier is **seven fixed blocks in one fixed order**, so operators
  build muscle memory across incidents.

### 10.6 Alignment

- **Left rag everywhere.** The only centred content is empty states, the
  connection banner, the error boundary, and matrix cell numbers.
- **Baseline-ish alignment via `items-center`** in every chip/badge row, with
  `mt-0.5` nudges where an icon needs to sit optically (not mathematically) on the
  text baseline.
- **Three vertical rails in every list row**: leading icon/chip (fixed), flexible
  label (`flex-1 truncate`), trailing metadata (`shrink-0`). Used in the sidebar,
  `RecentIncidents`, `AgentDetailPage` action list, `ShortcutsSheet` — the same
  skeleton every time:

```tsx
<li className="flex items-center justify-between gap-2 text-meta">
  <span className="flex min-w-0 items-center gap-2"> … truncate … </span>
  <span className="flex shrink-0 items-center gap-2"> … metadata … </span>
</li>
```

- `px-2` on both the sidebar section label and the nav item means text edges align
  perfectly down the rail.

### 10.7 Card emphasis

Emphasis is granted through a strict escalation ladder — cards do **not** compete:

```
1. flat + 1px border                     ← default (every console card)
2. + hover background tint               ← the card is a link
3. + shadow-e1 + hover:-translate-y-1 + shadow-e3   ← entry capability cards
4. + shadow-e3 + border-strong           ← the one hero card on the entry page
```

At most one level-4 card exists per screen.

---

## 11. Reusable UI patterns

### 11.1 Page header

```tsx
<PageHeader title="Activity" description="What has the fleet done?" />
<PageHeader title={agent.id} description="What has this agent been doing?"
            actions={<QuarantineToggle agent={agent} />} />
```
```tsx
<div className="flex items-start justify-between gap-4 pb-6">
  <div>
    <h1 className="text-display text-foreground">{title}</h1>
    {description && <p className="text-body text-muted-foreground mt-1">{description}</p>}
  </div>
  {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
</div>
```
Consistency mechanism: it's one component, and every route uses it. The
description is always a **question**.

### 11.2 Section

```tsx
<Section title="Why">…</Section>
<Section title="Recent actions" className="mt-6" actions={<Link …>View in Activity</Link>}>…</Section>
```
`pb-3` header, optional `text-meta` description at `mt-0.5`, optional right-docked
actions.

### 11.3 The five list states

Every list renders exactly one of:

```tsx
{isPending      ? <SkeletonRows count={10} />
 : error        ? <ErrorState error={error} onRetry={() => void refetch()} />
 : data?.length ? <Table … emptyState={hasFilters
                      ? <EmptyState variant="no-matches" title="No actions match these filters"
                                    action={{label:"Clear filters", onClick: clearAll}} />
                      : <EmptyState variant="no-data" title="No actions recorded yet" />} />
 : <EmptyState variant="no-data" … />}
```

`DataTable`'s `emptyState` prop is **required**, which is what makes this pattern
survive contact with deadlines.

### 11.4 Filters + toolbar

```tsx
<div className="mb-4 flex flex-wrap items-center gap-2">
  <Input className="h-8 w-48" placeholder="Search args or resource…" />
  {filters.map(f => <Select><SelectTrigger size="sm" className="w-auto">…)}
  {hasActiveFilters && <Button variant="ghost" size="sm"><X /> Clear all</Button>}
</div>
```

- All filter state lives in the URL (`useUrlFilters` ↔ `useSearchParams`,
  `{ replace: true }` so filtering doesn't spam history).
- The `Clear all` button only exists when something is filtered.
- Followed by a result count line:
  `Showing 42 of 1,204 actions` in `text-meta text-muted-foreground mt-2`.

### 11.5 Detail dossier

Fixed-order stack of `Section`s inside `flex flex-col gap-6`, each panel
independently handling its own null case. Verdict strip first (`flex flex-wrap
items-center gap-2` of badges), evidence next, recovery/actions last.

### 11.6 Drawer over list

Overlay routes: `/console/activity/:actionId` renders a `Sheet` while
`ActivityPage` stays mounted beneath. Closing is instant and refetch-free, and the
URL is shareable.

### 11.7 Confirm-before-consequence

```tsx
const handleClick = () => {
  if (agent.quarantined) mutate({ quarantined: false });   // safe direction: no dialog
  else setConfirmOpen(true);                                // dangerous direction: dialog
};
```

**Only the dangerous direction of a toggle is guarded.** Copy always names the
concrete consequence: *"All tool calls from `coder-01` will be denied with
`[ATC-QUARANTINED]` until lifted."*

### 11.8 Settings page

`flex max-w-lg flex-col gap-8` of `Section`s, each: `Label` → control (`mt-1.5`) →
explanation (`text-meta text-muted-foreground mt-2`). Switch rows are
`flex items-center justify-between` with a `font-normal` label on the left. Ends
with a `Diagnostics` `KeyValueGrid` (connection state, last event, API base, app
version).

### 11.9 Stat row

`grid grid-cols-2 gap-4 sm:grid-cols-4` of `StatTile`, each gating on its own
query, each with an exactly-sized skeleton.

### 11.10 External-link affordance

```tsx
<a href={url} target="_blank" rel="noreferrer"
   className="text-info flex items-center gap-1 text-meta hover:underline">
  Open in SigNoz <ExternalLink className="size-3" aria-hidden />
</a>
```
Always `text-info`, always `size-3` trailing icon, always `rel="noreferrer"`.

### 11.11 Machine-fact rendering

Any id, path, tool name, rule id, SQL, or hash gets `text-mono`. Long ones get
truncated with the full value in a `title` or tooltip, plus a `CopyButton`.

---

## 12. Tailwind / CSS architecture

### 12.1 Folder organisation

```
web/src/
  app/          AppShell, SidebarNav, TopBar, CommandPalette, commands.ts,
                ConnectionBanner, LiveIndicator, OperatorIdentityPopover,
                ShortcutsSheet, NotFoundPage
  components/
    ui/         shadcn primitives — NEVER hand-edited (28 files)
    domain/     semantic atoms: RiskBadge, StatusBadge, SeverityChip, DecisionChip,
                ReversibilityChip, BlastRadiusChip, PolicyVersionTag, AgentChip,
                TraceLink, RelativeTime, CopyButton, ArgsBlock, UndoButton,
                UndoResultAlert
    layout/     PageHeader, Section, StatTile, KeyValueGrid
    feedback/   EmptyState, ErrorState, Skeletons, ConfirmDialog, ErrorBoundary,
                DemoBackendBanner
    data/       DataTable, FilterBar, MarkdownView
    decoration/ AmbientContours, AmbientDots, BackgroundGrid, FlightPath
  context/      ConnectionContext, SettingsContext, CommandContext
  features/     <feature>/{pages,components,hooks}
  hooks/        useActions, useAgents, useCopy, useEventStream, useHotkeys,
                useInterval, useMediaQuery, useSharedClock, useUndoAction, useUrlFilters
  lib/          api/{client,keys,endpoints/*}, types/api.ts, constants, format,
                queryClient, risk, routes, utils
  styles/       tokens.css, globals.css
```

The five-way split of `components/` is the important idea: **`ui` = generic,
`domain` = this product's vocabulary, `layout` = page skeleton, `feedback` =
non-happy paths, `data` = tabular/rich rendering.** Sorting by *kind of
responsibility* rather than by "shared vs not" is what keeps `domain/` from
becoming a junk drawer.

### 12.2 Feature module boundary

> A feature may import from `components/`, `hooks/`, `lib/` — **never from another
> feature.** Cross-feature needs get promoted to `components/domain/`.

Observed exception: `features/overview/components/PendingPreview.tsx` imports
`features/approvals/components/ApprovalCard`. Intentional (the RFC's phase plan
explicitly reuses it) but it's the boundary's one leak — in a fresh port,
`ApprovalCard` belongs in `components/domain/`.

### 12.3 Tailwind v4, CSS-first

- **No `tailwind.config.ts` at all.** Configuration is `@theme inline` in
  `tokens.css`, loaded through `@tailwindcss/vite`.
- `@utility` is used to define the nine typography roles and the two custom
  animations, so they behave like first-class utilities (variants, purging, and
  `cn()` merging all work).
- Import order in `globals.css` matters:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";       /* custom variants: data-open, data-checked, … */
@import "@fontsource-variable/inter";
@import "@fontsource/jetbrains-mono/400.css";
@import "@fontsource/jetbrains-mono/500.css";
@import "./tokens.css";              /* our theme last, so it wins */
```

### 12.4 Utility usage conventions

- **`cn()` everywhere**: `twMerge(clsx(...))` from `lib/utils.ts`. Every component
  that accepts `className` merges it last so callers can always override.
- **`cva` for variants**, never conditional string concatenation. Used by `Button`,
  `Badge`, `Alert`, `TabsList`.
- **Arbitrary values are rare and always token-referencing**:
  `duration-[var(--duration-hover)]`, `ease-[var(--ease-standard)]`,
  `text-[0.8rem]`, `max-w-[1400px]`, `w-[52vw]`.
- **Data-attribute styling over className branching**: `data-slot`, `data-variant`,
  `data-size`, `data-active`, `data-checked`, `data-open`, `data-side`. This is
  what lets a parent style its descendants
  (`group-data-[variant=line]/tabs-list:data-active:after:opacity-100`) without
  prop drilling.
- **Named groups**: `group/card`, `group/button`, `group/tabs`, `group/badge`,
  `group/alert` — so nested groups never collide.
- **`has-*` and `*:` selectors** replace layout props:
  `has-data-[slot=card-footer]:pb-0`, `has-[>svg]:grid-cols-[auto_1fr]`,
  `*:[img:first-child]:rounded-t-xl`.

### 12.5 Custom classes

Almost none. The only bespoke CSS is:
- 9 `@utility` type roles,
- 2 `@keyframes` + their `@utility` wrappers,
- a 10-line `@layer base` reset:

```css
@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground text-body; }
  html { @apply font-sans; }
}
```

`* { @apply border-border }` sets the *default border colour* globally, so any
`border` utility is automatically the right hairline. That single line removes an
entire class of drift.

### 12.6 Design tokens & theme handling

Three layers, in order:

1. **Raw semantic tokens** — `:root` in `tokens.css`. Product vocabulary
   (`--risk-high-bg`, `--text-subtle`).
2. **Theme adapter** — `@theme inline`, mapping raw tokens to (a) shadcn's expected
   names and (b) direct Tailwind utilities.
3. **Tone map** — `lib/risk.ts`, mapping domain enums to className triples.

Theme switching therefore has exactly one edit point (layer 1), and semantic
meaning has exactly one edit point (layer 3).

### 12.7 Build & tooling

- Vite 8 + `@vitejs/plugin-react` + `@tailwindcss/vite`.
- Path alias `@/*` → `src/*` (in both `vite.config.ts` and `tsconfig.app.json`).
- `__APP_VERSION__` injected via `define` from `package.json` and surfaced in
  Settings → Diagnostics.
- Build output is written straight into the backend's static dir (or `dist/` on
  Vercel).
- **`HashRouter`, not `BrowserRouter`** — the backend serves `index.html` only at
  `/`, so hash routing makes every deep link and refresh work with zero backend
  change. (Documented in a comment in `main.tsx` explaining it was found by
  serving a real production build, not by review.)
- Linting: `oxlint` with `react/rules-of-hooks: error`.

---

## 13. Accessibility

### 13.1 What is done well

**Semantics**
- `<aside>` / `<nav>` / `<main>` landmarks in the shell.
- Exactly one `<h1>` per route via `PageHeader`; `<h2>` via `Section`.
- `<dl>/<dt>/<dd>` for key/value data (with `display:contents` preserving the grid).
- `<time dateTime={ISO}>` for all timestamps.
- Real `<ul>/<li>` for lists; `<form>` with labelled controls throughout.

**Keyboard**
- `⌘K` palette, `⌘1–7` route jumps, `?` shortcut sheet — with `isTypingTarget()`
  guarding so `?` doesn't fire inside an input.
- `DataTable` rows are `tabIndex={0}` with `ArrowUp`/`ArrowDown`/`Enter`.
- Radix handles focus trap + restore for every dialog, sheet, popover, select.
- Row-level actions use opacity (not `display:none`) so they stay in tab order.

**Focus**
- Uniform `focus-visible:ring-3 focus-visible:ring-ring/50` +
  `focus-visible:border-ring` on every interactive primitive. `:focus-visible`, so
  mouse users don't see rings.
- Never removed — `outline-none` is always paired with a ring.

**Screen readers**
- `aria-hidden` on every decorative icon (and on all four ambient SVG layers).
- `<span className="sr-only">Close</span>` on icon-only close buttons.
- `aria-label` on `CopyButton`, flipping to "Copied" after a copy.
- `aria-sort` on sortable column headers.
- `aria-label` on the tab nav (`aria-label="Run detail tabs"`).
- `role="table"/"rowgroup"/"row"/"columnheader"/"cell"` on the grid-based table.
- **The countdown's `aria-label` updates only at 30/20/10s checkpoints**, not every
  second — "a screen reader announcing every tick is spam, not help." This is an
  unusually thoughtful detail.

**Motion & preferences**
- `prefers-reduced-motion` handled at the token layer *and* at the mount layer for
  looping animations.

**Honest UI**
- `EmptyState` requires a `variant`; unknown values render `—` with a tooltip.

### 13.2 Gaps and recommended fixes

| # | Issue | Where | Fix |
|---|---|---|---|
| 1 | **Nested interactive elements.** `ApprovalCard` wraps its body in `<div role="button" tabIndex={0}>` which contains an `<a>` (`AgentChip`) and a `<button>` (`CopyButton` inside `PolicyVersionTag`). Invalid nesting; clicks bubble; SR announces a button containing a link. | `ApprovalCard.tsx:20` | Make the *title* a link (`<Link>` with `after:absolute after:inset-0` stretched-link) instead of making the container a button; or move the nested controls outside the clickable region. |
| 2 | **No skip link.** Keyboard users tab through 9 nav items on every page. | `AppShell.tsx` | Add `<a href="#main" className="sr-only focus:not-sr-only …">Skip to content</a>` and `id="main"` on `<main>`. |
| 3 | **`<nav>` has no accessible name**, and the sidebar's four groups aren't exposed as groups. | `SidebarNav.tsx:98` | `aria-label="Primary"` on `<nav>`; wrap each group in `role="group"` with `aria-labelledby` pointing at its header. |
| 4 | **Top bar is a `<div>`**, not `<header>`. | `TopBar.tsx:25` | Use `<header>`. |
| 5 | **28px controls.** `size="sm"` (28px) is used pervasively, below the 32px comfortable target and well below 44px for destructive ones — including the `Deny`/`Approve` buttons. | `button.tsx`, `DecisionButtons.tsx` | Raise `sm` to 32px, or use `size="default"` for decision buttons. |
| 6 | **Amber contrast is marginal.** `--risk-medium #B7791F` on `--risk-medium-bg #FDF6E7` ≈ 3.7:1 — below AA 4.5:1 for the 12px badge text. | `tokens.css` | Darken to ≈ `#8C5C10` (≈5.4:1) or raise badge text to 14px. |
| 7 | **`text-subtle` on white** (`#8B93A1`) ≈ 3.1:1 — fine for 11px/600 uppercase only by the large-text exemption's edge, not for 13px meta text. | `tokens.css` | Darken to ≈ `#767E8C` (4.5:1). |
| 8 | **No live region for arriving approvals.** The badge pulses and a toast fires, but nothing is announced politely. | `SidebarNav.tsx` | Add `aria-live="polite"` to the badge container; `aria-live="assertive"` on `ConnectionBanner` and `UndoResultAlert`. |
| 9 | **Grid table has no `<caption>` equivalent.** | `DataTable.tsx` | Add `aria-label`/`aria-rowcount`/`aria-colcount` to the `role="table"` element. |
| 10 | **Disabled controls have no explanation.** The stated rule is "a disabled control with no explanation is a bug", but disabled matrix cells and buttons carry no tooltip. | `DecisionChangeMatrix.tsx`, `ConfirmDialog.tsx` | Wrap in a `Tooltip` explaining why. |
| 11 | **Colour-only signal on the entry status dots.** `statusToneClass()` returns only a background colour; the adjacent text does carry the state, so this is borderline — but the dot alone is not labelled. | `EntryPage.tsx:89` | Fine as-is given adjacent text; add `aria-hidden` (already present) and keep the text. |
| 12 | **Sidebar not responsive.** At <640px it consumes 240px of viewport with no way to dismiss. | `SidebarNav.tsx` | Collapse to an icon rail or a `Sheet` below `lg`. |

---

## 14. Tech stack

### 14.1 Runtime dependencies (`web/package.json`)

| Category | Package | Version | Role |
|---|---|---|---|
| Framework | `react`, `react-dom` | ^19.2.7 | — |
| Routing | `react-router-dom` | ^7.18.1 | `HashRouter`, nested + overlay routes |
| Server state | `@tanstack/react-query` | ^5.101.4 | queries, mutations, cache |
| Tables | `@tanstack/react-table` | ^8.21.3 | headless sorting/columns |
| Virtualization | `@tanstack/react-virtual` | ^3.14.7 | rows >200 |
| **UI primitives** | `radix-ui` | ^1.6.4 | unified Radix package (not per-component `@radix-ui/*`) |
| **Component layer** | `shadcn` | ^4.13.1 (dev) | generator; style **`radix-nova`**, base colour `neutral`, CSS variables on |
| **Icons** | `lucide-react` | ^1.25.0 | the only icon set |
| Variants | `class-variance-authority` | ^0.7.1 | `cva` |
| Class merging | `clsx` + `tailwind-merge` | ^2.1.1 / ^3.6.0 | `cn()` |
| Styling | `tailwindcss` + `@tailwindcss/vite` | ^4.3.3 | CSS-first v4 |
| Animation utilities | `tw-animate-css` | ^1.4.0 | `animate-in`/`animate-out`/`fade-*`/`zoom-*`/`slide-*` |
| Toasts | `sonner` | ^2.0.7 | token-themed |
| Command palette | `cmdk` | ^1.1.1 | ⌘K |
| Forms | `react-hook-form` + `zod` + `@hookform/resolvers` | ^7.82 / ^4.4.3 / ^5.4 | validation |
| Markdown | `marked` + `dompurify` | ^18.0.7 / ^3.4.12 | two markdown endpoints, allowlisted tags, `ALLOWED_ATTR: []` |
| Fonts | `@fontsource-variable/inter`, `@fontsource/jetbrains-mono` | ^5.3.0 | self-hosted |

### 14.2 Build / dev

Vite 8 · TypeScript ~6.0 (strict) · `@vitejs/plugin-react` · `oxlint` 1.71.

### 14.3 Deliberate omissions — and what replaces them

| Not used | Replacement |
|---|---|
| **Chart library** (recharts/chart.js/d3) | stacked flex bar, CSS grid matrix, label rows. Time series delegated to SigNoz. |
| **Animation library** (framer-motion) | CSS transitions, `tw-animate-css`, native SVG `<animateMotion>` |
| **Date library** (date-fns/dayjs/luxon) | `Intl.RelativeTimeFormat` + `Intl.NumberFormat` in `lib/format.ts` |
| **State library** (redux/zustand/jotai) | URL + `localStorage` + 3 React contexts + TanStack Query |
| **CSS-in-JS** | Tailwind only |
| **Component kit** (MUI/Mantine/AntD) | shadcn (owned source in-repo) |
| **Font CDN** | self-hosted fontsource — works air-gapped |
| **Analytics / telemetry from the browser** | none — no third-party host is contacted at all |

The governing rule: *no dependency without a written justification.* That
discipline is directly visible in the bundle's coherence — nothing in the UI looks
imported from a different design language.

---

## 15. What makes this frontend look premium

The subtle things, in rough order of impact.

### 15.1 A named typography scale instead of ad-hoc sizes
Nine `@utility` roles, each locking size + line-height + weight + tracking
together. An amateur UI has 14 different text sizes; this has 9 named ones. **This
is the single biggest differentiator**, and it's the cheapest to copy.

### 15.2 Optical tracking by size
`-0.02em` at 24–30px, `-0.01em` at 18px, `+0.06em` at 11px uppercase, `-0.04em` at
48px. Almost nobody does this, and it's the difference between "used a font" and
"set type".

### 15.3 A 550 weight
`text-body-strong` is **550**, not 600. Available only because Inter is variable.
It gives emphasis without the visual "shout" of semibold, which is why the sidebar
can be legible without feeling heavy.

### 15.4 Hairlines instead of shadows
Default elevation is flat + 1px `#E8EAED`. Shadows appear in ~9 places total, all
overlays. Amateur UIs shadow everything; the result is mud.

### 15.5 A 10% modal scrim
`bg-black/10` + `backdrop-blur-xs` instead of the customary `bg-black/50`. The
page stays visible; the dialog reads as *layered*, not as *blocking*.

### 15.6 Hover = a 60% preview of active
`hover:bg-sidebar-accent/60` vs active `bg-sidebar-accent`. Hover and active are
the same visual idea at two intensities, not two different treatments.

### 15.7 The `-mb-px` tab underline
Pulling a 2px active underline over the container's 1px rule so it *replaces*
rather than *stacks*. Costs one class; a stacked 3px edge instantly reads as sloppy.

### 15.8 Transform-origin-aware overlays
`origin-(--radix-select-content-transform-origin)` makes a dropdown grow out of
its trigger. Menus that zoom from the viewport centre feel wrong even when people
can't say why.

### 15.9 A 1px press, never a scale
`active:translate-y-px`, with `not-aria-[haspopup]` exempting menu triggers.
Buttons that scale on press look like a toy.

### 15.10 Auto-sized, auto-padded icons
`[&_svg:not([class*='size-'])]:size-4` plus
`has-data-[icon=inline-start]:pl-2`. Every icon is the right size and the button's
padding tightens on the icon side, because icons carry more visual air than
letters. Call sites can't get it wrong.

### 15.11 Skeletons with the real dimensions
`h-11` for a 44px table row; `h-24` for a stat tile. Zero layout shift on data
arrival — the most visible difference between a polished and unpolished dashboard.

### 15.12 `tabular-nums` on anything that changes
Countdowns, counts, latencies. Digits never jitter.

### 15.13 Dashed borders for potential containers
`border-dashed` on empty states says "this could hold things" in one class.

### 15.14 Colour reserved for exceptions
A healthy screen is achromatic. When something needs attention it is the *only*
coloured element. Amateur dashboards colour every category and end up with no
signal.

### 15.15 The em-dash discipline
`—` with a tooltip, never a fabricated `0`. `ReversibilityChip` renders `null` for
the boring case. Restraint about *what not to show* is the strongest premium tell
in a data-dense product.

### 15.16 Copy written by someone who understood the stakes
> *"ATC will execute a compensating action through the same governed path, using
> the pre-image captured before the original ran. **This is a real write. It cannot
> itself be undone.**"*

and

> *"No calls are being held. Every risky tool call from the fleet is intercepted
> here before it executes."*

Microcopy is a design surface. This app treats it as one.

### 15.17 Optical, not mathematical, alignment
`mt-0.5` on alert icons, `mt-1.5` on status dots, `translate-y-0.5` on alert SVGs.
Someone looked at it and nudged 2px.

### 15.18 Hairline grids via `gap-px`
`grid grid-cols-4 gap-px bg-border` with light children — a pixel-perfect divider
grid with no border math.

### 15.19 Shared timers
One 1s clock for all countdowns; visibility-gated intervals everywhere. Twenty
approval cards cost one interval. Smoothness is a performance property.

### 15.20 Ambient decoration that isn't decoration
The entry page's radar contours, dot field, 64px grid, and dashed flight paths are
all `text-border`-tinted at 6–30% opacity, radially masked, `pointer-events-none`,
`aria-hidden`, and disabled under `prefers-reduced-motion`. They say *air traffic
control* without a single stock illustration:

```tsx
<AmbientDots className="[mask-image:radial-gradient(circle_at_78%_10%,black,transparent_60%)]" />
<BackgroundGrid className="inset-y-0 right-0 w-[52vw] opacity-30
                           [mask-image:radial-gradient(circle_at_top_right,black,transparent_65%)]" />
```

The radial `mask-image` is what keeps texture from becoming wallpaper — the
pattern fades to nothing before it reaches the content.

### 15.21 Named motion tokens, not a generic scale
`--duration-drawer` vs `--duration-dialog` vs `--duration-countdown`. Naming by
*purpose* is what allowed the reduced-motion override to exempt the one duration
that carries information.

### 15.22 Every state designed, including the boring ones
Loading, empty-no-data, empty-no-matches, error-with-server-detail, 404, 502
partial-restore, "not configured", "awaiting next heartbeat", and a WS-disconnect
banner. Most of a premium feel is that you never fall off the happy path.

---

## 16. Frontend Design Playbook

A portable rule set. Numbers are absolute so they transfer to any stack.

### Foundations

1. **Always define tokens in two layers**: raw semantic CSS variables in `:root`,
   then a theme adapter that maps them to your framework's expected names. Theme
   changes must touch exactly one block.
2. **Always use a 4px spacing base.** Permitted values: 2, 4, 6, 8, 10, 12, 16,
   20, 24, 32, 40, 48, 64. Nothing off-scale, ever.
3. **Always name typography roles** (display / section-title / card-title / body /
   body-strong / meta / label / mono / stat) and lock size + line-height + weight
   + tracking into each. **Never** write a raw size/weight/leading triple at a
   call site.
4. **Never exceed 9 type sizes** in the whole product. Skip 16px; let weight carry
   the 14↔15 distinction.
5. **Always tighten tracking above 18px** (−0.01 to −0.02em) and **open it below
   12px** (+0.06em uppercase).
6. **Always use `tabular-nums` on any number that can change while visible.**
7. **Always self-host fonts.** Two families maximum: one UI sans (variable), one
   mono.
8. **Always render machine facts in mono** — ids, paths, SQL, hashes, tool names,
   error details. The font itself is a type signal.

### Colour

9. **Always keep 90% of the surface neutral.** Colour encodes meaning only; it is
   never branding, never decoration, never a category label.
10. **Never use more than 3 chromatic hues** for semantics (green/amber/red) plus
    one accent and one info blue.
11. **Always build semantic chips as `tinted-bg + coloured-text + 1px coloured
    border at 40% opacity`.** Never a saturated fill.
12. **Never let saturated colour appear more than twice per screen.** Reserve it
    for the single most consequential state.
13. **Always centralise the enum → tone → className mapping in one file.** Every
    badge, tile, and banner reads from it. This is non-negotiable if you want
    consistency to survive a deadline.
14. **Always ship exactly one border colour** for hairlines and one stronger
    variant for inputs. Set the default globally (`* { border-color: var(--border) }`).
15. **Always de-emphasise with colour before size.** Three text greys
    (primary/muted/subtle) do more work than three font sizes.
16. **Never make colour the only signal.** Every coloured chip carries a word;
    every dot has adjacent text.
17. **Always make the healthy state achromatic.** If nothing is wrong, nothing is
    coloured.

### Layout

18. **Always give the app shell `h-screen overflow-hidden` and scroll only
    `<main>`.** Chrome never scrolls away.
19. **Always put `min-w-0` on the flex child that holds content.** Without it a
    wide table destroys your sidebar.
20. **Always cap content width**: 1440px page, 880px for prose/detail, 512px for
    forms and settings.
21. **Always use 24px page gutters** (`px-6 py-6`) and 32px between top-level page
    sections.
22. **Always use `gap`, never margins, for layout separation.** Reserve margins
    (2/4/6px) for attaching a label to the thing it names.
23. **Always separate with whitespace before reaching for a divider.** Structural
    borders belong to: the shell edges, table frames, and card outlines. Nothing else.
24. **Always let proximity do grouping**: 4px inside a pair, 16px inside a group,
    32px between groups.
25. **Always use exactly three breakpoints** (640 / 768 / 1024) and code
    mobile-first. Four responsive behaviours is plenty: stat grid 2→4, card grid
    1→2→3, hero stack→split, chrome hints hidden→shown.
26. **Always keep inputs at `text-base` on mobile** and `md:text-sm` above, or iOS
    will zoom on focus.

### Sidebar

27. **Sidebar should be 240px, fixed, `shrink-0`, and the same background colour
    as the app** — separated by a hairline, not a slab of grey.
28. **Sidebar items should be `flex items-center gap-2 rounded-md px-2 py-1.5`**
    with a `size-4 shrink-0` icon, a `flex-1 truncate` label, and `shrink-0`
    trailing metadata.
29. **Sidebar hover should be the active style at 60% opacity.** Hover is a
    preview of active, not a different idea.
30. **Sidebar groups should be separated by 16px with a 4px-attached 11px
    uppercase header** — never by a divider line.
31. **Sidebar section labels should share the item's horizontal padding** so text
    edges align down one rail.
32. **Never render a `(0)` badge.** Absent count → no badge. Unknown → no badge.
33. **Always collapse or hide the sidebar below `lg`.**

### Components

34. **Cards should be flat: 1px border, `rounded-lg`, `p-4`, no shadow at rest.**
    Add elevation only for overlays and for at most one hero card per screen.
35. **Cards should escalate emphasis in a fixed ladder**: flat → +hover tint →
    +`shadow-e1`/hover-lift → +`shadow-e3`. Never skip to the top.
36. **Primary buttons should be 32px tall, 14px/500, `rounded-lg`, solid accent,
    `hover:bg-primary/80`, and press with `translate-y-px` — never `scale`.**
37. **Destructive buttons should be tinted (`bg-destructive/10`), not solid.**
    Reserve solid red for the confirm action inside a dialog.
38. **Buttons should auto-size their icons** via a descendant selector, and tighten
    padding on the icon side by 2px.
39. **Buttons should show loading as a present-participle label** ("Saving…"), not
    a spinner. Disable while pending.
40. **Inputs should be 32px tall, transparent-background, with a heavier border
    than cards**, and focus with `border-accent` + a 3px 50%-opacity ring.
41. **Form fields should stack: Label → 6px → control → 4px → error**, in a
    512px-max column, with 16px between fields.
42. **Forms should route server field errors back onto the field** that caused
    them, using the server's own message verbatim.
43. **Forms should hide advanced options behind a collapsible**, with a chevron
    that rotates 180°.
44. **Tables should use 44px rows, a 40px sticky header in 11px uppercase, `px-2`
    cells, `truncate` everywhere, and `hover:bg-surface-subtle`.**
45. **Tables should require an `emptyState` prop.** If the API can't force it, code
    review must.
46. **Tables should virtualize above ~200 rows** and be keyboard-navigable
    (↑/↓/Enter) with `aria-sort` on sorted columns.
47. **Badges should be 20px tall, pill-radius, 12px/500, with icons forced to
    12px.**
48. **Never render a chip for the default/unremarkable state.** A chip must change
    a decision to earn its pixels.
49. **Chips should say the consequence, not the enum** — `CANNOT BE UNDONE`, not
    `IRREVERSIBLE`.
50. **Dialogs should be small (384px), `rounded-xl`, `p-4`, with a 10% black scrim
    + tiny backdrop blur** — never a 50%+ blackout.
51. **Dialog footers should bleed to the edge** (`-mx-4 -mb-4`, `border-t`,
    `bg-muted/50`) and be `flex-col-reverse` on mobile, `flex-row justify-end` on
    desktop.
52. **Drawers should slide only ~10px plus a fade**, and should be *routes*, not
    component state, so they're shareable and closing never refetches.
53. **Guard only the dangerous direction of a toggle.** Turning protection off
    needs a dialog; turning it on does not.
54. **The highest-stakes confirmations should require typing a literal string.**
55. **Toasts should be 4s and carry an action link. Anything with unresolved
    consequences must be a persistent inline alert instead — never a toast.**
56. **Empty states should be `border-dashed`, `py-12`, centred, with a `size-6`
    subtle icon, and a required variant distinguishing "no data" from "no
    matches".** The no-matches variant always offers "Clear filters".
57. **Skeletons should match the real component's pixel dimensions.** Never a
    spinner above the fold.
58. **Every list must render exactly one of five states**: loading /
    empty-no-data / empty-no-matches / error / data.
59. **Error states should show the server's message verbatim in mono**, plus a
    retry button.

### Icons

60. **Use exactly one icon library.** Outline only.
61. **Icons should be 16px by default, 14px for secondary affordances, 12px inside
    running text or badges, 20–24px for empty states.** Nothing else.
62. **Icons should always inherit `currentColor`**, always be `shrink-0`, and
    always be `aria-hidden` when a text label is adjacent.
63. **One icon = one meaning, app-wide.** Write the mapping down.
64. **Choose the icon for the question the screen answers, not for the data type.**
65. **If the label already says it, drop the icon.**
66. **Icons are outlines; state indicators are filled dots (6–8px).** Never blur
    that line.
67. **Set `stroke-width: 1.75`** globally for a lighter, more premium weight at
    16px.

### Motion

68. **Every transition should be 100–220ms.** Hover 120ms, dialog 160ms, drawer
    220ms.
69. **Use one house easing curve** — `cubic-bezier(0.2, 0.8, 0.2, 1)` — for
    anything that arrives.
70. **Name durations by purpose, not by size** (`--duration-drawer`, not
    `--duration-md`), so reduced-motion can exempt functional motion.
71. **Only animate `opacity`, `transform`, and `box-shadow`.** Never `height`,
    `top`, or `width` (unless the width *is* the information, like a countdown).
72. **Never use `transition-all` on anything with layout properties.** Name the
    properties.
73. **Keep distances tiny**: 1px press, 4px rise, 10px slide, 5% zoom.
74. **Set the transform origin to the trigger** for popovers, selects, and menus.
75. **Nothing animates on arrival except the single most important number in the
    product**, and only when it increases.
76. **No page transitions, no staggered lists, no parallax, no spring physics, no
    scroll reveals.**
77. **Handle `prefers-reduced-motion` at the token layer, and gate looping
    animations at the mount layer** (don't mount them at all).
78. **Share timers.** One interval for N countdowns, and pause every interval on
    `visibilitychange`.

### Patterns & honesty

79. **Every page should open with the same header component**, and its description
    should be the question that page answers.
80. **Every content group should be the same `Section` component** — 18px title,
    12px gap, optional right-docked action.
81. **Every detail panel should be the same two-column key/value grid.**
82. **All filters, tabs, drawers, sorts, and pagination belong in the URL.** If an
    operator would paste it into Slack, it's a URL.
83. **Never fabricate a value.** Unknown renders `—` with a tooltip explaining
    why. `0` means zero.
84. **Label your derived interpretations** and show the source data next to them.
85. **Disclose the scope of a search** ("searching loaded records") rather than
    implying completeness.
86. **A disabled control with no explanation is a bug.** Wrap it in a tooltip.
87. **Write real microcopy for every consequential action**, naming what will
    happen in the user's own terms. Empty states should reassure when empty is the
    good outcome.
88. **Refuse scope you can't do well.** Link out to the tool that does it properly
    (`Open in <tool> ↗`, `text-info`, trailing 12px `ExternalLink`). A clean
    boundary reads as confidence.

### Architecture

89. **Split components five ways**: `ui/` (generic primitives, never hand-edited),
    `domain/` (your product's vocabulary), `layout/`, `feedback/`, `data/`.
90. **Feature folders may import from shared code, never from each other.**
    Promote to `domain/` instead.
91. **Never edit generated primitive files.** Add variants via `cva` in a sibling
    file so the generator stays non-destructive.
92. **Always merge an incoming `className` last** through a `cn()` helper.
93. **Use data attributes (`data-slot`, `data-state`, `data-size`) for styling**
    so parents can style descendants without prop drilling.
94. **Set the default border colour globally** so every `border` utility is
    automatically correct.
95. **No dependency without a written justification.** Before adding a chart,
    animation, or date library, check whether 40 lines of CSS or an `Intl` API
    covers it — usually it does.

---

## Appendix — drift between the spec and the shipped code

Fix these when porting; the *spec* side is the better system in each case.

| # | Spec (`docs/FRONTEND_RFC.md` §7) | Shipped code | Recommendation |
|---|---|---|---|
| 1 | Sidebar collapses to 64px | Never collapses; `settings.sidebarCollapsed` is written but never read | Implement the icon rail, or hide behind a `Sheet` under `lg` |
| 2 | Active nav item has a 2px left accent bar | Tinted pill only | Optional; the pill alone works |
| 3 | Page max-width 1440px, detail column 880px | `<main>` is unbounded | Add both wrappers |
| 4 | Icon `stroke-width: 1.75` | Lucide default `2` | Add `.lucide { stroke-width: 1.75 }` |
| 5 | Focus = `2px solid accent` + 2px offset | `focus-visible:ring-3 ring-ring/50` + `border-ring`, no offset | Keep the ring, but add `ring-offset-2` on light surfaces |
| 6 | Radius `sm 6 / md 10 / lg 14` | Correct — but `--radius-xl` left at Tailwind's 12px, so `rounded-xl` < `rounded-lg` | Set `--radius-xl: 1.125rem` or standardise on `rounded-lg` |
| 7 | Density toggle changes table row height (44 ↔ 36px) | `settings.density` is stored and shown in the UI but no component reads it | Wire it into `DataTable.ROW_HEIGHT_PX` |
| 8 | Targets ≥32×32, ≥44×44 for destructive | `size="sm"` = 28px used pervasively, including Deny/Approve | Raise `sm` to 32px |
| 9 | `aria-live` regions for pending arrivals / connection loss | Not present | Add `polite` to the badge, `assertive` to the banner and undo alert |
| 10 | — | `sonner.tsx` references an undefined `var(--radius)` | Point at `var(--radius-md-value)` |