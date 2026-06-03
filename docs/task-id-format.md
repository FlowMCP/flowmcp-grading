---
title: Task-ID Format
source: Grading-Interaction work package, Phase 1, PRD-003
status: format specification for the multidimensional grading Task-ID
---

# Task-ID Format

A **Task-ID** lets one grading handover carry a *set* of areas instead of a single
area. Rationale: running the same single-area command five times is error-prone;
emitting one handover over a set and distributing the work raises the success rate
by minimising the error surface.

The generator and parser live in `src/TaskId.mjs`. This note is the format
specification.

## Grammar

```
taskId      := schemaIdSlug "--" areaSetHash
areaSetHash := 8*HEXDIG          ; exactly 8 lowercase hex chars
```

The separator is the two-character sequence `--`. The `areaSetHash` is always the
final segment and is exactly 8 hex characters, matching `HASH_REGEX` in
`HashGenerator.mjs`.

## Set semantics (order- and duplicate-independent)

The area set is a **set, not a list**:

- the area names are de-duplicated and sorted ascending before hashing;
- therefore `[A, B]`, `[B, A]` and `[A, A, B]` all produce the **same** hash.

The hash is computed with `HashGenerator.computeHash({ value })` over the
canonical sorted-unique area array. No new hashing algorithm is introduced — the
8-hex prefix and canonical-JSON mechanism are reused for determinism and for the
`--` prefix-convention consistency.

## Determinism

`generate` is deterministic: the same `schemaIdSlug` and the same area set yield an
identical `taskId` across calls and across processes. This is what lets
`consume-scores` recompute and verify the area set later via `matchesAreaSet`.

## Additivity

The Task-ID is **additive** to the existing `schemaIdSlug`. The slug is validated
as a non-empty string and is **never** re-derived or mutated — the Task-ID simply
appends `--<areaSetHash>`. The `/goal` evaluator and the `[GRADING]` surfacing code
paths are untouched.

Because a `schemaIdSlug` may itself contain `--`, `parse` splits on the **last**
`--` and treats the final 8-hex segment as the `areaSetHash`. A slug such as
`flowmcp-community--etherscan--balance` is recovered correctly.

## Public API

| Method | Returns | Notes |
|--------|---------|-------|
| `TaskId.generate({ schemaIdSlug, areas })` | `{ taskId, areaSetHash, errors }` | every area must be in the area whitelist (`VALID_AREAS`); unknown area raises `TID-004` |
| `TaskId.parse({ taskId })` | `{ schemaIdSlug, areaSetHash, errors }` | splits on the last `--`; malformed tail raises `TID-007`, missing separator raises `TID-006` |
| `TaskId.matchesAreaSet({ taskId, areas })` | `{ ok, errors }` | recomputes the hash from `areas` and compares to the parsed tail |

## Embedding contract

The Task-ID is embedded in two places. The write and read are implemented in a
later phase; this note fixes only the placement contract.

- `prompts.json` — a top-level `taskId` field plus the multi-area payload skeleton:

  ```json
  {
    "taskId": "<schemaIdSlug>--<areaSetHash>",
    "areas": [
      { "area": "about-namespace", "results": [] },
      { "area": "namespace-skills", "results": [] }
    ]
  }
  ```

- `state.json` — the same `taskId` is recorded so the handover can be reconciled.

The verification flow (`consume-scores` checking the Task-ID, the area set, and the
per-area question count, plus partial-set handling) is a later phase and reuses
`matchesAreaSet` as its primitive.

## Task-ID is not an orchestrator-task

A **Task-ID** is the data identifier of a grading handover (a set of areas), living
in the payload, `prompts.json`, and `state.json`. An **orchestrator-task** is a
native per-step to-do entry the orchestrating agent creates to stay on track. An
orchestrator-task may *use* a Task-ID but *is* not one. See
`area-model-and-scope.md` Section F.
