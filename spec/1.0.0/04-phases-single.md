# 04 — Single-Schema Phases (P1–P7)

| Field | Value |
|-------|-------|
| Status | Normative |
| Version | `gradingSpec/1.0.0` |
| Depends on | [`00-overview.md`](./00-overview.md) |
| Related | [`01-default-journey.md`](./01-default-journey.md), [`02-eligibility.md`](./02-eligibility.md), [`03-tos.md`](./03-tos.md), [`05-phases-selection.md`](./05-phases-selection.md), [`06-determinism-and-tier.md`](./06-determinism-and-tier.md) |

> Conformance language (MUST/SHOULD/MAY) follows BCP 14 [RFC2119]/[RFC8174] as defined in [`00-overview.md`](./00-overview.md). The binding source is the FlowMCP Schemas Specification v4.1.0.

---

## 1. Introduction

This chapter is the **normative source for Skill-Family 1 (Single-Schema-Validator)**. It defines the seven phases (P1–P7) of the Single-Schema level — from research over a documentation URL to the output-contract verification of a finished schema.

The Single-Schema level produces the **base unit** of the FlowMCP corpus: **one namespace** with one or more schemas, a Namespace-Skill, and an About-Convention. Higher-level grouping (Selection level) is defined separately in [`05-phases-selection.md`](./05-phases-selection.md).

A schema graded only on the Single-Schema level has `gradingTier = autonomous`. Per [`06-determinism-and-tier.md`](./06-determinism-and-tier.md), the **maximum attainable grade** on this tier is **B**. Grade A requires a `group-bound` contribution from the Selection level.

---

## 2. Phase Overview (P1–P7)

| # | Phase | Input | Output | Autonomous? | Grading Dimensions |
|---|-------|-------|--------|-------------|---------------------|
| P1 | Research | Documentation URL (or alternative) | Documentation extract, ToS-link candidate | Yes | Source conformance, ToS match |
| P2 | Analysis | Documentation extract | Endpoint list, eligibility classification, splitting decision | Yes | Endpoint-list completeness |
| P3 | Schema Draft (maximalist) | Endpoint list | `.unfinished/schema.mjs` with v4.1 mandatory fields | Yes | Structural validation (deterministic), completeness |
| P4 | Live Test | Schema + API keys | Test-run report (HTTP status, sample responses) | Yes | HTTP-status classes, API availability (time-dependent) |
| P5 | Description Cascade | Schema + tests + sample responses | Validated descriptions per test, tool, resource, prompt | Partial | `whenToUse`, `parameters`, description conformance, description neutrality |
| P6 | Namespace Aggregation | Multiple schemas of one provider | Consistent namespace + Namespace-Skill (Ch. 12) + About-Convention (Ch. 11) | Partial | Namespace coherence, About-Convention fulfilment |
| P7 | Output Contracts | Schema + sample responses | Output schema, jq-pipe sub-contract, MCP-Resource contract | Yes | Output-schema conformance (deterministic) |

---

## 3. Phase Details

### 3.1 P1 — Research

- **Goal:** establish the documentation extract and a ToS-link candidate as starting artefacts.
- **Input:** documentation URL (default per [`01-default-journey.md`](./01-default-journey.md)) or a permitted alternative (network inspection, manual authoring — flagged as exception).
- **Output:** verbatim documentation extract; ToS-link candidate URL.
- **Autonomy:** Yes.
- **Grading dimensions written:** source conformance, ToS match (per [`03-tos.md`](./03-tos.md) §4 Root-Domain-Match).
- **Typical failure modes:** unreachable documentation (network/DNS), ToS link present but root-domain mismatch.

### 3.2 P2 — Analysis

- **Goal:** convert the documentation extract into a structured endpoint list with eligibility classification and splitting decisions.
- **Input:** documentation extract from P1.
- **Output:** endpoint list; per-endpoint eligibility classification under [`02-eligibility.md`](./02-eligibility.md); decision whether to split (free vs. API-key per `02-eligibility.md` §5).
- **Autonomy:** Yes.
- **Grading dimensions written:** completeness of the endpoint list (baseline for the maximalism check in P3).
- **Typical failure modes:** missed endpoints (manual omission), mixed-eligibility schemas not split.

### 3.3 P3 — Schema Draft (maximalist)

- **Goal:** produce a v4.1-conformant `.unfinished/schema.mjs` that is maximalist over the P2 endpoint list.
- **Input:** endpoint list from P2.
- **Output:** `.unfinished/schema.mjs` containing all mandatory v4.1 fields.
- **Autonomy:** Yes.
- **Grading dimensions written:** structural validation (deterministic — schema-shape, mandatory fields); completeness (gap against P2 baseline).
- **Typical failure modes:** reduced schema without justification (penalised proportionally per [`01-default-journey.md`](./01-default-journey.md) §6); v4.1 mandatory fields missing.

### 3.4 P4 — Live Test

- **Goal:** execute live calls against the API and record HTTP responses and sample payloads.
- **Input:** schema from P3 + API keys (per [`02-eligibility.md`](./02-eligibility.md) §4 access classes).
- **Output:** test-run report containing HTTP status per tool and sample responses.
- **Autonomy:** Yes.
- **Grading dimensions written:** HTTP-status classes (per [`06-determinism-and-tier.md`](./06-determinism-and-tier.md) §5 — 200 is pass, 4xx MUST NOT be auth-pass), API availability (time-dependent dimension).
- **Typical failure modes:** HTTP 4xx (treated as fail/defect, never as "auth-pass"), HTTP 5xx, schema-runtime mismatch.

### 3.5 P5 — Description Cascade

