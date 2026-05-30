# Technical Schema-Personas (`flowmcp-grading/personas/`)

This folder holds the **technical Schema-Personas** used for Task A (Schema Preparation). They are
**owned by this repository** and are distinct from the user-specific Selection-Personas used for
Task B (Selection Modification). For the binding Task A / Task B separation, see
[`../docs/schema-vs-selection.md`](../docs/schema-vs-selection.md).

---

## 1. What lives here

| Persona | Slug | Lens |
|---------|------|------|
| Security Reviewer | `security-reviewer` | secrets / auth / injection / data exposure |
| API Integration Engineer | `api-integration-engineer` | endpoint correctness, parameters, response handling — "does it actually work" |
| Documentation & DX Reviewer | `documentation-dx-reviewer` | descriptions, naming clarity, human-readable enums, about / skills text |

These three personas apply a technical review lens to the **6 Schema-Areas** of Task A
(`single-test`, `tools-aggregate-schema`, `namespace-description`, `tools-aggregate-namespace`,
`about-namespace`, `namespace-skills`). The exact area mapping is in
[`../docs/area-spec-mapping.md`](../docs/area-spec-mapping.md).

The Task A tier is `autonomous`, so the maximum attainable grade for schema preparation is **B**.

---

## 2. Two-tier persona model

There are two kinds of personas in the grading system, one per task:

| | Technical Schema-Personas (Task A) | User Selection-Personas (Task B) |
|--|-------------------------------------|-----------------------------------|
| **Purpose** | Review a prepared schema for technical quality (security, integration, documentation). | Evaluate whether a Selection fits a real end-user use case. |
| **Owner** | This repository (`flowmcp-grading/personas/`). | The user / Selection author. |
| **Storage** | `flowmcp-grading/personas/` (this folder). | `grading-data/personas/<persona-id>.md` (user-specific, per group). |
| **Determined by** | Us — fixed, technical, repo-level. | The user — domain-specific, more open. |
| **Used by** | Schema-Area prompts (Task A). | S4 Persona-Reference-Coherence (Task B); resolved against `personaIndex`. |

The Selection-Personas (Task B) are resolved by `runS4` in `src/Phases/Selection.mjs`, which checks
each `personaIds[]` entry against a supplied `personaIndex` and requires a `domainDocId`. The
technical Schema-Personas in this folder are **not** wired into the grading engine in this phase —
that is later work. This folder establishes the persona definitions only.

---

## 3. Relation to the spec base personas

The FlowMCP base personas live in the sister repository at `repos/flowmcp-spec/personas/`. At
`gradingSpec/1.1.0` the spec recognised **four generalised base personas** as the single source of
truth: `ai-engineer`, `decision-maker`, `hackathon-builder`, `schema-maintainer`.

The three personas in this folder are **technical Schema-Personas** — a tier that the Grading-Spec
recognises as of `gradingSpec/1.2.0` (see `flowmcp-spec/grading/1.2.0/12-personas-contract.md`,
the added "Technical Schema-Persona tier" section). They are repo-level, technical, and apply to
Task A schema grading. They sit alongside the four generalised base personas rather than replacing
them:

- The **four base personas** describe end users and contributors of the FlowMCP corpus
  (the spec's single source of truth, used for Selection / Task B grading via Lenses).
- The **three technical Schema-Personas** here describe the *review lenses* applied while preparing
  a schema for the corpus (Task A). They are closest in spirit to the base persona
  `schema-maintainer`, which already cares about test coverage, conventions, and grading feedback.

> Note on persona count. There are **four** base personas in `flowmcp-spec/personas/` (not "~11" —
> the other files in that folder are helpers, templates, and policy documents, not personas). The
> three files here are an **additional, technical** tier introduced for Task A, recognised by the
> spec from `gradingSpec/1.2.0` onward.

---

## 4. File format

Each persona file is Markdown with a base-persona structure consistent with
`repos/flowmcp-spec/personas/_template.md`: a one-line summary, an Identity table, Biography, Daily
rhythm, Tools, Interests, Personality, a Main question, a Review-focus section (the technical lens
applied to the Schema-Areas), Quotes, and "sign off / block" criteria.

---

## 5. Cross-References

- [`../docs/schema-vs-selection.md`](../docs/schema-vs-selection.md) — Task A / Task B separation.
- [`../docs/area-spec-mapping.md`](../docs/area-spec-mapping.md) — the 6 + 4 area mapping.
- `repos/flowmcp-spec/personas/` — the four generalised base personas (single source of truth).
- `repos/flowmcp-spec/grading/1.2.0/12-personas-contract.md` — spec recognition of the technical
  Schema-Persona tier.
- `src/Phases/Selection.mjs` (`runS4`) — Selection-Persona resolution (Task B), engine wiring not
  part of this phase.
