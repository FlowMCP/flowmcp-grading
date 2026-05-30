# Area ↔ Spec Mapping

This document maps the ten prompt-template **areas** of the grading system to the actual phases
and chapters of the Grading-Spec `gradingSpec/1.1.0` (under `repos/flowmcp-spec/grading/1.1.0/`).

It is the companion to [`schema-vs-selection.md`](./schema-vs-selection.md), which defines the
binding Task A / Task B separation. This document confirms the **6 + 4 split** at the area level.

---

## 1. "Area" is NOT a spec term

**Important for future readers.** The word **area** does **not** appear in the Grading-Spec. Do
not search the spec for an "area" list — there isn't one.

- The spec is organised by **phases**: `04-phases-single.md` (P1–P7) and `05-phases-selection.md`
  (S1–S4), plus topical chapters such as `11-about-convention.md` (About) and `13-skills.md`
  (Skills).
- The ten "areas" are an artefact of the **LLM prompt templates** only. They live in
  `prompts/templates/*.md`, where each template declares its `area` and `specRef` in YAML
  front matter.

So "verify the area mapping against the spec" means: **assign each of the ten prompt templates to
the spec phase / chapter that governs it**, not "find a 1:1 area list in the spec" (which does not
exist).

---

## 2. The 6 + 4 split

The ten templates split cleanly into two scopes, matching the Task A / Task B separation:

- **6 Schema-Areas (Task A, Schema Preparation, `autonomous`, max grade B):**
  `single-test`, `tools-aggregate-schema`, `namespace-description`,
  `tools-aggregate-namespace`, `about-namespace`, `namespace-skills`.
- **4 Selection-Areas (Task B, Selection Modification, `group-bound`, grade A possible):**
  `about-selection`, `selection-skills-L1`, `selection-skills-L2`, `selection-skills-L3`.

This confirms the 6 + 4 split assumed by the Task A / Task B model.

---

## 3. Mapping Table

The `personaRequired` column is read verbatim from each template's YAML front matter. The
`Spec phase / chapter` column gives the governing spec location; where a template's declared
`specRef` does not resolve to an existing 1.1.0 file, the mapping is marked **derived from phase X**
in plain language (see §4) rather than inventing a spec term.

| Area (template file) | Scope (A/B) | `personaRequired` | Spec phase / chapter |
|----------------------|-------------|-------------------|----------------------|
| `single-test.md` | A | `false` | P4 Live Test → P5 Description Cascade (`04-phases-single.md` §3.4–§3.5). Determinism/tier basis: `06-determinism-and-tier.md` §4 (the template's declared `specRef`). |
| `tools-aggregate-schema.md` | A | `false` | P5 Description Cascade (`04-phases-single.md` §3.5). Determinism/tier basis: `06-determinism-and-tier.md` §4 (declared `specRef`). |
| `namespace-description.md` | A | `false` | **Derived from P5/P6** (Description Cascade + Namespace Aggregation, `04-phases-single.md` §3.5–§3.6). See §4 — declared `specRef` does not resolve. |
| `tools-aggregate-namespace.md` | A | `false` | **Derived from P6** (Namespace Aggregation, `04-phases-single.md` §3.6). See §4 — declared `specRef` does not resolve. |
| `about-namespace.md` | A | `true` | About-Convention, namespace level (`11-about-convention.md` §4 Content Contract). |
| `namespace-skills.md` | A | `true` | Namespace-Skill (`13-skills.md` §3, Category 1). §3.1 declares persona reference as OPTIONAL; the repo default is WITH persona (see §5). |
| `about-selection.md` | B | `true` | About-Convention, Selection level (`11-about-convention.md` §7, Selection-About SHOULD). |
| `selection-skills-L1.md` | B | `true` | Selection-Skill L1 (`13-skills.md` §4, Category 2). Persona focus mandatory on all levels (§4.2). |
| `selection-skills-L2.md` | B | `true` | Selection-Skill L2 (`13-skills.md` §4, Category 2). Persona focus mandatory on all levels (§4.2). |
| `selection-skills-L3.md` | B | `true` | Selection-Skill L3 (`13-skills.md` §4, Category 2). Persona focus mandatory on all levels (§4.2). |

Counts: **6 areas with Scope A**, **4 areas with Scope B**. Confirmed.

The Selection-Areas additionally relate to the Selection phases of `05-phases-selection.md`:
`about-selection` supports S2/S3 group artefacts; `selection-skills-L1/L2/L3` are the S3
Selection-Skill output, and their persona focus feeds the S4 persona-use-case-fit dimension.

---

## 4. `specRef` resolution findings

Two Schema-Area templates declare a `specRef` that does **not** resolve against an existing
`gradingSpec/1.1.0` file:

- `namespace-description.md` → `specRef: flowmcp-spec/grading/1.1.0/01-namespace-extensions.md`
- `tools-aggregate-namespace.md` → `specRef: flowmcp-spec/grading/1.1.0/01-namespace-extensions.md`

There is **no** `01-namespace-extensions.md` in `gradingSpec/1.1.0`; chapter `01` is
`01-default-journey.md`. Until those templates are corrected, the governing spec content for both
areas is the namespace-related Single-Schema phases — **P5 Description Cascade** and **P6 Namespace
Aggregation** (`04-phases-single.md` §3.5–§3.6). These two rows are therefore marked "derived from
phase" in §3 rather than pointing at a non-existent chapter. (Correcting the template `specRef`
values is a separate, non-spec task.)

The other eight templates declare `specRef` values that resolve to existing 1.1.0 files.

---

## 5. Persona-neutral vs. persona-bound areas

Of the six Schema-Areas, exactly **four are persona-neutral** (`personaRequired: false`):
`single-test`, `tools-aggregate-schema`, `namespace-description`, `tools-aggregate-namespace`.

The remaining two Schema-Areas — `about-namespace` and `namespace-skills` — are
**persona-bound** (`personaRequired: true`). For `namespace-skills`, `13-skills.md` §3.1 declares
the persona reference as OPTIONAL at the spec level, but the repo template sets the default to
WITH persona. This is a deliberate, documented divergence from the neutral default and is the
reason the area carries `personaRequired: true`.

All four Selection-Areas are persona-bound (`personaRequired: true`).

See [`../personas/README.md`](../personas/README.md) for how the Schema-Personas relate to these
six Schema-Areas.

---

## 6. Cross-References

- [`schema-vs-selection.md`](./schema-vs-selection.md) — binding Task A / Task B separation.
- `prompts/templates/*.md` — the ten templates, each with `area` + `specRef` + `personaRequired`.
- Grading-Spec `04-phases-single.md` (P1–P7), `05-phases-selection.md` (S1–S4),
  `06-determinism-and-tier.md` (§4 dimension matrix), `11-about-convention.md` (About),
  `13-skills.md` (Namespace-Skill §3, Selection-Skill §4).
