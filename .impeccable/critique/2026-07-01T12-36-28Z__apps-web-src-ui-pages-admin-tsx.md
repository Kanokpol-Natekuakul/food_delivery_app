---
target: Admin dashboard (/admin)
total_score: 22
p0_count: 0
p1_count: 3
timestamp: 2026-07-01T12-36-28Z
slug: apps-web-src-ui-pages-admin-tsx
---
# Critique — Admin dashboard (`apps/web/src/ui/pages/Admin.tsx`)

Method: ⚠️ DEGRADED: single-context (harness policy blocks spawning sub-agents unless user asks)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Section counts + settlement next-run good; no "what needs my action now" triage |
| 2 | Match System / Real World | 2 | Internal doc jargon leaks into UI copy ("ADR 0006/0004/0003", "auto-action ขั้นบันได") |
| 3 | User Control and Freedom | 2 | No undo/confirm on force-cancel or reset-all |
| 4 | Consistency and Standards | 3 | Components consistent; left-stripe meaning + two-chili-meanings diverge |
| 5 | Error Prevention | 1 | Force-cancel (triggers refund/settlement) and reset-all-data are one-click, unguarded |
| 6 | Recognition Rather Than Recall | 3 | Options visible, labels + aria present |
| 7 | Flexibility and Efficiency | 2 | No bulk approve/payout, no keyboard, orders list has no filter/sort/search |
| 8 | Aesthetic and Minimalist Design | 2 | Flat wall of 5 same-weight sections; verbose notes |
| 9 | Error Recovery | 2 | App-level notice bar only; no inline recovery for a failed payout/action |
| 10 | Help and Documentation | 2 | Inline notes are good instinct but verbose + reference internal ADRs |
| **Total** | | **22/40** | **Acceptable — significant improvements needed** |

## Anti-Patterns Verdict

**LLM assessment**: Does NOT read as generic AI slop — the night-market dark theme, honest settlement math, and disciplined mono-numbers give it a real point of view consistent with DESIGN.md. The failure mode here is not "templated SaaS" but **an unstructured dense admin**: five equal-weight sections stacked in one scroll with no triage layer.

**Deterministic scan**: `detect.mjs` on Admin.tsx → `[]`, exit 0 (clean). The detector scans markup/className strings and found nothing; the real issues live in CSS + copy + interaction, which it can't see.

