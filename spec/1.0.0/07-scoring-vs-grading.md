# 07 — Scoring System vs. Grading System

| Field | Value |
|-------|-------|
| Status | Normative |
| Version | `scoringSystem/1.0.0`, `gradingSystem/1.0.0` |
| Depends on | [`00-overview.md`](./00-overview.md), [`06-determinism-and-tier.md`](./06-determinism-and-tier.md) |
| Related | [`08-grading-model.md`](./08-grading-model.md), [`04-phases-single.md`](./04-phases-single.md), [`05-phases-selection.md`](./05-phases-selection.md), Schemas-Spec v4.1.0 [`22-scoring-protocol.md`](https://github.com/FlowMCP/flowmcp-spec/blob/main/spec/v4.1.0/22-scoring-protocol.md) |

> Conformance language (MUST/SHOULD/MAY) follows BCP 14 [RFC2119]/[RFC8174] as defined in [`00-overview.md`](./00-overview.md). The binding source is the FlowMCP Schemas Specification v4.1.0.

---

## 1. Core Statement

The terms **"Scoring"** and **"Grading"** are used **strictly separately** throughout this specification. They name two different sub-systems with two independent version namespaces. A scoring update does **not** automatically imply a grading update — and vice versa.

A grader, scorer, or aggregator that conforms to `gradingSpec/1.0.0` MUST keep both names — and both version strings — apart in every emitted artefact (grading entries, logs, error codes).

---

## 2. Comparison Table

The following table is the canonical, binding distinction between the two systems. Implementers MUST NOT collapse rows.

| Aspect | Scoring System | Grading System |
|--------|----------------|-----------------|
| What it is | How tests are **evidenced** (one score per test / per dimension) | How a **grade** (a letter mark) is derived from a collection of scores |
| Input | Test outcome (HTTP status, LLM answer, imports scan, documentation match) | Collection of scores from the Scoring System |
| Output | Numerical score `1.0`–`5.0` or enum `pass` / `fail` / `stale` per dimension | Aggregate grade `A` / `B` / `C` / `D` / `F`, or `REJECTED` (on Categorical Veto) |
| What its updates change | How tests are evidenced (e.g. a new HTTP heuristic). Tracked under spec version `scoringSystem/X.Y.Z` | Thresholds, weights, tier trim, Veto list. Tracked under spec version `gradingSystem/X.Y.Z` |
| Reproducibility | Score is reproducible given identical inputs AND identical `scoringSystem` version | Grade is reproducible given identical scores AND identical `gradingSystem` version |

---

## 3. Versioning Schema

The two systems carry **two independent SemVer namespaces**:

| Namespace | Pattern | Bumped when |
|-----------|---------|-------------|
| `scoringSystem/X.Y.Z` | `^scoringSystem/\d+\.\d+\.\d+$` | A scoring rule, heuristic, or evidence-extraction changes such that the score output for the same input changes |
| `gradingSystem/X.Y.Z` | `^gradingSystem/\d+\.\d+\.\d+$` | Thresholds, weights, tier trim rules, Categorical-Veto trigger list, or aggregation logic change such that the grade output for the same score input changes |

SemVer semantics (`MAJOR.MINOR.PATCH`) apply per namespace independently. The two namespaces are NOT lock-stepped.

The third namespace `gradingSpec/X.Y.Z` (the document set you are reading) is versioned separately again — see [`00-overview.md`](./00-overview.md) §"Three Independently Versioned Namespaces".

---

## 4. Binding Rules

The following rules are **binding** for every grader, scorer, and aggregator that conforms to `gradingSpec/1.0.0`.

1. **Both version strings MUST be present in every grading entry.** Every grading entry (defined in [`08-grading-model.md`](./08-grading-model.md)) MUST carry both `scoringSystem` and `gradingSystem` as top-level version fields. A grading entry that lacks either field is INVALID.
2. **Scoring-System bump and Grading-System bump are independent triggers.** A change in the Scoring System triggers a **re-scoring** at the next re-grading run, but does NOT automatically bump the Grading System. A change in the Grading System triggers a **re-grading** but does NOT automatically bump the Scoring System. Implementers MUST NOT couple the two version namespaces.
3. **Example (HTTP-429 heuristic).** Suppose the current versions are `scoringSystem/1.0.0` and `gradingSystem/1.0.0`. A maintainer decides that HTTP `429` ("rate-limited, retry") MUST be scored as a transient defect (not `fail`). The Scoring System advances to `scoringSystem/1.1.0`. The Grading System remains at `gradingSystem/1.0.0` because the score-to-grade mapping is unchanged. New grading entries record `scoringSystem/1.1.0` + `gradingSystem/1.0.0`; old entries remain at `1.0.0/1.0.0` until they are re-scored.

---

## 5. Relationship to the Schemas-Spec v4.1.0

The Schemas-Spec v4.1.0 provides the **upstream contract** for scoring: the `prompts.json` / `scores.json` artefact pair is defined in [`22-scoring-protocol.md`](https://github.com/FlowMCP/flowmcp-spec/blob/main/spec/v4.1.0/22-scoring-protocol.md) of the Schemas-Spec (sister repository `flowmcp-spec`). The Scoring System named here **sub-consumes** that protocol: scores produced by the Schemas-Spec scoring protocol enter this spec's Scoring System as inputs, and the dimensions enumerated in [`08-grading-model.md`](./08-grading-model.md) §"Dimension Enum" extend that protocol with the additional grading dimensions defined here.

This Grading-Spec does NOT re-define the `prompts.json` / `scores.json` contract. Implementers MUST treat the Schemas-Spec v4.1.0 `22-scoring-protocol.md` as the **highest instance** for the artefact pair; conflicting prose in this spec is to be read as a refinement, not as a replacement.

---

## 6. Cross-References

- [`08-grading-model.md`](./08-grading-model.md) — how scores become a grade (the data model and the JSON-Schema annex).
- [`04-phases-single.md`](./04-phases-single.md) / [`05-phases-selection.md`](./05-phases-selection.md) — where scores are produced.
- Schemas-Spec v4.1.0 [`22-scoring-protocol.md`](https://github.com/FlowMCP/flowmcp-spec/blob/main/spec/v4.1.0/22-scoring-protocol.md) — sub-consumed scoring artefact contract (external).
- [`06-determinism-and-tier.md`](./06-determinism-and-tier.md) §7 — interaction of version bumps with reproducibility.

---

Source: Memo 076 Kap 6, lines 226–250.
