# Design QA

## Evidence

- Source visual truth:
  - `/var/folders/f0/j1v2xgxn50vb568n4n3tf_580000gn/T/codex-clipboard-7111a4a7-8fbe-40fc-b417-a81983ef90db.png`
  - `/var/folders/f0/j1v2xgxn50vb568n4n3tf_580000gn/T/codex-clipboard-e7addc8f-5725-4a8c-8b9a-38380dbccf4b.png`
- Browser-rendered implementation:
  - `/tmp/free-finance-design-qa/overview-final.jpg`
  - `/tmp/free-finance-design-qa/transactions-final.jpg`
- Combined comparison inputs:
  - `/tmp/free-finance-design-qa/overview-comparison-final.jpg`
  - `/tmp/free-finance-design-qa/transactions-comparison-final.jpg`
- Reference pixels: `1487 × 1058` each.
- Implementation overview pixels: `1280 × 720`.
- CSS viewport: `1280 × 720`; device pixel ratio `2`.
- Normalization: each reference was cropped from the top and resized to
  `1280 × 720` for the full-view comparison. The transaction comparison used
  a bottom crop of the dense reference at the same normalized size.
- State: authenticated owner view, dark theme, real instance data, desktop
  navigation visible. A `390 × 844` responsive pass was also performed.

## Full-view comparison

The overview intentionally combines the first reference's large net-worth
hierarchy and open canvas with the second reference's persistent sidebar,
near-black palette, provider sync action, and compact control density.

- Fonts and typography: Geist preserves the references' neutral grotesk feel.
  Metric values use Geist Mono for stable tabular alignment. Weight, casing,
  and tracking match the quiet ledger hierarchy.
- Spacing and layout rhythm: the main net-worth story remains the largest
  region, the sidebar is narrower than the content rail, and thin rules replace
  unnecessary card chrome. The range control and sync action occupy the same
  secondary hierarchy as the references.
- Colors and visual tokens: warm white and near-black themes share the same
  emerald primary, low-contrast borders, muted labels, and semantic
  green/amber/red states.
- Image quality and asset fidelity: the references do not require photography
  or illustration. Lucide is the closest installed line-icon family and remains
  sharp at every tested density; no placeholder images, emoji, or custom-drawn
  logo substitutes are used.
- Copy and content: labels are app-specific and truthful. Values come from the
  database, subscription insights are explicitly described as heuristic, and
  transaction times are never invented.

## Focused-region comparison

The transaction table was compared against the dense activity region in the
second reference. The implementation retains the compact rows, search and
filter controls, account/category context, monospaced amounts, pending status,
and strong column alignment. It adds a truthful “Time unavailable” state when
Plaid supplies only a date.

## Comparison history

### Iteration 1

- [P2] The overview had no semantic `h1`, weakening page hierarchy for
  assistive technology.
- [P2] The initial `340px` chart height pushed all lower-level information
  below the first desktop viewport.

Fixes:

- Promoted the net-worth label to the page `h1`.
- Reduced the desktop chart to `280px` while preserving the same wide,
  low-profile trend shape.

Post-fix evidence:

- `/tmp/free-finance-design-qa/overview-final.jpg`
- Exactly one `h1`, `1280px` document width with no horizontal overflow, and a
  `280px` chart were verified in the browser.

### Iteration 2

No actionable P0, P1, or P2 differences remained. The lack of a multi-point
line on this instance is an expected real-data state: only one daily snapshot
currently exists, so no historical points were fabricated.

## Interaction and responsive checks

- All nine navigation destinations render with the expected page title.
- Net-worth range selection changes its pressed state.
- Transaction search produces and clears the no-results state.
- Mobile layout hides the desktop sidebar, has no horizontal overflow, and
  exposes all nine destinations through the menu.
- No current browser console errors were found.

## Residual P3 polish

- A future sync history with multiple daily snapshots will make the overview
  visually richer without changing the layout.
- Merchant logos could be added later if Plaid coverage is consistent enough
  to avoid mixed placeholder quality.

final result: passed
