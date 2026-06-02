# Per-Area Iteration Loop (Improvement Loop)

**Source:** Sourced from `skills/*-apply-improvement/SKILL.md` and
`skills/*-start-grade/SKILL.md` (READ-ONLY — those files are scheduled for
removal after this knowledge is extracted; see Memo 097 Kap. 9.0.1). The loop
behavior documented here is the canonical surviving record.

**Critical note:** `src/harness/ImprovementLoop.mjs` is a DIFFERENT, separate
engine (a provider-level improvement loop driven by `AreaScorer` callbacks). It
is used only in its own unit test and is NOT the per-area iteration loop
described in this document. The per-area loop lived solely in the SKILL.md
files.

---

## Overview

Each grading area runs its evaluation through a **start → evaluate → apply-improvement**
cycle. The cycle is controlled by two skills per area:

| Skill role | File pattern |
|------------|--------------|
| start + evaluate | `skills/<area>-start-grade/SKILL.md` |
| decide + re-iterate or finalize | `skills/<area>-apply-improvement/SKILL.md` |

One complete pass (iteration 1) runs:

```
start-grade → [sub-agent evaluator] → apply-improvement
                                             ↓
                                     continue? → start-grade (iteration + 1)
                                     finalize? → write grading JSON
```

---

## Iteration Parameters

| Parameter | Default | Notes |
|-----------|---------|-------|
| `iteration` | 1 (initial) | 1-based counter, incremented per re-iterate |
| `maxIterations` | **1** (new default per Memo 097 Kap. 9.0) | Historically was 3 in all SKILL.md; opt-in higher via caller parameter |

The historical SKILL.md default was `N = 3` with the rationale "2–3 iterations
are recommended and cost-verified in a practical mini-test." Memo 097 changed
this to `maxIterations = 1` as the new default (single pass), with higher
values available as an explicit opt-in. The parameter is passed by the caller to
`apply-improvement`; if absent, the default applies.

---

## Termination Conditions

The loop finalizes when ANY of the following conditions is true (checked at the
start of each potential re-iteration, before spawning a new evaluator call):

| Condition | Action |
|-----------|--------|
| `iteration >= maxIterations` | Finalize (save current answer) |
| `improvementHints[]` is empty | Finalize (no improvement potential) |
| `responseJson.blocker` is set | Finalize with blocker status |
| Parse error on evaluator response | Finalize (save raw answer) |
| (`confidence == "high"` if output-schema carries that field) | Finalize |

Otherwise: re-iterate with `iteration + 1`.

---

## Re-Iteration Mechanics

When the loop continues, `apply-improvement` hands off to `start-grade` with:

```json
{
  "<context-path>": "<unchanged>",
  "personaSlug": "<unchanged>",
  "iteration": "<iteration + 1>",
  "previousGradingPath": "<path or inline data of previous responseJson>"
}
```

The next `start-grade` run:

1. Loads the **previous evaluator answer** (`previousGradingPath` / inline hand-off).
2. Extracts `improvementHints[]` from that answer.
3. Prepends them as an `## Improvement Hints` block in the new prompt, with the
   explicit instruction to address each hint and improve the answer.
4. Prepends the **previous full response** as a `## Previous Response` block
   (full text, not summarized).
5. **Re-asks all questions of the area** — no partial question sets across
   iterations. Every call always covers the complete question set for the area.
6. Builds the prompt via `PromptBuilder.build(...)` and spawns a fresh sub-agent.

Optional intermediate state may be written to
`grading-data/_tmp/<hash>--iteration-<n>.json` (gitignored) for recovery.

---

## Question-Set Invariant

Every iteration re-answers ALL questions of the area (or, for selection-skills,
all questions of one sub-area L1/L2/L3). The loop never answers a partial subset
of questions within an area. Partial grading is a subset of **areas**, not of
questions within an area.

---

## Final Write

When the loop finalizes, `apply-improvement` writes the grading JSON to the
gitignored `grading-data/` folder. Path template:

```
grading-data/<store>/<identifier>/gradings/<schemaHash>--<ISO-ts>--<personaSlug>.json
```

Where `<ISO-ts>` uses hyphens instead of colons for filesystem compatibility
(`2026-MM-DDTHH-MM-SSZ`). Filename is built via
`Grading.formatGradingFilename({ hash, ts, persona })` — never by string
concatenation.

The skill emits: `{ "finalPath": "<absolute-path>", "iteration": <n>, "status": "done" }`.

---

## Generator / CLI Integration (Memo 097)

The `apply-improvement` + `start-grade` SKILL.md pair described above are
scheduled for removal (Memo 097 Phase A). Their replacement is:

- `maxIterations` as an explicit CLI/generator parameter (default 1, opt-in higher).
- The iteration logic moves into the caller harness, not a SKILL.md body.
- `PromptBuilder.build()` receives `previousHints` / `previousResponse` as
  structured parameters rather than being assembled in a SKILL.md.

This document preserves the loop semantics so no knowledge is lost in the
transition.

---

## Cross-refs

- `src/PromptBuilder.mjs` — builds each iteration's prompt
- `src/harness/ImprovementLoop.mjs` — separate provider-level loop (NOT this loop)
- `docs/harness.md` — sub-agent spawn mechanism (`Agent()` call)
- `prompts/generated/questions.json` — the question set per area
- `docs/grading-filename-convention.md` — filename construction rules
