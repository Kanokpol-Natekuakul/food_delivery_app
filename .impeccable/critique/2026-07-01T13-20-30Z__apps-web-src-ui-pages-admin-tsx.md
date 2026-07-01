---
target: Admin dashboard (/admin)
total_score: 29
p0_count: 0
p1_count: 0
timestamp: 2026-07-01T13-20-30Z
slug: apps-web-src-ui-pages-admin-tsx
---
# Critique (re-run) — Admin dashboard (`apps/web/src/ui/pages/Admin.tsx`)

Method: ⚠️ DEGRADED: single-context (harness policy blocks spawning sub-agents unless user asks)

## Design Health Score

| # | Heuristic | Score | Δ | Key Issue |
|---|-----------|-------|---|-----------|
| 1 | Visibility of System Status | 4 | +1 | Triage bar surfaces actionable counts at top; scheduler next-run visible |
| 2 | Match System / Real World | 3 | +1 | ADR jargon removed; operator language throughout |
| 3 | User Control and Freedom | 3 | +1 | Inline "ย้อนกลับ" backs out of destructive confirm; no post-confirm undo |
| 4 | Consistency and Standards | 3 | = | Side-stripe gone, terms aligned; downrank/suspend still same color |
| 5 | Error Prevention | 3 | +2 | Force-cancel + reset now two-step confirm; payout/approve unguarded (low-risk) |
| 6 | Recognition Rather Than Recall | 3 | = | Options visible, labels + aria present |
| 7 | Flexibility and Efficiency | 2 | = | Still no bulk approve/payout, no filter/sort on orders list |
| 8 | Aesthetic and Minimalist Design | 3 | +1 | Triage focal point + trimmed notes + no stripes; still dense by nature |
| 9 | Error Recovery | 2 | = | App-level notice only; no inline recovery for a failed payout |
| 10 | Help and Documentation | 3 | +1 | Notes clearer; empty states now teach what populates them |
| **Total** | | **29/40** | **+7** | **Good — solid foundation, address weak areas** |

## Anti-Patterns Verdict

**LLM assessment**: The wall is gone. The page now opens with a triage bar that answers "what needs me now," the five sections have a landmark structure with anchors, and the two banned side-stripes are removed. Reads as a considered internal tool, not a generic dense admin. No new slop introduced.

**Deterministic scan**: `detect.mjs` → `[]`, exit 0 (clean), same as before. The side-stripe borders it can't see in CSS are now gone at the source.

**Visual overlays**: Not available (no dev server, Chrome extension blocked). Source-inspection only.

## Overall Impression

Jumped from Acceptable (22) to Good (29). Every P1 from the first pass is closed: destructive actions are guarded, the page has a triage layer and real hierarchy, the actor row no longer overflows, and the copy speaks the operator's language. What remains is efficiency-at-scale (P2) and a couple of color/contrast polish items (P3) — none blocking.

## What's Working

1. **Triage bar** — the single biggest win. Real counts (open disputes / pending rates / payable accounts) as jump-links, mono-mango numbers per the Mono-Number Rule, not a decorative hero-metric. Closes the "where do I look first" gap.
2. **Inline confirm on destructive actions** — two-step (arm → confirm, auto-revert 4s), inline not modal per product register. The confirm is the one legitimately-hot (chili) action.
3. **Honest, teaching empty states** — every empty list now says what will fill it.

## Priority Issues (remaining)

### [P2] No efficiency path at scale
- **Why it matters**: Approvals, payouts, goodwill refunds are one-at-a-time; the "ออเดอร์ในระบบ" list has no filter/sort/search and grows unbounded as `LV*` orders accumulate. At 50+ orders an admin is scrolling.
- **Fix**: Bulk approve/pay for the queue sections; filter/sort (or collapse resolved) on the orders list.
- **Suggested command**: `/impeccable layout` (or a feature spec via `/impeccable shape`)

### [P3] Status still leans on color alone
- **Why it matters**: `downrank` and `suspend` badges are both chili; flag/act badges convey level by color on ~11px mono, borderline for 4.5:1 (Sam persona).
- **Fix**: Lead badges with a shape/icon so meaning survives without color; bump tiny `--paper-dim` text toward `--paper` or size up.
- **Suggested command**: `/impeccable colorize` then `/impeccable polish`

## Minor Observations

- `.a-orders` 2-col grid (≥1024px) still has ragged heights (settle block vs single button).
- Reset remains the last element — now guarded, so lower risk.
- `.a-wrun` copy "(กดถอนเอง)" is slightly redundant next to the label.

## Questions to Consider

- When the orders list hits hundreds of rows, is filter/sort enough, or does it want a separate "needs settlement" queue like the triage bar's other targets?
- Should the badge system encode level by icon+shape so it's readable in grayscale / high-contrast mode?