**Where LLM beats detector**: two **side-stripe borders** (`border-left:4px` — a documented absolute-ban and a Don't in our own DESIGN.md) on `.a-dispute` (chili) and `.a-order` (paper-dim), plus a **broken token** `background:var(--ink-bg)` on `.a-rcounter input` (`--ink-bg` is undefined → transparent input).

**Visual overlays**: Not available. No dev server running and the Chrome extension is blocked for injection on localhost (per project handoff). Reporting from source inspection only.

## Overall Impression

An honest, capable admin tool that opens to a **wall**. Everything works and the data is truthful, but the page gives the admin no help deciding *where to look first*. The single biggest opportunity: add a triage layer (what needs action now) and give the five sections real hierarchy — then guard the two destructive one-click actions.

## What's Working

1. **Radical honesty** — every number is real (settlement split with commission %, complaint rate `n/volume`, live wallet balances). Directly serves PRODUCT.md principle "ความจริงเดียว ไม่โกหกผู้ใช้".
2. **Glow discipline holds** — no glow spam; `btn--mango` for confirmations, `btn--ghost` for secondary/destructive, mono for all numbers. Consistent with the disciplined-glow decision.
3. **Accessibility effort is visible** — every icon/short button carries an `aria-label` (e.g. `จ่ายออก ${label}`, `ยกเลิกออเดอร์ #${o.id}`). Above average for an internal tool.

## Priority Issues

### [P1] Destructive actions have no confirmation
- **Why it matters**: Force-cancel posts refunds/settlement to the ledger; "ล้างข้อมูลที่บันทึก" wipes all persisted state. Both are single clicks. A mis-click by a tired admin is irreversible and moves money.
- **Fix**: Confirm step before force-cancel and reset (inline "แน่ใจ? ยืนยัน/ยกเลิก" or a small dialog). Reset already hints danger on hover (turns chili) — make it require confirmation.
- **Suggested command**: `/impeccable harden`

### [P1] No triage layer; flat wall of five equal sections
- **Why it matters**: All five `h2` are the same size/weight as each other and as `.a-who`. Open items (disputes needing a decision, rate requests pending, payable accounts) are mixed with resolved ones in the same lists. The admin must scan the whole page to find what needs them. Cognitive load is high the moment the page loads.
- **Fix**: Add a top "needs attention" summary (N open disputes · N pending rate requests · N payable accounts) as jump targets; differentiate section headers (or collapse resolved items); sort open/actionable items to the top of each list.
- **Suggested command**: `/impeccable layout`

### [P1] Actor row packs up to 7 elements with no wrap
- **Why it matters**: `.a-actor` is a single non-wrapping flex row holding name, stat, flag badge, notify badge, downrank badge, susp badge, and the suspend button. When a party is flagged + notified + downranked + suspended, that overflows on the 560px mobile width and squeezes the name.
- **Fix**: Allow wrap or restructure to two lines (identity line + status/action line); group the status badges into one cluster.
- **Suggested command**: `/impeccable layout`

### [P2] Banned side-stripe borders + one broken token
- **Why it matters**: `.a-dispute` and `.a-order` encode status with a `border-left:4px` colored stripe — the exact anti-pattern banned by the skill and by our own DESIGN.md ("Don't use side-stripe border > 1px"). It's also a weak, color-only status signal. Separately, `.a-rcounter input` sets `background:var(--ink-bg)`, but `--ink-bg` doesn't exist (tokens are `--ink`/`--ink-card`/`--ink-line`) → the counter input renders with no background.
- **Fix**: Replace the left stripe with a full border tint or a status pill (fault/status is already shown as a pill — lean on that); change `--ink-bg` to `--ink`.
- **Suggested command**: `/impeccable polish`

### [P2] Internal ADR jargon in user-facing copy
- **Why it matters**: Section notes read "…(ADR 0006)", "…(ADR 0004)", "auto-action ขั้นบันได". ADR numbers are internal documentation references that mean nothing to an admin operating the marketplace — a Match-Real-World leak.
- **Fix**: Rewrite notes in operator language; drop the ADR citations (or move them to code comments, where they already belong).
- **Suggested command**: `/impeccable clarify`

## Persona Red Flags

**Alex (Power User)**: Approvals, payouts, and goodwill refunds are all one-at-a-time — no bulk approve/pay. No keyboard shortcuts. The "ออเดอร์ในระบบ" list has no filter/sort/search and grows unbounded as `LV*` orders accumulate; at 50+ orders it's an unmanageable scroll. Force-cancel with no confirm is fast (good for Alex) but unguarded (bad for everyone).

**Sam (Accessibility)**: Status is carried by color on small mono text — `.a-flag`/`.a-act`/`.a-fault` at .7rem in mango/chili/pandan; `downrank` and `susp` both use chili (two meanings, one color). `--paper-dim` on `.a-dstat`/`.a-actor__stat` at ~11px is borderline for 4.5:1. Fault status on order cards is conveyed largely by the left stripe color — meaning by color alone. Global `:focus-visible` is present (good).

**Ops Admin (project-specific)**: Manages a live marketplace and needs to triage — but the page has no "here's what's waiting on you." They land in "กำกับดูแลผู้ใช้" (moderation) even though the time-sensitive work is usually pending disputes and rate requests further down.

## Minor Observations

- Reset button is the very last element on the page — the experience ends on a destructive action.
- `.a-orders` becomes a 2-col grid ≥1024px but cards are variable-height (settle block vs cancel button) → ragged rows.
- Empty states are honest but terse ("ยังไม่มีรายการ") with no guidance on what would populate them.
- Every section note is always-on; once an admin learns the tool, the verbose notes become permanent visual noise (no dismiss/collapse).

## Questions to Consider

- What if the admin landed on a single "needs your attention" triage panel, with the five current sections as drill-downs?
- Does force-cancel need to live one click away, or behind a deliberate confirm — and does reset belong on this screen at all?
- If the orders list will hit hundreds of rows, what's the filter/sort story before it becomes unusable?
- Could the status badges lead with an icon/shape (not just color) so downrank ≠ suspend at a glance and color isn't the only signal?
