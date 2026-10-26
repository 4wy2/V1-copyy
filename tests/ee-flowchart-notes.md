EE flowchart verification — 2026-10-26

Baseline and scope

- Safe checkpoint: `6f3acab`, recording the current 1,525-line EE application before tuning. Only EEflowchart.html was committed; unrelated staged homepage work was excluded.
- `Hours.html` was absent from the working tree and local origin/main tree. Work uses the current EEflowchart.html with the hours/bulk/recommendation tools; its provenance against a separate approved Hours.html cannot be independently confirmed. No older flowchart design or earlier snapshot was used.
- Changed application file: EEflowchart.html. No dependency, academic rule, storage key, theme, translation, branding, import/export format or other page was changed.

Reproduce

Requires Node and installed Playwright Chromium. No web server or external network is required; test routing serves the real HTML at an isolated HTTP origin. Replace the Playwright module path as appropriate.

```sh
git show 6f3acab:EEflowchart.html > /tmp/ee-hours-current-baseline.html
EE_BASELINE=/tmp/ee-hours-current-baseline.html PLAYWRIGHT_MODULE_PATH=/home/codespace/.npm/_npx/420ff84f11983ee5/node_modules/playwright node --test tests/ee-flowchart.test.cjs
```

Without EE_BASELINE, the two optional comparison tests skip. All other tests run normally. The JSON academic fixture was extracted from the current pre-edit source, including all localized function bodies; do not regenerate it from modified application code to bypass an academic regression.

Results

27 passed, 0 failed, 0 skipped, 25.50 seconds in the final full run. Viewports: mobile 390×900, tablet 768×900, desktop 1440×900, plus responsive height/width changes. Fresh browser contexts isolate localStorage and all page exceptions are collected through each workflow.

Coverage includes:

- All 49 course IDs/codes/names/semesters, every credit value (128 total), 54 directed typed connections, 10 electives and all Arabic/English translation strings/functions.
- Direct prerequisite/co-requisite/dependent highlighting, selected course panels, keyboard activation and Escape, status changes and persistence.
- Bulk toggle/deselect/cancel, summed selected credits, completed/current/none actions, cleared selections and button accessibility state.
- Credit-based percentages, current-course exclusion from completed credits, 121/122-hour internship eligibility boundary, full 128-hour completion and recommendation assumptions.
- Search, no results, completed/current/available filters, list/map preference, theme/language persistence, brand labels, import/export tools and help/electives.
- Legacy migration, malformed stored JSON, denied writes, versioned/legacy imports, invalid imports and cancelled imports.
- Real CDP touch taps with jitter, mouse drags from cards, cumulative movement threshold, drag-click suppression, keyboard activation after dragging, two-finger anchored pinch with midpoint translation, cancellation, active capture release on view change, list isolation and ordinary native wheel scrolling.
- Zoom anchor/bounds/fit, persistent SVG nodes, zero course geometry reads during zoom, no-op refresh DOM budget, coarse-pointer 44px toolbar and status targets, horizontal overflow and resize handling.
- Exact recommendation order, co-requisite bundles, scores and eligibility match the pre-edit implementation for four progress scenarios and both assumption settings.

Performance

Three repeated 30-update zoom-in bursts at 1440×900, comparing the fresh checkpoint with the implementation. Raw measurements and units: `.ecc/benchmarks/ee-flowchart-current.json`.

| Metric per burst | Before | After |
| --- | ---: | ---: |
| Course geometry reads | 1470 | 0 |
| SVG child-list replacements | 30 | 0 |
| Browser layout passes | 120 | 2 |
| Browser style recalculations | 120 | 2 |
| Median browser task duration | 54.70ms | 3.51ms |
| Median elapsed time including four frame waits | 83.0ms | 63.9ms |

These are synthetic browser measurements, not FPS or a physical-phone responsiveness guarantee. A separate mandatory test confirms ten unchanged refresh calls make zero mutations inside course nodes. SVG geometry rebuilds only for actual map layout/view changes; selection updates existing path attributes and paint order. Zoom/pan writes coalesce into one animation frame; map height and immutable graph lookups are cached. Completed-course sets are shared per refresh and recommendation results are cached until state or assumption changes.

ECC review and Taste review

ECC benchmark, E2E testing and verification-loop workflows guided the implementation and review. Inline JavaScript parses successfully and `git diff --check` passes. There is no package build/type/lint configuration for this standalone page; those checks and code coverage percentages are not claimed. Reviewed diffs for academic data/logic preservation, cache invalidation, input lifecycle, sanitized imports, storage compatibility and unrelated edits. No new dynamic HTML sources or external writes were introduced.

ECC DevTools could not launch because its expected /opt/google/chrome/chrome executable is missing. Installed Playwright Chromium and CDP provided automated browser tests and layout/script metrics instead.

Taste was limited to existing-app review and touch/control refinements, with no visual redesign or new direction. Its inspector ran at 1440/768/390 via the installed Chromium and a temporary no-sandbox launcher. All six inspector screenshots and the Playwright light/English screenshots were opened. Inspector output: 5 FAIL categories (micro-label, emoji/checkmark, gradient-text branding, tiny-text, tablet edge-text), 1 phone edge-text warning. The relevant labels, typography, branding and margins pre-exist in the baseline and were retained under the user's preservation requirements. Inspector screenshots/report are in /tmp/ee-current-taste. Playwright screenshots are /tmp/ee-current-{mobile,tablet,desktop}.png and corresponding -dark.png files (the latter include resized layouts).

Remaining limitations

- A separate approved Hours.html was unavailable; only the current-file baseline was verifiable.
- Chromium emulation was exercised, including native CDP touch input; physical iOS/Android, Safari and Firefox were not tested.
- Full-map fit necessarily makes course text/touch areas small on phones. Existing readable default list mode and map zoom remain available; original fit behavior was retained.
- Existing design-lint findings remain, as above. No claim of a clean Taste audit.
- No push, merge or deployment performed. Improvements remain as local changes after the safe checkpoint.
