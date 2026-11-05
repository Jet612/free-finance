# Design QA

The dashboard was rebuilt in November 2026. This records how it was judged and
what's still open.

## Direction

The look comes from the security printing on banknotes and checks: pale safety
paper, one banknote ink, and engraved lines. Color only appears when it means
something: green for money in, red for over, ochre for watch. The dark "note"
panel and its data-shaped engraving are the one bold element.

- Type: Mona Sans, using its width axis (wide for figures and headlines). Columns
  of money use Hanken Grotesk, because Mona's tabular digits are a slashed,
  typewriter-style set.
- Headlines state the answer ("$931 left of $3,100"), not the name of the page.
- Five destinations: Today, Transactions, Spending, Net worth, Settings. Existing
  URLs didn't change.

## How it was rated

Each round was a new AI reviewer that hadn't seen earlier rounds, using the running
app, screenshots, and the source, compared with Monarch, Copilot, and Mercury.

| Round | Score | What it found |
| --- | --- | --- |
| Before | about 5 | First-pass estimate, not an independent review |
| 1 | 6.4 | Rent missing from "after bills", totals disagreeing between pages |
| 2 | 7.2 | Coming up not adding up, 750-row cap breaking drill-downs |
| 3 | 7.8 | Card payments missing, no way to add a home |
| 4 | 7.8 | Verdict ignoring income, rent distorting pace |
| 5 | 8.2 | Spending pages hiding a stale card |
| 6 | 8.2 | Verdict warning too often, failed saves crashing the page |
| 7 | 8.5 | No blockers or majors |

The reviewer prompt changed twice. Round 3 added that a small free app needn't
match a funded one feature for feature. Round 5 added that "major" means something
that misleads or stops a real user, and that a list of refinements alone shouldn't
lower a score. Later scores aren't strictly comparable with earlier ones.

These are AI reviews, not studies with real users. A few small fixes landed after
round 7, covering the forecast caveat, chart legend, and empty-state copy. They
passed the automated checks but weren't re-scored.

## How it was checked

- `pnpm test`: 139 tests. `pnpm test:db`: 69 tests on a scratch Postgres.
- The real SQL and the demo's separate math were compared on the same ledger: 44
  of 44 figures matched to the cent.
- Scripted browser checks covered search, hiding amounts (no amount escapes on any
  page), filters, drill-downs, the drawer, category corrections, budgets, assets,
  chart hover and keyboard use, and failed saves while offline.
- Every page was swept at 1440px and 390px, in light and dark, for overflow and
  console errors.

## Not tested

- Real sign-in, Plaid Link, Refresh, Reconnect, and connection removal. The real
  routes ran with a stubbed login and seeded data, so `/security` was only seen
  through its demo twin.
- Real bank data. Plaid's raw merchant names may be messier than the sample's.

## Open ideas

- Budgets on subcategories, such as groceries apart from restaurants
- Home-screen install: a manifest and icons
- Merchants in the ⌘K results, and merchant renaming and transaction splitting
- Today's desktop focus order, which reaches the right column first
- Security still uses stock cards and is the least finished page
