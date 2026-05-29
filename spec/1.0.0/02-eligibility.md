# 02 — Eligibility

| Field | Value |
|-------|-------|
| Status | Normative |
| Version | `gradingSpec/1.0.0` |
| Depends on | [`00-overview.md`](./00-overview.md) |
| Related | [`01-default-journey.md`](./01-default-journey.md), [`04-phases-single.md`](./04-phases-single.md) |

> Conformance language (MUST/SHOULD/MAY) follows BCP 14 [RFC2119]/[RFC8174] as defined in [`00-overview.md`](./00-overview.md). The binding source is the FlowMCP Schemas Specification v4.1.0.

---

## 1. Purpose

This chapter defines **what is allowed to be part of a gradable schema**. Eligibility is the upstream gate: an endpoint that is not eligible MUST NOT appear in a schema. The maximalism principle in [`01-default-journey.md`](./01-default-journey.md) operates **inside** the eligibility boundary — "all admitted endpoints" means "all endpoints that pass the rules in this chapter".

---

## 2. Read Focus (SHOULD)

The **core focus** of a FlowMCP schema is **reading data**. Write, update, and delete operations are not categorically forbidden, but they SHOULD NOT appear in a schema.

- Graders MUST NOT execute state-changing calls during grading. All grader-driven test invocations MUST be read-only.
- Schema authors SHOULD restrict the schema surface to read endpoints.

A schema that contains write/update/delete tools without an explicit, documented justification will be flagged under §3 below.

---

## 3. Exclusion Criteria (MUST NOT appear in a schema)

The following endpoints MUST NOT be included in a gradable schema:

1. **Legally non-public endpoints** — endpoints that, by law or by the provider's published terms, are not permitted for public use.
2. **Non-general endpoints** — customer- or tenant-specific administration APIs (e.g. account-management endpoints scoped to a single tenant).
3. **Write/update/delete endpoints without justification** — write operations that lack a specific, documented reason for inclusion.
4. **Reachable but undocumented endpoints** — endpoints that are publicly reachable but **not actually documented**. These MAY indicate a provider-side defect (an endpoint that was unintentionally exposed) and MUST NOT be included on the assumption that "reachable = public-intent".

The **undocumented-endpoint exclusion** is a distinct, named exclusion ground. Reachability is not documentation.

---

## 4. Access Classes

A schema's endpoints fall into one of three access classes:

| Class | Status | Conditions |
|-------|--------|------------|
| Free, no API key | **Permitted** | Endpoint is callable without any credential. |
| API key (static) | **Permitted** | API key is passed at runtime start as a static parameter (e.g. `requiredServerParams`). |
| Commercial with free tier | **Permitted** | At least a partial free tier exists; otherwise the endpoint is treated as non-eligible. |

### 4.1 OAuth — MUST NOT

**OAuth-based access is out of scope for `gradingSpec/1.0.0`.** Endpoints whose **only** access path is OAuth (interactive consent flow, user-bound tokens) MUST NOT be part of a gradable schema. This is a hard exclusion, not a soft "currently unsupported" — implementers MUST treat it as `MUST NOT` per BCP 14.

OAuth support MAY be introduced in a later spec version. Until then, no exception.

---

## 5. Schema Splitting (MUST)

If a single API exposes both **freely accessible** and **API-key-only** endpoints, the freely accessible endpoints and the API-key-only endpoints **MUST be split into separate schemas**.

- One schema MUST NOT mix free and API-key-only endpoints.
- The split MUST be reflected in the schema metadata (e.g. distinct namespaces or distinct schema files).
- This split is independent of the maximalism principle: both schemas — the free schema and the API-key schema — MUST individually be maximalist under [`01-default-journey.md`](./01-default-journey.md).

The reason for the split is twofold: it lets the free schema be used without credentials, and it lets the grader run the free schema fully autonomously while gating the API-key schema on credential availability.

---

## 6. Target Audience for Data Sources

The **primary** target audience for FlowMCP data sources is **public interfaces**:

- Public-sector authorities (Behörden).
- Public institutions (universities, statistical offices, regulators).
- Private parties offering public data (open-data publishers).

The **secondary** target audience is **commercial providers with a free tier**.

Selection of data sources SHOULD reflect this priority order. Commercial APIs without a free tier do not belong in the FlowMCP corpus.

---

## 7. Verification

The eligibility rules of §3–§6 are verified in the phases defined in [`04-phases-single.md`](./04-phases-single.md):

- §3 (exclusion criteria) is enforced in P2 (analysis) — the endpoint list MUST already be eligibility-classified.
- §4 (access classes) and §5 (splitting) are enforced in P2 and P3 (schema draft).
- §6 (target audience) is a corpus-level guideline — verified by the maintainers, not by an automated grader.

The detailed verification method belongs to the grader implementation and is out of scope for this chapter.

---

## 8. Cross-References

- [`00-overview.md`](./00-overview.md) — Conformance language.
- [`01-default-journey.md`](./01-default-journey.md) — The maximalism principle operates within the eligibility boundary defined here.
- [`04-phases-single.md`](./04-phases-single.md) — Verification phases P2/P3.

---

Source: Memo 076 Kap 3, lines 107–135.