- **Goal:** validate that every tool, resource, and prompt has a description that matches the observed responses and that descriptions are neutral.
- **Input:** schema, tests, and sample responses from P4.
- **Output:** validated descriptions per test, tool, resource, and prompt.
- **Autonomy:** Partial — deterministic checks (neutrality heuristic, structural completeness) run autonomously; semantic checks (`whenToUse` clarity, `parameters` understandability) are non-deterministic and run via LLM grader.
- **Grading dimensions written:** `whenToUse`, `parameters`, description conformance, description neutrality.

**The P5 Cascade is a mandatory ordered procedure (see §4 below).**

### 3.6 P6 — Namespace Aggregation

- **Goal:** aggregate multiple schemas of one provider into a consistent namespace, equipped with a Namespace-Skill and an About-Convention.
- **Input:** one or more schemas of the same provider (post-P5).
- **Output:** namespace with a Namespace-Skill (Ch. 12, forthcoming) and an About-Convention (Ch. 11, forthcoming).
- **Autonomy:** Partial — name and routing checks deterministic; semantic Namespace-Skill validation non-deterministic.
- **Grading dimensions written:** namespace coherence, About-Convention fulfilment.

### 3.7 P7 — Output Contracts

- **Goal:** verify the output-schema contract — including the jq-pipe sub-contract and the MCP-Resource contract — per schema.
- **Input:** schema + sample responses from P4.
- **Output:** output schema, jq-pipe sub-contract, MCP-Resource contract.
- **Autonomy:** Yes.
- **Grading dimensions written:** output-schema conformance (deterministic).
- **Note:** the jq-pipe contract is **one sub-dimension** of output-schema conformance, not the endpoint of the pipeline. The cross-schema composability check belongs to the Selection level ([`05-phases-selection.md`](./05-phases-selection.md) §5.5).

---

## 4. P5 Description Cascade — Mandatory Order

The P5 cascade MUST be executed in the following order. Skipping or reordering steps is a finding.

1. **Run tests against the endpoint.** SHOULD: at least **3 tests per tool**, covering the breadth of the parameter space.
2. **Check the responses** and validate the tool description against the actual responses.
3. **Normalise / update the tool description** to match the validated responses.
4. **All tools, resources, and prompts MUST have descriptions** — and each description MUST be individually checked.
5. **Descriptions MUST be neutral** — they describe **only what the tool can do**, NOT what it should be used for. Application scenarios belong in the About-Convention (Ch. 11, forthcoming), not in the tool description.

The cascade is a contract: outputs of step *n* are inputs of step *n+1*. A failure in any step halts the cascade for the affected tool and is recorded as a finding.

---

## 5. Description Neutrality

The neutrality rule (P5 cascade step 5) is normative and worth restating:

- A tool description states **what** the tool does (capabilities, parameters, return shape).
- A tool description MUST NOT state **what for** it should be used (application scenarios, persona use cases, "good for X").
- Application scenarios and persona use cases belong in the **About-Convention** (Ch. 11, forthcoming) — not in the tool description.

This separation is essential for LLM grader reproducibility: neutral descriptions can be deterministically compared to the observed API behaviour; mixed descriptions cannot.

---

## 6. Cascade Stop (Veto)

A failed gate **MUST halt the downstream phases** for the affected schema. A categorical veto raised in any phase **MUST stop the pipeline** for that schema.

Examples:

- **P3 veto `api-key-domain-mismatch`** — when the API key declared in the schema metadata does not match the API root domain, P3 raises the veto and **P4 live tests MUST NOT run**.
- **P4 HTTP 4xx** — when a tool returns HTTP 4xx (including 401/403), the response MUST NOT be treated as "auth-pass" (see [`06-determinism-and-tier.md`](./06-determinism-and-tier.md) §5). The P5 description cascade for that tool **cannot be completed** and is recorded as a finding.
- **P2 eligibility violation** — when an endpoint fails an exclusion criterion under [`02-eligibility.md`](./02-eligibility.md) §3 and the schema author insists on including it, the schema is rejected in P3 and no subsequent phase runs for it.

Cascade-stop events are recorded in the grading entry. They do not lower the grade silently — they produce a categorical finding (Veto, see forthcoming `07-veto.md`).

---

## 7. End of the Single-Schema Level

After **P6**, the artefact set is complete:

- one **namespace**,
- one or more **schemas** under that namespace,
- a **Namespace-Skill**, and
- an **About-Convention**.

This is the **base unit**. The Schema-level grade is **closed** at this point. Downstream grading (Selection level) operates on aggregations of base units and is defined in [`05-phases-selection.md`](./05-phases-selection.md).

---

## 8. Skill Family

The Single-Schema phases are written by **Skill-Family 1 — Single-Schema-Validator**. Its grading-tier output is:

```
gradingTier = autonomous
```

Per [`06-determinism-and-tier.md`](./06-determinism-and-tier.md), the maximum attainable grade on `autonomous` is **B**. A schema that should be eligible for grade **A** must additionally be graded at the Selection level (`group-bound`, see [`05-phases-selection.md`](./05-phases-selection.md)).

---

## 9. Cross-References

- [`02-eligibility.md`](./02-eligibility.md) — Endpoint eligibility (P2/P3 input).
- [`03-tos.md`](./03-tos.md) — ToS check (P1 output).
- [`05-phases-selection.md`](./05-phases-selection.md) — Selection-level phases S1–S4 (consume Single-Schema outputs).
- [`06-determinism-and-tier.md`](./06-determinism-and-tier.md) — Tier and determinism rules (max-grade-B on `autonomous`).
- Ch. 11 — About-Convention (forthcoming).
- Ch. 12 — Namespace-Skill (forthcoming).
- Ch. 13 — Skills (forthcoming).

---

Source: Memo 076 Kap 5.1, lines 163–184 (table, cascade, end-of-level passage); Kap 8, lines 347–352 (cascade/veto-stop rules).
