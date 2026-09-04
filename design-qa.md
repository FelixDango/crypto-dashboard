# Design QA

## Evidence

- source visual truth path: `C:\Users\Felix\.codex\generated_images\01a06b4a-140f-71a0-a604-8778ed5ce629\exec-ad1af970-63e8-4727-9aa4-e931d5983863.png`
- implementation URL: `http://localhost:4173/dashboard?range=30d`
- implementation screenshot path: `C:\Users\Felix\Documents\personal krypto dashboard\.tmp\dashboard-desktop-normalized.png`
- responsive screenshot path: `C:\Users\Felix\Documents\personal krypto dashboard\.tmp\dashboard-mobile.png`
- empty-state screenshot path: `C:\Users\Felix\Documents\personal krypto dashboard\.tmp\dashboard-empty-desktop-final.png`
- viewport: desktop requested at 1440 × 1024 CSS px; mobile requested at 390 × 844 CSS px
- pixels and density normalization: source was 1487 × 1058 px; browser content capture was 1425 × 1013 px at 1× density after in-app browser chrome and scrollbar subtraction. The source was bicubic-downsampled to 1425 × 1013 px at `.tmp\reference-normalized-1425x1013.png`; the implementation was not rescaled. Mobile capture was 375 × 812 px from the 390 × 844 CSS viewport after the same browser subtraction.
- state: dark theme, EUR, privacy off, 30-day range, four open holdings, current prices, snapshot history, and a €120,000 goal. Current holding values and per-asset returns match the visual target. Cost basis and total return use the app's internally consistent average-cost calculations, so they intentionally differ from the illustrative mock values.

## Full-view comparison evidence

The pixel-normalized source and browser-rendered implementation were opened together in one comparison input. The final implementation preserves the selected direction's major composition: a 202 px utility rail, prominent net portfolio value, compact return/cost summary, inline range control, dominant trend chart, two concise observations, a low-emphasis goal strip, and a parallel holdings ledger. The implementation deliberately keeps price freshness beside the value it qualifies instead of reproducing the mock's detached top-right date block.

No actionable P0, P1, or P2 mismatch remains in the populated desktop state. The implementation has comparable information density and visual hierarchy without reintroducing the original dashboard's wall of cards.

## Focused region comparison evidence

- Hero and chart: display-value weight, selected-period treatment, positive-state color, chart axis placement, and baseline/grid contrast were readable at the normalized full-size comparison and aligned with the source hierarchy.
- Holdings: four real coin assets were rendered with the existing icon pipeline; row rhythm, value/allocation hierarchy, semantic gain/loss colors, dividers, and total row matched the target structure.
- Navigation and goal strip: active state, icon family, border rhythm, and secondary emphasis were inspected at full resolution.
- Responsive: the 390 × 844 viewport was checked above and below the fold. The shell becomes a compact top brand bar plus persistent three-item bottom navigation; the portfolio stack and holdings rows do not overlap or clip.
- Empty state: separately rendered against an isolated empty SQLite fixture. It presents one guided first-entry state instead of duplicate empty chart and holdings panels.

## Required fidelity surfaces

- Fonts and typography: system Inter stack, restrained weights, tabular financial figures, tight display tracking, readable small labels, and stable wrapping. The real product name wraps to two lines in the narrow rail; this is an acceptable content-specific difference from the shorter concept name.
- Spacing and layout rhythm: desktop column ratio, dividers, chart height, holdings rows, and goal placement are consistent with the selected direction. Mobile spacing preserves touch targets and separates the fixed navigation from scroll content.
- Colors and visual tokens: near-black background, charcoal elevated surfaces, muted cool-gray text, teal primary/accent, and green/red semantic returns map closely to the source. No decorative gradient was introduced.
- Image quality and asset fidelity: crypto marks are real provider assets delivered through the existing server-side icon route. Interface icons use the existing Lucide family; no handcrafted SVG, CSS illustration, emoji, or placeholder artwork was added.
- Copy and content: labels are standalone and task-oriented. `Portfolio`, `Activity`, and `Settings` replace the former feature inventory; the empty-state language explains the manual ledger and avoids exchange-connection implications.

## Findings

- No remaining P0/P1/P2 findings.
- [P3] The actual product name wraps in the sidebar while the shorter concept name stays on one line. This preserves the configured name and does not affect navigation or hierarchy.
- [P3] Browser accessibility output represented the expanded Activity menu children generically even after explicit `aria-label` values were added. Visible menu copy, semantic link/button elements, keyboard disclosure behavior, and focus styling are present; a dedicated screen-reader pass could validate the browser-tool discrepancy later.

## Comparison history

### Pass 1 — blocked

- [P2] The empty dashboard repeated the same absence across separate chart and holdings areas.
  - Fix: replaced the populated two-column shell with a single guided first-entry state whenever there are no open holdings; the header-level CTA is suppressed in that state to avoid duplicate primary actions.
  - Post-fix evidence: `.tmp\dashboard-empty-desktop-final.png` and the 390 × 844 browser capture show one CTA and one explanation path.
- [P2] The first-entry icon occupied a stretching automatic grid column, creating an excessive icon-to-copy gap on desktop.
  - Fix: changed the grid to an explicit 3 rem icon track with a 1.5 rem content gap and a 720 px maximum width.
  - Post-fix evidence: `.tmp\dashboard-empty-desktop-final.png` shows the icon and copy as one coherent cluster.

### Pass 2 — passed

- Re-captured the populated implementation at desktop size, normalized the source to the same 1425 × 1013 pixel frame, and compared them together.
- Re-checked populated and empty mobile layouts, core navigation, Add transaction entry, dialog opening/cancel, 7-day range navigation, privacy-state cycling, and the Activity secondary-actions disclosure.
- Browser console warnings/errors checked: none.

## Implementation checklist

- [x] Replace feature-oriented primary navigation with Portfolio, Activity, and Settings.
- [x] Consolidate primary portfolio value, performance, history, observations, goal, and holdings into one scan path.
- [x] Preserve contextual links to advanced analytics, planning, asset details, import/export, and price refresh.
- [x] Provide a single purposeful empty state.
- [x] Verify desktop, mobile, populated, empty, privacy, range, navigation, and transaction-entry states.
- [x] Run type checking, linting for changed files, unit/integration tests, and production build.

## Follow-up polish

- A future branding pass could shorten the configured app name or allocate a slightly wider brand row if a one-line lockup becomes important.

final result: passed
