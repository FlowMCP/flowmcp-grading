# Schema Preparation vs. Selection Modification — The Binding A/B Separation

This document defines the two fundamentally different tasks of the grading system and the
binding rules that keep them apart. It is the authoritative reference for which work belongs
to **Task A (Schema Preparation)** and which belongs to **Task B (Selection Modification)**.

The area-to-spec mapping that backs this separation lives in the companion document
[`area-spec-mapping.md`](./area-spec-mapping.md).

---

## 1. Definition — Task A vs. Task B

| | Task A — Schema Preparation | Task B — Selection Modification |
|--|------------------------------|----------------------------------|
| **What it does** | Prepares the schemas of one provider so they are spec-conformant: research, draft, live test, descriptions, namespace aggregation, about, namespace-skill. | Composes already-prepared schemas into a topic-oriented group (Selection) and adapts that group: member coverage, lockfile consistency, selection-skills, persona-use-case fit. |
| **Code** | `SingleSchemaPhases` (`src/Phases/SingleSchema.mjs`), phases **P1–P7**. | `SelectionPhases` (`src/Phases/Selection.mjs`), phases **S1–S4**. |
| **Entry point** | `gradeSingleSchema( { schemaPath, schemaId, grader, options } )` (`src/index.mjs`); sets `gradingTier: 'autonomous'`. | `gradeSelection( { selectionId, schemaIds, grader, options } )` (`src/index.mjs`); sets `gradingTier: 'group-bound'`. |
| **Tier** | `autonomous` | `group-bound` |
| **Max grade** | **B** (Grading-Spec `04-phases-single.md` §8 / `06-determinism-and-tier.md`). | **A** reachable (Grading-Spec `05-phases-selection.md` §8). |

> Note on the current Selection code path: `gradeSelection` presently calls
> `SelectionPhases.runAllStub` (a synchronous back-compat path). The full asynchronous
> `runAll` implementation of S1–S4 is present and used by the lockfile-aware callers.
> Re-wiring `gradeSelection` away from the stub is out of scope here and tracked separately.

---

## 2. Roles — Who does what

| Task | Who | Action |
|------|-----|--------|
| **A — Schema Preparation** | We or the community | **Creation** of schemas (authoring, fixing, bringing them to spec conformance). |
| **B — Selection Modification** | Domain experts | **Modification / composition** of an existing group — NOT creation of new schemas. |

Task B is deliberately a modification activity. A domain expert composing a Selection works on
schemas that already exist and are already prepared. They do not author schemas as part of Task B.

---

## 3. Ownership of Storage Location

| Task | Owner | Folder |
|------|-------|--------|
| **A** | Us / the repository | `single/<namespace>--<tool>/` under `grading-data/` |
| **B** | The user / Selection author | `selection/<selectionId>/` under `grading-data/`, plus the user-specific persona / lens helper files |

See `AGENTS.md` ("Folder structure" and "Single vs. Selection") for the concrete on-disk layout.
The two paths exist because Single and Selection have independent lifecycles and the
pre-condition validator must read the two status axes separately.

---

## 4. Scope-Bound "Full" — there is no all-in-one run

The word **Full** is always scoped to one task. It never spans both.

| Term | Meaning |
|------|---------|
| **Schema-Full** | All **6 Schema-Areas** of Task A (see [`area-spec-mapping.md`](./area-spec-mapping.md)). |
| **Selection-Full** | All **4 Selection-Areas** of Task B (see [`area-spec-mapping.md`](./area-spec-mapping.md)). |

There is **no scope-crossing "all 10 areas in one run"**. "All ten areas" is not a single run —
it is a Schema-Full run (6 areas) plus a separate Selection-Full run (4 areas). The two are
bound to different tiers, different storage locations, and different personas, so they cannot be
collapsed into one operation.

---

## 5. No Double Grading

A schema is **never graded twice**. Once a schema is prepared and graded at the Single-Schema
level, the Selection level does **not** re-grade it. The Selection level evaluates only the
**additional** aspects (the group composition itself, member coverage, lockfile consistency,
selection-skills, persona-use-case fit).

**Technical anchor.** `PreConditionCheck` (`src/PreConditionCheck.mjs`, Grading-Spec
`21-pre-conditions.md`) blocks every aggregated (Selection) grading until **all** member schemas
carry `gradingStatus: 'stable'`. This is the operational boundary of the rule "grade first, then
modify": you finish grading the individual schemas, promote them to `stable`, and only then does
Selection work begin on top of them. The Selection grading therefore starts from a frozen,
already-graded set of members and adds value rather than repeating it.

---

## 6. The Four Separation Dimensions

The separation is enforced along four orthogonal dimensions. Every piece of grading work can be
placed unambiguously by reading this table.

| Dimension | Task A — Schema Preparation | Task B — Selection Modification |
|-----------|------------------------------|----------------------------------|
| **Phase logic** | P1–P7 (`SingleSchemaPhases`) | S1–S4 (`SelectionPhases`) |
| **Persona responsibility** | Technical Schema-Personas owned by this repo (see [`personas/README.md`](../personas/README.md)) | User-specific Selection-Personas / lenses bound to a group (`grading-data/personas/`, resolved in S4) |
| **Storage location** | Repository: `single/<namespace>--<tool>/` | grading-data (user): `selection/<selectionId>/` |
| **Full scope** | Schema-Full = 6 Schema-Areas | Selection-Full = 4 Selection-Areas |

---

## 7. Selection Minimum Size and Grade Ceilings

These two facts co-determine the boundary between Schema-Full and Selection-Full and are part of
the binding separation.

**Selection minimum size** (Grading-Spec `05-phases-selection.md` §2):

| Threshold | Namespaces | Consequence |
|-----------|------------|-------------|
| Soft | ≥ 5 | A Selection becomes a usable group; S2/S3 run with reduced expectations. |
| Hard | ≥ 7 | Full group optimisation; S4 persona-use-case-fit is fully scaled; `aggregateGrade = A` is regularly reachable. |

A Selection with fewer than 5 namespaces MUST NOT run the Selection phases at all — only
Single-Schema (Task A) grading applies, and the Selection-level grade is recorded as `n/a`. This
is precisely the point where work that would otherwise be "Selection-Full" collapses back into
"Schema-Full only".

**Grade ceilings** (Grading-Spec `04-phases-single.md` §8 and `05-phases-selection.md` §8):

- Task A (`autonomous`) → maximum grade **B**.
- Task B (`group-bound`) → grade **A** possible.

A Selection cannot reach grade A without at least one `group-bound` dimension contributing to its
aggregate — which is only meaningful once the Hard threshold (≥ 7) is met.

---

## 8. Cross-References

- [`area-spec-mapping.md`](./area-spec-mapping.md) — the 10 prompt-template areas mapped to spec phases / chapters.
- [`../personas/README.md`](../personas/README.md) — technical Schema-Personas (Task A) vs. Selection-Personas (Task B).
- `AGENTS.md` — folder structure, Single vs. Selection layout, pre-condition rule.
- Grading-Spec `04-phases-single.md` (P1–P7), `05-phases-selection.md` (S1–S4), `21-pre-conditions.md` (stable-gate).
