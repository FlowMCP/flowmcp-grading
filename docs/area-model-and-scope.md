---
title: Area-Model and Scope (authoritative fact base)
source: Grading-Interaction work package, Phase 1, PRD-001
status: authoritative anchor for scope + area-model
---

# Area-Model and Scope

This note is the single source of truth for two things every later PRD (and every
implementing agent with empty context) must agree on:

1. What the prior schema-upgrade work package already delivers — and is therefore
   **NOT** in scope of the current grading-interaction work package.
2. The Area-Model as a fact base: the 11 areas, the focus on the 6 Provider-Areas,
   the deterministic-then-non-deterministic progression *inside* each area, and the
   worst-case namespace rollup that omits missing or optional areas.

If a later PRD disagrees with this note, the PRD is wrong and this note must be
amended first. There is exactly one source of truth for scope and the area-model.

This note carries **no runtime behaviour**. It is a design anchor only.

---

## Section A — Build-forward scope ledger

The grading-interaction work package builds **forward** on top of the prior
schema-upgrade work package. It does not re-delegate or re-decide what is already
delivered. The table below pins each item to a code anchor or a chapter reference.

### A.1 Already delivered → NOT scope

| Item | Anchor |
|------|--------|
| Librarian principle (island, single producer, sync-only writer) | prior work package, librarian chapter |
| CLI four commands (`import` / `emit-prompts` / `consume-scores` / `state`) | `FlowMcpCli.mjs` |
| emit-on-failure routes a failing import to `blocked` | `GradingImport.mjs:93-114` |
| improvementHints in the sidecar `.loop.json` | prior work package, loop chapter |
| 33 SKILL.md cleanup + generator-via-CLI | prior work package |
| Kanban two lists + sync-only writer | prior Kanban work packages |
| Default area set + multi-area `prompts.json` / `scores.json` | `FlowMcpCli.mjs:12937/13003` |
| Single-area `--phase` selector | `FlowMcpCli.mjs:8491/12873` |

### A.2 Genuinely new → scope

| Item | Reference |
|------|-----------|
| Multidimensional Task-ID over an area set | PRD-003 (format), Phase 2 (emit/consume) |
| Multi-area selector + emit-time applicability filter | Phase 2 |
| Data-driven `dependsOn` + `requiredLevel` graph | PRD-002 (data + derivation), Phase 2 (evaluation) |
| `doctor` command (worklist + tips, read-only, terminal) | Phase 3 |
| Summary-driven next-action | Phase 3 |
| Orchestrator-task sequencing (native to-do entries) | Phase 4 / orchestration chapter |

---

## Section B — The 11 areas

The canonical area list is `VALID_AREAS` in `PromptBuilder.mjs:31`. The
persona-required flag is `PERSONA_REQUIRED_BY_AREA` in `PromptBuilder.mjs:47`
(4 neutral, 7 with persona). Provider vs. selection membership is
`AreaPromptLoader.mjs:47-54` (`PROVIDER_AREAS`) and `:61-66` (`SELECTION_AREAS`).

| # | Area | Persona required | Membership | Optional |
|---|------|------------------|------------|----------|
| 1 | `single-test` | no | provider | required |
| 2 | `tools-aggregate-schema` | no | provider | required |
| 3 | `namespace-description` | no | provider | required |
| 4 | `tools-aggregate-namespace` | no | provider | required |
| 5 | `about-namespace` | yes | provider | **OPTIONAL** |
| 6 | `about-selection` | yes | selection | n/a here |
| 7 | `selection-skills-L1` | yes | selection | n/a here |
| 8 | `selection-skills-L2` | yes | selection | n/a here |
| 9 | `selection-skills-L3` | yes | selection | n/a here |
| 10 | `namespace-skills` | yes | provider | required (when skills present) |
| 11 | `selection-aggregate` | yes | selection | n/a here |

The persona split is 4 neutral (`single-test`, `tools-aggregate-schema`,
`namespace-description`, `tools-aggregate-namespace`) and 7 persona (the rest),
exactly as in `PromptBuilder.mjs:47`.

---

## Section C — 6 Provider-Areas focus

The grading-interaction work package focuses on the **6 Provider-Areas**. They are
graded in the provider (single-schema) flow and are listed in
`AreaPromptLoader.mjs:47-54` (`PROVIDER_AREAS`):

- `single-test`
- `tools-aggregate-schema`
- `tools-aggregate-namespace`
- `namespace-description`
- `namespace-skills`
- `about-namespace`

These 6 areas are **autonomous** (graded without a group) and are **capped at
grade B** (max B). The 5 selection-areas (`about-selection`,
`selection-skills-L1`, `selection-skills-L2`, `selection-skills-L3`,
`selection-aggregate`) are **group-bound**, can reach grade **A** (max A), and are
**deferred** — they are explicitly out of scope of this work package.

The 6 + 4 area split is documented in `area-spec-mapping.md` and
`schema-vs-selection.md`; this note adds the max-grade caps (provider = B,
selection = A) and the deferral statement.

---

## Section D — det-then-non-det as in-area progression

"Deterministic-first, then non-deterministic" is a progression **inside each
area** (deterministic-first per the spec phase chapters), NOT a global three-phase
pipeline. Each area first runs its deterministic dimensions, then its
non-deterministic dimensions, and produces one score for that area.

**Anti-pattern (do not do this):** do not model deterministic / non-deterministic
as a global phase that spans all areas. There is no global det phase followed by a
global non-det phase. The det-then-non-det order lives within the boundary of a
single area.

---

## Section E — Worst-case namespace rollup

The namespace grade is the **worst (lowest)** grade across the area grades that are
**present**. Missing, optional, or ungraded areas are simply **omitted** from the
rollup — they are never pushed into the grades array, so a missing optional area
(for example `about-namespace`) never blocks the namespace and never drags its
grade down.

Anchor: `RebuildIndex.mjs:719-741` (`#rollupGrade`). The logic:

- collect the present area grades into one array;
- if any present grade is `REJECTED`, short-circuit to `REJECTED`;
- otherwise project the present grades onto the order `['A','B','C','D','F']` and
  take `present.at(-1)` — the worst-case (lowest) present grade;
- if no grade is present at all, the rollup is `F`.

About-optional behaviour is consistent with this: when no `about` grade exists the
namespace stays `pending` for that node and is not blocked
(`RebuildIndex.mjs:478-500`).

---

## Section F — Terminology guard

Two distinct concepts share the word "task". They must not be conflated.

- **Task-ID** (data identifier of the grading handover): a deterministic id of the
  form `<schemaIdSlug>--<area-set-hash>` that carries a *set* of areas through one
  grading handover. It lives in the payload, `prompts.json`, and `state.json`. Its
  format is specified in PRD-003 (`task-id-format.md`) and a generator/parser
  library lands in `TaskId.mjs`.
- **Orchestrator-task** (native to-do entry): a per-pipeline-step to-do item the
  orchestrating agent creates to stay on track across long sessions. It is a
  session-local orchestration aid, not a data identifier.

An orchestrator-task may *use* a Task-ID (for example a "feed consume-scores"
step), but it *is* not a Task-ID. See PRD-003 for the Task-ID format.
