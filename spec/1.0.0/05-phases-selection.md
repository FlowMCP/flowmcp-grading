# 05 — Selection Phases (S1–S4)

| Field | Value |
|-------|-------|
| Status | Normative |
| Version | `gradingSpec/1.0.0` |
| Depends on | [`00-overview.md`](./00-overview.md), [`04-phases-single.md`](./04-phases-single.md) |
| Related | [`06-determinism-and-tier.md`](./06-determinism-and-tier.md) |

> Conformance language (MUST/SHOULD/MAY) follows BCP 14 [RFC2119]/[RFC8174] as defined in [`00-overview.md`](./00-overview.md). The binding source is the FlowMCP Schemas Specification v4.1.0.

---

## 1. Introduction

A **Selection** is a topic-oriented collection of multiple namespaces. It is the **fifth primitive** introduced in FlowMCP Schemas-Spec v4.1 (see [`17-selections.md`](https://github.com/FlowMCP/flowmcp-spec/blob/main/spec/v4.1.0/17-selections.md)). A Selection carries `tools[]` / `skills[]` / `resources[]` / `prompts[]` aggregated from its member namespaces.

This chapter defines the **four phases (S1–S4)** that grade a Selection. The Selection phases run **on top of** the Single-Schema phases of [`04-phases-single.md`](./04-phases-single.md). They presuppose that the underlying namespaces have been graded at the Single-Schema level.

This chapter is the **normative source for Skill-Family 2 (Selection-Validator)**. Its grading-tier output is `gradingTier = group-bound` — and under this tier, grade **A** is reachable (per [`06-determinism-and-tier.md`](./06-determinism-and-tier.md)).

---

## 2. Prerequisite: Soft and Hard Thresholds (MUST)

The Selection phases have a **minimum-size precondition**, expressed as two thresholds. The thresholds are normative; the rationale (corpus diversity) is taken from Memo 076 Kap 10.

| Threshold | Namespaces | Consequence |
|-----------|------------|-------------|
| **Soft** | **≥ 5** | A Selection becomes a "group" in the usable sense. A Selection-Skill MAY be created; S2/S3 run with reduced expectations. |
| **Hard** | **≥ 7** | Full group-optimisation applies; S4 Persona-Use-Case-Fit is fully scaled; **`aggregateGrade = A` is regularly reachable**. |

- A Selection with **fewer than 5 namespaces** MUST NOT run the Selection phases. Only Single-Schema grading applies; the Selection-level grade is recorded as `n/a`.
- A Selection with **5–6 namespaces** MAY run S1 and reduced S2/S3 but MUST NOT claim grade A.
- A Selection with **≥ 7 namespaces** MAY claim grade A via the full S1–S4 pipeline.

---

## 3. Phase Overview (S1–S4)

| # | Phase | Input | Output | Autonomous? | Grading Dimensions |
|---|-------|-------|--------|-------------|---------------------|
| S1 | Group Definition | N graded namespaces (N per Soft/Hard threshold) | `selection.mjs` with `tools[]` / `skills[]` / `resources[]` / `prompts[]` | Partial | Group-minimum threshold met, topic coherence |
| S2 | Domain-Knowledge Binding | Selection + domain-knowledge document (Ch. 10) | Conformance score against domain conventions | Partial (autonomous against the doc, persona-use-case-fit not) | `domainConformance`, shared-list usage, group language |
| S3 | Selection-Skill Creation | Selection + domain knowledge | Selection-Skill with L1/L2/L3 hierarchy (Ch. 12) + persona focus | Partial | `skillLevelDeclaration`, `skillLimitationsExplicit`, `skillPersonaFocus` |
| S4 | Persona-Use-Case-Fit | Selection + personas (Ch. 13) | LLM-based use-case evaluation | No (group- / persona-bound) | `personaUseCaseFit` (non-deterministic, group-bound) |

---

## 4. Phase Details

### 4.1 S1 — Group Definition

- **Goal:** declare a topic-coherent group of N graded namespaces as a Selection artefact.
- **Input:** N namespaces, each closed at the Single-Schema level (P6 completed per [`04-phases-single.md`](./04-phases-single.md) §7); N MUST satisfy the Soft threshold (§2).
- **Output:** `selection.mjs` populated with `tools[]`, `skills[]`, `resources[]`, `prompts[]` aggregated from the member namespaces.
- **Autonomy:** Partial — the cardinality check is autonomous; topic-coherence judgement is LLM-assisted.
- **Grading dimensions written:** group-minimum threshold met, topic coherence.

### 4.2 S2 — Domain-Knowledge Binding

- **Goal:** evaluate the Selection against the domain-knowledge document for its topic area.
- **Input:** Selection from S1 + domain-knowledge document (Ch. 10, forthcoming).
- **Output:** conformance score against the documented domain conventions (shared lists, vocabulary, group language).
- **Autonomy:** Partial — the comparison against the documentation is autonomous; the persona-use-case-fit aspect of domain knowledge is **not** autonomous and is graded in S4.
- **Grading dimensions written:** `domainConformance`, shared-list usage, group language.

### 4.3 S3 — Selection-Skill Creation

- **Goal:** produce a Selection-Skill with the L1/L2/L3 hierarchy (Ch. 12, forthcoming) and a declared persona focus.
- **Input:** Selection + domain knowledge (post-S2).
- **Output:** Selection-Skill conforming to the L1/L2/L3 format, with a documented persona focus.
- **Autonomy:** Partial — structural validation autonomous; semantic validation of L1/L2/L3 content is LLM-assisted.
- **Grading dimensions written:** `skillLevelDeclaration`, `skillLimitationsExplicit`, `skillPersonaFocus`.

### 4.4 S4 — Persona-Use-Case-Fit

- **Goal:** evaluate the Selection's fit for the declared persona use cases via LLM grader.
- **Input:** Selection + Personas (Ch. 13, forthcoming).
- **Output:** LLM-based use-case evaluation.
- **Autonomy:** **No** — this phase is **group- and persona-bound** by construction.
- **Grading dimensions written:** `personaUseCaseFit` — non-deterministic, `gradingTier = group-bound`.

---

## 5. Overlaps Between Single and Selection

Some grading dimensions appear on both levels, but with different scope or owner. The mapping below is normative.

| Dimension | Single-Schema (P5/P6) | Selection (S2/S3) | What they share |
|-----------|----------------------|-------------------|-----------------|
| Description quality | `whenToUse`, `parameters` (LLM-graded) | `whenToUse` of the Selection (LLM-graded) | Same LLM prompt contract, different scope |
| About-Convention | Namespace-About (SHOULD) | Selection-About (SHOULD, Ch. 11) | Same route name `about`, different owner |
| Persona focus | Mentioned only via the About-Convention | Anchored directly in the Selection-Skill | Same persona definition (Ch. 13), different point of application |
| Domain conformance | Not applicable (Single-Schema knows no group) | `domainConformance` (Ch. 10) | Selection level only |
| jq-pipe / output contract | Per schema (P7) | Group-wide composability of the Selection | Same output-schema contract; the Selection verifies cross-schema compatibility |

### 5.1 jq-Pipe Clarification

The **jq-pipe is one sub-dimension** of output-schema conformance (P7 in [`04-phases-single.md`](./04-phases-single.md)). It is **not the endpoint** of the pipeline. The Selection level reuses the same output-schema contract and tests **cross-schema composability** — whether tools of one namespace can be piped into tools of another within the Selection.

---

## 6. Autonomous vs. Group-Bound (Tier Preview)

Per [`06-determinism-and-tier.md`](./06-determinism-and-tier.md), the Tier axis governs the **maximum attainable grade**:

- **Autonomous (max grade B):** P1–P7 (Single-Schema), S1, parts of S2.
- **Group-bound (grade A possible):** S3 (full L1/L2/L3 validation) and S4 (Persona-Use-Case-Fit).

A Selection cannot reach grade A without at least one `group-bound` dimension contributing to its aggregate. The Hard threshold (§2) is the operational gate that makes this contribution meaningful.

---

## 7. Cascade Stop

A failure at the Selection level halts downstream Selection phases. Examples:

- **Soft threshold not met** (< 5 namespaces) → no Selection phases run; the Selection-level grade is `n/a`. Only Single-Schema grades remain.
- **S2 `domainConformance = fail`** → S3/S4 run with reduced scope or are recorded as `n/a`. A Selection that cannot conform to its declared domain cannot claim a persona-fit grade.
- **S3 `skillLevelDeclaration` missing** → S4 MUST NOT run; `personaUseCaseFit` is recorded as `n/a`.

Cascade-stop events are recorded as findings in the grading entry, analogous to Single-Schema cascade stops in [`04-phases-single.md`](./04-phases-single.md) §6.

---

## 8. Skill Family

The Selection phases are written by **Skill-Family 2 — Selection-Validator**. Its grading-tier output is:

```
gradingTier = group-bound
```

This tier is the **only** path to grade **A**. The Single-Schema-Validator (Skill-Family 1) cannot, by construction, deliver grade A.

---

## 9. Cross-References

- [`04-phases-single.md`](./04-phases-single.md) — Single-Schema phases P1–P7; S1 consumes their outputs.
- [`06-determinism-and-tier.md`](./06-determinism-and-tier.md) — Tier rules (max grade B autonomous vs. grade A possible group-bound).
- Ch. 10 — Domain Knowledge (forthcoming).
- Ch. 11 — About-Convention (forthcoming).
- Ch. 12 — Personas Contract (forthcoming).
- Ch. 13 — Skills (forthcoming).
- FlowMCP Schemas-Spec v4.1.0 — [`17-selections.md`](https://github.com/FlowMCP/flowmcp-spec/blob/main/spec/v4.1.0/17-selections.md).

---

Source: Memo 076 Kap 5.2 (lines 185–199), Kap 5.3 (lines 201–211), Kap 5.4 (lines 213–216).
