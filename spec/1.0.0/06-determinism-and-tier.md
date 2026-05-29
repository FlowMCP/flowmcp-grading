# 06 — Determinism and Tier

| Field | Value |
|-------|-------|
| Status | Normative |
| Version | `gradingSpec/1.0.0` |
| Depends on | [`00-overview.md`](./00-overview.md) |
| Related | [`04-phases-single.md`](./04-phases-single.md), [`05-phases-selection.md`](./05-phases-selection.md), `07-scoring-vs-grading.md` (forthcoming), `08-grading-model.md` (forthcoming), `09-security-and-development.md` (forthcoming) |

> Conformance language (MUST/SHOULD/MAY) follows BCP 14 [RFC2119]/[RFC8174] as defined in [`00-overview.md`](./00-overview.md). The binding source is the FlowMCP Schemas Specification v4.1.0.

---

## 1. Introduction — Two Orthogonal Axes

The Grading-Spec separates **reproducibility** (Determinism) from **attainability** (Tier). The two axes are **orthogonal**: a dimension can be deterministic but group-bound, or non-deterministic but autonomous. Both axes are carried independently in the grading entry as the fields `determinism` and `gradingTier` (see forthcoming `08-grading-model.md`).

| Axis | Values | Effect |
|------|--------|--------|
| Determinism | `deterministic` / `non-deterministic` | Reproducibility |
| Tier | `autonomous` / `group-bound` | Maximum attainable grade (Ch. 7) |

---

## 2. Axis 1 — Determinism

### 2.1 `deterministic`

A dimension is **deterministic** when the score is **reproducible** given:

- identical inputs, and
- identical `scoringSystem/X.Y.Z` version.

Examples: schema structure (v4.1 field-shape check), HTTP status, route-name match, imports scan, API-key-domain match, lint.

### 2.2 `non-deterministic`

A dimension is **non-deterministic** when the output depends on:

- the LLM model used,
- the persona under which the evaluation runs, or
- the group context (Selection composition).

For non-deterministic dimensions, the grading entry MUST record both `llmModel` and `selectionContext` (forthcoming `08-grading-model.md`).

### 2.3 Mixed Forms

Some dimensions have **both deterministic and non-deterministic sub-parts**. The canonical example is `aboutConventionCompliance`: the route-name match (does a route named `about` exist?) is deterministic; the content judgement (is the About content meaningful?) is non-deterministic.

For mixed forms, implementers MAY:

- split the dimension into two sub-dimensions (one `deterministic`, one `non-deterministic`), or
- collapse it into a single dimension with `determinism = non-deterministic` (the strictly reproducible sub-part still runs, but the aggregate carries the weaker reproducibility claim).

---

## 3. Axis 2 — Tier

### 3.1 `autonomous`

The dimension is graded by an **autonomous grader** (Single-Schema-Validator, [`04-phases-single.md`](./04-phases-single.md)) **without group context**. The maximum attainable grade for an aggregate composed exclusively of `autonomous` dimensions is **B**.

### 3.2 `group-bound`

The dimension is graded by a **group- or persona-bound grader** (Selection-Validator, [`05-phases-selection.md`](./05-phases-selection.md)). Grade **A** is reachable only when the aggregate contains at least one `group-bound` contribution.

### 3.3 Consumer Visibility

The forthcoming `08-grading-model.md` exposes a `maxAttainableGrade` field. This field makes it visible to a consumer that — for a schema graded only at the Single-Schema level — a **higher grade is reachable** by attaching the schema's namespace to a Selection and running the Selection phases.

---

## 4. Dimension Matrix

The following table is the **non-exhaustive but canonical** mapping of grading dimensions to the two axes. Each row carries the dimension name, its determinism value, its tier, and the phase that writes it.

