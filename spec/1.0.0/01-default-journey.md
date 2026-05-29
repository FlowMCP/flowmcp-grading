# 01 — Default Journey & Maximalism

| Field | Value |
|-------|-------|
| Status | Normative |
| Version | `gradingSpec/1.0.0` |
| Depends on | [`00-overview.md`](./00-overview.md) |
| Related | [`02-eligibility.md`](./02-eligibility.md), [`04-phases-single.md`](./04-phases-single.md) |

> Conformance language (MUST/SHOULD/MAY) follows BCP 14 [RFC2119]/[RFC8174] as defined in [`00-overview.md`](./00-overview.md). The binding source is the FlowMCP Schemas Specification v4.1.0.

---

## 1. Purpose

This chapter anchors the **default journey** by which a schema enters the FlowMCP corpus, the **maximalism principle** that governs its endpoint coverage, the link to the **interoperability** main focus, and the **completeness validation** as a contribution to phases P2 and P3 (see [`04-phases-single.md`](./04-phases-single.md)).

The default position is unambiguous: **more tools = better interoperability**. Reduction below the documented endpoint set MUST be justified, or it MUST cost points.

---

## 2. Default Journey (binding)

The **default entry point** for a gradable schema is the **documentation URL** of a publicly documented API. From that documentation, **1..n FlowMCP schemas** are derived which cover — as completely as possible — all endpoints admitted by the eligibility rules of [`02-eligibility.md`](./02-eligibility.md).

A documentation URL is **NOT** a mandatory entry point. Other entry paths — inference from network inspection, manual schema authoring — are permitted. The spec documents them as **exceptions**, not as the default.

- A documentation URL SHOULD be the entry point for every new schema.
- Non-documentation entry paths MAY be used, but they MUST be marked as exceptions in the schema metadata and MUST not weaken the maximalism rule below.

---

## 3. Maximalism Principle (MUST)

When the entry path is a documentation URL, the resulting schema (or schema set) **MUST be maximalist**: it MUST cover **all endpoints admitted by [`02-eligibility.md`](./02-eligibility.md)** (Chapter 3, eligibility rules).

**Reduction rule (MUST):** A schema that implements **fewer tools than the documentation supports** MUST either

1. carry an explicit, machine-readable justification per omitted endpoint (e.g. "endpoint excluded under [`02-eligibility.md`](./02-eligibility.md) §3.2"), **or**
2. accept a proportional point deduction in the **completeness validation** of phases P2/P3 (see [`04-phases-single.md`](./04-phases-single.md)).

No silent reduction. An omission without justification is a finding.

---

## 4. Default-Reversal (MUST be stated in the spec)

The **default is reversed**: when in doubt, take **more tools**.

The burden of justification rests on the party **reducing** the schema — not on the party including all documented endpoints. This rule was learned over months of practice: predictive trimming ("we probably won't need this endpoint") consistently produced gaps that later had to be closed. The user-level lesson is therefore normative here:

> **When in doubt — more tools.**

Implementers MUST treat this as the operational default. Reviewers and graders MUST hold reducers — not includers — to the burden of justification.

---

## 5. Connection to Interoperability

Maximalism follows directly from the **main focus interoperability** stated in [`00-overview.md`](./00-overview.md). Every omitted tool is one fewer potential connection between schemas. Predictive reduction (German: "Mitdenken") — i.e. anticipating which endpoints "won't be useful" — is explicitly **discouraged**. Connect first, optimise later.

This is the **deep cause** for the maximalism principle: a schema that omits endpoints which the underlying API documents is, by definition, less interoperable than the maximalist alternative.

---

## 6. Completeness Validation (P2/P3 contribution)

The **completeness validation** is a deterministic phase contribution graded in P2 (endpoint-list extraction) and P3 (schema draft) of [`04-phases-single.md`](./04-phases-single.md).

- The **original documentation** — or the endpoint list extracted in P2 — is the **validation baseline**.
- The grader MUST report any gap between the baseline and the implemented schema. Example: if a schema implements only 70% of the baseline-admitted endpoints, the grader MUST log the gap.
- The **point deduction MUST be proportional to the gap**, except where a per-endpoint justification under [`02-eligibility.md`](./02-eligibility.md) is present.

Gap reporting is mandatory; gap penalisation is conditional on the absence of an eligibility-based justification.

---

## 7. Cross-References

- [`00-overview.md`](./00-overview.md) — Conformance language, interoperability as the main focus.
- [`02-eligibility.md`](./02-eligibility.md) — Which endpoints are admitted (the maximalism boundary).
- [`04-phases-single.md`](./04-phases-single.md) — Phases P2/P3 carry the completeness-validation grading.

---

Source: Memo 076 Kap 2, lines 77–105.
