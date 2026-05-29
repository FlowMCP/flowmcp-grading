# Grading-Spec `gradingSpec/1.0.0`

> Normative language (MUST/SHOULD/MAY) follows the conventions defined in the FlowMCP Schemas Specification v4.1.0 [00-overview.md](https://github.com/FlowMCP/flowmcp-spec/blob/main/spec/v4.1.0/00-overview.md) (Conformance Language). This Grading-Spec is a separate, independently versioned document; it does not re-define normative keywords.

---

## Conformance Language

This document uses the key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" as defined in BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all capitals.

The binding source for this conformance interpretation is the FlowMCP Schemas Specification v4.1.0 [00-overview.md](https://github.com/FlowMCP/flowmcp-spec/blob/main/spec/v4.1.0/00-overview.md). Some chapters of this Grading-Spec are intentionally written in prose without normative keywords because they describe history, motivation, or conceptual background (this overview document). All other chapters use normative language and assume this conformance interpretation.

---

## Hierarchy — where this spec sits

The Grading-Spec is **not** the highest instance. The FlowMCP Schemas Specification v4.1.0 defines what a schema is, what a selection is, and which primitives exist. This Grading-Spec describes **how** schemas and selections are evaluated and graded.

| Level | Source | Role |
|-------|--------|------|
| Top | `repos/flowmcp-spec/spec/v4.1.0/` (Schemas-Spec, main body) | **Highest instance** — defines what a schema/selection is and which primitives exist |
| Middle | `repos/flowmcp-spec/spec/v4.1.0/22-scoring-protocol.md` (Scoring v1) | Existing `prompts.json` / `scores.json` contract (sub-consumed by this Grading-Spec) |
| Middle | Grading-Spec in `repos/flowmcp-grading/` (this document) | Independent — describes phases, Scoring System, Grading System, Veto, Tier, Skills, Domain Knowledge |
| Bottom | Scripts and modules in `repos/flowmcp-grading/src/` | Implementation derived from this spec |

Cross-reference: [Schemas-Spec v4.1.0 — Overview](https://github.com/FlowMCP/flowmcp-spec/blob/main/spec/v4.1.0/00-overview.md).

---

## Main Focus — Interoperability

FlowMCP's main focus is **interoperability** — connecting schemas with as many other schemas as possible. Schemas SHOULD be compatible with as many others as possible.

> User-Quote (Memo 076, Kap 1):
> „Das Verbinden mit anderen Tools steht im Vordergrund — das ist der Hauptgrund."
> (English gloss: *"Connecting to other tools is the foreground concern — that is the main reason."*)

This main focus is the **deep cause** for the **maximalism principle** of the Grading-Spec: more tools in a schema mean more potential connections. A schema that omits endpoints which the underlying API documents is — by definition — less interoperable than the maximalist alternative. Grading penalises unjustified reduction proportionally (see chapters 02 and 05 once written).

---

## Living Document

> **Pragma principle (Memo 054, repeatedly reaffirmed by the user):**
> *"Any grading > no grading."* *"We have to start somewhere — new now, migration later."*

This Grading-Spec is a **living document**. It begins minimally with the chapters needed to grade today's schema corpus and grows as the corpus, the validator, and the LLM grader capabilities evolve. New chapters MAY be added, existing chapters MAY be tightened — version bumps follow the rules below.

---

## Three Independently Versioned Namespaces

Per Memo 076 (F5), this repository tracks **three** independent versions. None of them is coupled to the others; bumping one does **not** imply bumping the others.

### `gradingSpec/1.0.0`

The specification documents under `spec/1.0.0/`. This is the document set you are reading. Version is bumped when the normative content (MUST/SHOULD/MAY rules, phases, chapters, data contracts) changes in a way that affects compliance.

### `scoringSystem/1.0.0`

The scoring rules and dimensions — what is measured, on which scale, and how partial scores aggregate. Version is bumped when dimensions are added, removed, or rescaled in a way that changes existing score outputs.

### `gradingSystem/1.0.0`

The grading rules — how scores are mapped to grades, how the categorical veto operates, how tiers are assigned, and how skill family contracts work. Version is bumped when the mapping from scores to grades changes, when veto rules change, or when tier boundaries shift.

---

## Cross-References to the Schemas-Spec v4.1.0

This Grading-Spec relies on definitions from the Schemas-Spec. The following chapters of v4.1.0 are particularly relevant:

- [22-scoring-protocol.md](https://github.com/FlowMCP/flowmcp-spec/blob/main/spec/v4.1.0/22-scoring-protocol.md) — the existing `prompts.json` / `scores.json` contract that this Grading-Spec sub-consumes.
- [20-validation-strategy.md](https://github.com/FlowMCP/flowmcp-spec/blob/main/spec/v4.1.0/20-validation-strategy.md) — the deterministic baseline; the Grading System defined here extends (and partly replaces) the Grade System described there.
- [13-resources.md](https://github.com/FlowMCP/flowmcp-spec/blob/main/spec/v4.1.0/13-resources.md) — Resource primitive (basis for the `about` convention to be reserved).
- [14-skills.md](https://github.com/FlowMCP/flowmcp-spec/blob/main/spec/v4.1.0/14-skills.md) — Skill types `'namespace' | 'selection' | 'agent'` (already part of v4.1).
- [17-selections.md](https://github.com/FlowMCP/flowmcp-spec/blob/main/spec/v4.1.0/17-selections.md) — Selection as the fifth primitive; carries `tools[]` / `skills[]` / `resources[]` / `prompts[]`.
- [11-preload.md](https://github.com/FlowMCP/flowmcp-spec/blob/main/spec/v4.1.0/11-preload.md) — Preload pattern already in place.

---

## Spec Structure — chapters to be filled

The following chapters are placeholders for content delivered in subsequent PRDs of the Memo 076 rollout. Order and naming MAY be adjusted as the spec matures.

| Chapter | Topic | Status |
|---------|-------|--------|
| `01-default-journey.md` | Default journey & maximalism principle | kommt in einem späteren PRD (Phase 2) |
| `02-completeness.md` | Completeness validation rules | kommt in einem späteren PRD (Phase 2) |
| `03-phases-single-schema.md` | Single-Schema phases P1–P7 | kommt in einem späteren PRD (Phase 3) |
| `04-phases-selection.md` | Selection phases S1–S4 | kommt in einem späteren PRD (Phase 3) |
| `05-scoring-system.md` | Scoring System (dimensions, scales) | kommt in einem späteren PRD (Phase 4) |
| `06-grading-system.md` | Grading System (mapping scores → grades) | kommt in einem späteren PRD (Phase 4) |
| `07-veto.md` | Categorical Veto rules | kommt in einem späteren PRD (Phase 4) |
| `08-tier.md` | Tier assignment | kommt in einem späteren PRD (Phase 4) |
| `09-aging-and-retention.md` | Aging (14 d API, 30 d ToS), 180 d retention | kommt in einem späteren PRD (Phase 5) |
| `10-skills.md` | Two skill families (Single-Schema, Selection) | kommt in einem späteren PRD (Phase 5) |
| `11-personas.md` | Personas contract & Lens concept | kommt in einem späteren PRD (Phase 5) |
| `12-domain-knowledge.md` | Domain knowledge sources | kommt in einem späteren PRD (Phase 6) |
| `13-error-codes.md` | Error codes (GRD-*, SCO-*, VET-*) | kommt in einem späteren PRD (Phase 6) |
| `14-kanban-data-contract.md` | Kanban data contract (Folge-Memo) | kommt in einem späteren PRD (Phase 7) |

Each chapter is delivered as a standalone PRD; none of the placeholders carry binding content yet. Implementers MUST NOT rely on the chapter naming above until the corresponding PRD is merged.

---

## Out of Scope for `gradingSpec/1.0.0`

- GitHub Kanban v2 wiring — named as a follow-up memo (Memo 076, Kap 15).
- Migration of the legacy Memo 014 error codes (Grade A/B/C/F) onto the new model — own follow-up memo.
- Reorganisation of v4.1 sections beyond the small cross-reference blocks introduced by Memo 076 Phase 1 PRD-04.
- Deep consolidation of Memos 013/014/015/054/056/065/070/072 (see Memo 076, Kap 15).