| Dimension | Determinism | Tier | Source (Phase) |
|-----------|-------------|------|----------------|
| Schema structure (v4.1) | deterministic | autonomous | Single-Schema P3 |
| HTTP status (200 = pass) | deterministic | autonomous | Single-Schema P4 |
| Tool description neutrality | deterministic (heuristic) | autonomous | Single-Schema P5 |
| `whenToUse` clarity | non-deterministic | autonomous | Single-Schema P5 / Selection S3 |
| `parameters` understandability | non-deterministic | autonomous | Single-Schema P5 |
| `aboutConventionCompliance` | deterministic (route-name match) + non-deterministic (content) | autonomous | Single-Schema P6 / Selection S2 |
| `namespaceSkillValidity` | deterministic + non-deterministic | autonomous | Single-Schema P6 |
| `domainConformance` | deterministic (against domain doc) | group-bound | Selection S2 |
| `selectionSkillL1` / `L2` / `L3` | non-deterministic | group-bound | Selection S3 |
| `personaUseCaseFit` | non-deterministic | group-bound | Selection S4 |
| External-module audit | deterministic (imports) + non-deterministic (purpose) | autonomous | Security Ch. 9 |
| API-key-domain match | deterministic | autonomous | Security Ch. 9 |

A dimension that does not appear in this matrix MUST be added (and its axes declared) before it can be used in a grading entry.

---

## 5. Binding Rules

The following four rules are **binding** for every grader, scorer, and aggregator that conforms to `gradingSpec/1.0.0`.

1. **HTTP 4xx MUST NOT be treated as "auth-pass".** HTTP 4xx — including 401 and 403 — MUST NOT be scored as pass. **200 is pass; everything else is fail or defect.** (See [`feedback_http_400_is_not_pass`](#) and [`04-phases-single.md`](./04-phases-single.md) §6.)
2. **A schema MUST run all applicable deterministic tests.** Selective skipping is forbidden. If a deterministic test is applicable to a schema, the grader MUST execute it; the result MAY be `n/a` only when the test is provably non-applicable (e.g. jq-pipe on a schema without output).
3. **`aggregateGrade ≥ B` SHOULD contain at least one LLM-based (non-deterministic) evaluation.** A schema graded exclusively on deterministic dimensions can reach grade B, but the Grading-Spec recommends that at least one LLM verification be present at grade B and above.
4. **`aggregateGrade ≥ A` MUST contain at least one `group-bound` evaluation.** Grade A is **not autonomously reachable**. A schema graded only at the Single-Schema level (`tier = autonomous` throughout) cannot be assigned grade A.

---

## 6. Interaction with Veto

The categorical Veto (forthcoming `07-veto.md`) can be raised on **either tier**. Veto-driven gates halt downstream phases regardless of tier — see the cascade-stop rule in [`04-phases-single.md`](./04-phases-single.md) §6 and the analogous rule in [`05-phases-selection.md`](./05-phases-selection.md) §7.

A Veto is an outcome of its own; it does not reduce a numerical score, it replaces the aggregate grade with `REJECTED`.

---

## 7. Interaction with Scoring- / Grading-System Version

Determinism applies **at a fixed Scoring-System version**. A bump of the `scoringSystem/X.Y.Z` namespace can change how a deterministic test is scored — the test remains deterministic at the new version, but old scores cannot be compared one-to-one to new scores.

When `scoringSystem` is bumped, schemas MUST be re-scored. Cached scores from older versions MUST NOT be silently aggregated with new scores. The version contract is described in detail in the forthcoming `07-scoring-vs-grading.md`.

The same applies to `gradingSystem/X.Y.Z` bumps: thresholds, weights, tier trims, and the Veto list MAY change; the mapping from scores to grades is therefore version-bound.

---

## 8. Cross-References

- [`04-phases-single.md`](./04-phases-single.md) — Single-Schema phases P1–P7 (the cascade-stop and HTTP-4xx rule live here as well).
- [`05-phases-selection.md`](./05-phases-selection.md) — Selection phases S1–S4 (the `group-bound` contributions enter here).
- `07-scoring-vs-grading.md` (forthcoming) — Versioning contract for `scoringSystem` and `gradingSystem`.
- `08-grading-model.md` (forthcoming) — Defines `determinism`, `gradingTier`, and `maxAttainableGrade` as grading-entry fields.
- `09-security-and-development.md` (forthcoming) — Security dimensions (external-module audit, API-key-domain match) listed in §4.

---

Source: Memo 076 Kap 5.4, lines 213–216 (tier consequence); Kap 8, lines 321–352 (axes table, dimension matrix, binding rules).
