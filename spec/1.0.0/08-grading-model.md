# 08 — Grading Model

| Field | Value |
|-------|-------|
| Status | Normative |
| Version | `gradingSpec/1.0.0`, `gradingSystem/1.0.0` |
| Depends on | [`00-overview.md`](./00-overview.md), [`06-determinism-and-tier.md`](./06-determinism-and-tier.md), [`07-scoring-vs-grading.md`](./07-scoring-vs-grading.md) |
| Related | [`09-security-and-development.md`](./09-security-and-development.md), [`10-domain-knowledge.md`](./10-domain-knowledge.md), [`12-personas-contract.md`](./12-personas-contract.md), [`13-skills.md`](./13-skills.md) |
| Annex | [`08-grading-model.schema.json`](./08-grading-model.schema.json) — JSON-Schema 2020-12 of the grading entry |

> Conformance language (MUST/SHOULD/MAY) follows BCP 14 [RFC2119]/[RFC8174] as defined in [`00-overview.md`](./00-overview.md). The binding source is the FlowMCP Schemas Specification v4.1.0.

---

## 1. Core Statement

A grading is an **array of evaluations** that carries **veto power**, a **tier trim** (autonomous max `B` / group max `A`), and can be **re-triggered by the user**. It is described as **one data model** with **two skill families** writing into it. The Categorical Veto, when present, overrides every aggregation logic and yields `aggregateGrade = REJECTED`.

The grading entry is the **only** durable artefact emitted by a grader; it MUST be valid against [`08-grading-model.schema.json`](./08-grading-model.schema.json).

---

## 2. Architecture Decision (F13)

> **One data model, two skill families.**
>
> There is **one shared data model** (see fields below) and **two skill families** (Single-Schema-Validator + Selection-Validator) that write different dimensions into this one model. Advantage: anti-drift at the spec level, clear separation of applications at the implementation level.

The architecture decision (Memo 076 finding F13, lines 256–258) is binding. Implementers MUST NOT split the data model into two distinct types per skill family — the `gradingTier` field is the consumer-visible switch, the family separation lives in the implementation.

---

## 3. Data Model — Top-Level Fields

The grading entry is a JSON object with the following top-level fields. The column **Pflicht** indicates MUST / SHOULD / OPTIONAL. The column **Conditional** captures the version-conditional rules.

| Field | Type | Pflicht | Conditional | Description |
|-------|------|---------|-------------|-------------|
| `schemaId` | `string` | MUST | — | Identifier of the schema under grading. |
| `selectionId` | `string` | MUST when `gradingTier=group-bound` | If `group-bound`, REQUIRED; if `autonomous`, OPTIONAL | Identifier of the Selection under grading (when group-bound). |
| `gradingTier` | enum `autonomous` \| `group-bound` | MUST | — | Tier classification (see [`06-determinism-and-tier.md`](./06-determinism-and-tier.md)). |
| `scoringSystem` | `string` matching `^scoringSystem/\d+\.\d+\.\d+$` | MUST | — | Scoring System version (see [`07-scoring-vs-grading.md`](./07-scoring-vs-grading.md)). |
| `gradingSystem` | `string` matching `^gradingSystem/\d+\.\d+\.\d+$` | MUST | — | Grading System version (see [`07-scoring-vs-grading.md`](./07-scoring-vs-grading.md)). |
| `gradings` | `array` of grading entries | MUST | Minimum length 1 | The dimension-by-dimension scores (see §4). |
| `categoricalVeto` | `object` \| `null` | MUST (default `null`) | When non-null, forces `aggregateGrade=REJECTED` | The Categorical Veto record (see §6). |
| `regradingTrigger` | `object` | OPTIONAL | Present iff this entry is a re-grading | The re-grading trigger that produced this entry (see §11). |
| `aggregateGrade` | enum `A` \| `B` \| `C` \| `D` \| `F` \| `REJECTED` | MUST | `REJECTED` iff `categoricalVeto != null` | The aggregate grade after weighted aggregation and tier trim. |
| `maxAttainableGrade` | enum `A` \| `B` | MUST | Derived from `gradingTier` | The highest grade attainable at this tier (see §8). |

A grading entry MUST contain all MUST fields, conditional fields when their condition holds, and MAY contain OPTIONAL fields. `additionalProperties` is `false` (see [`08-grading-model.schema.json`](./08-grading-model.schema.json)).

---

## 4. Data Model — `gradings[]` Element

Each element of the `gradings[]` array is a JSON object describing **one dimension** scored by **one grader** at **one timestamp**. The element fields are:

| Field | Type | Pflicht | Conditional | Description |
|-------|------|---------|-------------|-------------|
| `dimension` | enum (see §5) | MUST | — | The dimension name. |
| `score` | `number` `1.0`–`5.0` OR enum `pass` \| `fail` \| `stale` \| `n/a` | MUST | See §5 | The score value. |
| `weight` | `number` | MUST | — | Weight contributed to the weighted aggregation. |
| `determinism` | enum `deterministic` \| `non-deterministic` | MUST | — | Whether the score is reproducible at the same `scoringSystem` version. |
| `graderIdentity` | `object` (`kind`, `name`, `version`) | MUST | — | Identity of the grader; `kind` ∈ `llm` \| `human` \| `script`. |
| `llmModel` | `string` | MUST when `graderIdentity.kind=llm` | — | Identifier of the LLM model used (e.g. `claude-opus-4-7`). |
| `selectionContext` | `object` (`groupId`, `personaIds[]`, `domainDocId`) | MUST when `determinism=non-deterministic` | When the dimension is non-deterministic, at least one persona is REQUIRED (see §13) | The group / persona / domain context under which the score was produced. |
| `timestamp` | `string` (ISO-8601) | MUST | — | Time of scoring. |
| `evidence` | `object` or `url` | SHOULD | — | Pointer to the underlying test evidence (HTTP response, LLM transcript, lint output, etc.). |
| `reasoning` | `string` | SHOULD | — | Human-readable rationale (especially for non-deterministic scores). |

`previousGradingId` is NOT a field on the `gradings[]` element; it lives on the top-level `regradingTrigger` object (see §11).

---

## 5. Dimension Enum and Score Values

### 5.1 Dimension Enum

The `dimension` field MUST be one of the following 17 values. A grading entry that uses a value not listed here is INVALID. Adding a new dimension is a `gradingSystem` bump (see [`07-scoring-vs-grading.md`](./07-scoring-vs-grading.md) §3).

1. `whenToUse`
2. `parameters`
3. `apiAvailability`
4. `personaUseCaseFit`
5. `domainConformance`
6. `tosMatch`
7. `legalAssessment`
8. `securityScore`
9. `formattingCompliance`
10. `outputSchemaConformance`
11. `descriptionNeutrality`
12. `completeness`
13. `aboutConventionCompliance`
14. `namespaceSkillValidity`
15. `selectionSkillL1`
16. `selectionSkillL2`
17. `selectionSkillL3`

### 5.2 Score Values

The `score` field is one of:

- a `number` in `[1.0, 5.0]` (numeric score), OR
- the enum string `pass` / `fail` / `stale` / `n/a`.

Mixing the two domains (e.g. `score = "3.0"`) is INVALID. The `pass` / `fail` enum is reserved for deterministic dimensions with a binary outcome (HTTP `200` is `pass`, anything else is `fail` — see [`06-determinism-and-tier.md`](./06-determinism-and-tier.md) §5 rule 1). The `stale` enum is reserved for aged-out time-dependent dimensions (see §9). The `n/a` enum is reserved for non-applicable dimensions (see §12).

---

## 6. Categorical Veto

The `categoricalVeto` field is either `null` (no veto) or an object describing a veto that was raised by a grader. The Veto is a **closed list** at this spec version; the four allowed triggers are enumerated below.

| Field | Type | Pflicht | Description |
|-------|------|---------|-------------|
| `triggeredBy` | enum (see below) | MUST | The veto trigger name. |
| `graderIdentity` | `object` (`kind`, `name`, `version`) | MUST | Identity of the grader who raised the veto. |
| `evidence` | `string` or `url` | MUST | Pointer to the evidence behind the veto. |
| `timestamp` | `string` (ISO-8601) | MUST | Time of veto. |

The `triggeredBy` enum is **closed**. The four allowed values are:

1. `malicious-module` — an imported module exhibits behaviour outside the tool's stated purpose (tracker, telemetry without user knowledge, malware). Deterministic part: imports scan. Non-deterministic part: behaviour judgement. See [`09-security-and-development.md`](./09-security-and-development.md) §3.
2. `api-key-domain-mismatch` — a `requiredServerParams` entry declares a key name that belongs to a different domain or company than the API itself (e.g. `FACEBOOK_API_KEY` for `example.xyz`). Deterministic. See [`09-security-and-development.md`](./09-security-and-development.md) §2.
3. `illegal-content` — the schema, its output, or its purpose involves illegal content. Non-deterministic. See [`09-security-and-development.md`](./09-security-and-development.md) §4.
4. `ai-security-veto` — the grader sees a security finding that is not on the closed deterministic list but is well-evidenced and well-reasoned. Non-deterministic; REQUIRES `evidence` AND `reasoning`. See [`09-security-and-development.md`](./09-security-and-development.md) §4.

Implementers MUST NOT extend the `triggeredBy` enum at runtime. Adding a new trigger is a `gradingSystem` bump.

When `categoricalVeto != null`, `aggregateGrade = REJECTED` (no aggregation is performed over `gradings[]`).

---

## 7. Skill Families (Binding)

The implementation separates the writers of `gradings[]` entries into **two skill families** — both write into the same data model but cover different tiers:

| Family | Repository | Writes | Yields |
|--------|-----------|--------|--------|
| Single-Schema-Validator | `flowmcp-grading` | Dimensions from phases P1–P7 (see [`04-phases-single.md`](./04-phases-single.md)) | `gradingTier = autonomous` |
| Selection-Validator | `flowmcp-grading` | Consumes Single-Schema grading entries plus phases S1–S4 results (see [`05-phases-selection.md`](./05-phases-selection.md)); writes additional `group-bound` dimensions | `gradingTier = group-bound` |

A grading entry MUST be written by **exactly one** of the two families. A Selection-Validator entry MAY reference the Single-Schema-Validator entries it consumed via `selectionContext.domainDocId` and the surrounding aggregator's bookkeeping; the spec does NOT require an explicit cross-link.

---

## 8. Tier Computation + `maxAttainableGrade`

`maxAttainableGrade` is derived from `gradingTier` by a fixed mapping:

| `gradingTier` | `maxAttainableGrade` |
|---------------|----------------------|
| `autonomous` | `B` |
| `group-bound` | `A` |

The mapping is binding. Implementers MUST emit `maxAttainableGrade` even though it is mechanically derived from `gradingTier`; consumers of grading entries (UIs, dashboards, registry pages) rely on the field being present so that they can communicate to the consumer that **a higher grade is attainable** by attaching the schema's namespace to a Selection and running the Selection phases. See [`06-determinism-and-tier.md`](./06-determinism-and-tier.md) §3.3.

---

## 9. Timeline Rule + Aging

Dimensions fall into two classes by their relationship to time:

| Class | Examples | Aging |
|-------|----------|-------|
| Time-**independent** | `descriptionNeutrality`, `formattingCompliance`, `outputSchemaConformance`, schema-structure validation | No aging. `timestamp` is required for audit purposes only. |
| Time-**dependent** | `apiAvailability`, `tosMatch`, `legalAssessment` | An aging threshold MUST be tracked; once the threshold is exceeded, the dimension's score MUST become `stale`. |

Aging defaults — referenced throughout the codebase as the constant `#AGING_DEFAULTS` — are:

| Aging key | Default | Applies to |
|-----------|---------|------------|
| `API_DAYS` | **14 days** | `apiAvailability` |
| `TOS_DAYS` | **30 days** | `tosMatch`, `legalAssessment` |
| `RETENTION_DAYS` | **180 days** | Total grading-entry retention before archival |

**Binding rule.** Aging produces `score = stale`, **not** `score = fail`. The two outcomes are semantically distinct: `fail` is an active negative judgement; `stale` is an absence of a recent positive judgement. Aggregation logic MUST treat `stale` differently from `fail` (see §10).

The defaults are explicit per the [`feedback_no_hidden_defaults`](https://github.com/) rule — implementers MUST NOT silently substitute alternative aging windows. Overrides MAY be configured per group but MUST be recorded in the Domain-Knowledge document (see [`10-domain-knowledge.md`](./10-domain-knowledge.md)).

---

## 10. Multi-Grader Rule

Multiple graders MAY independently score the same dimension. The data model **does NOT automatically consolidate** these multi-grader entries. Each entry stands on its own under its own `graderIdentity` and `timestamp`. Aggregation logic at the level of `aggregateGrade` SHOULD pick the most recent valid entry per dimension; tie-breaking and disagreement-handling rules are out of scope for `gradingSystem/1.0.0` and are tracked as a follow-up.

---

## 11. Re-Grading Trigger

A user, an aging job, or a version bump CAN trigger a re-grading. The `regradingTrigger` field records the trigger; the **old grading entry is NOT deleted** — the new entry references the old via `previousGradingId`.

The `regradingTrigger` object has these fields:

| Field | Type | Pflicht | Conditional | Description |
|-------|------|---------|-------------|-------------|
| `triggeredBy` | enum (see below) | MUST | — | The re-grading trigger name. |
| `reportedIssue` | `string` | MUST when `triggeredBy=user-report` | — | The free-text issue description supplied by the user. |
| `requestedBy` | `string` | MUST when `triggeredBy=user-report` | — | Identifier of the user who requested the re-grading. |
| `previousGradingId` | `string` | MUST | — | Identifier of the grading entry being superseded. |
| `timestamp` | `string` (ISO-8601) | MUST | — | Time of re-grading. |

The `triggeredBy` enum has four values:

1. `user-report` — a user reported a tool as "no longer working" via the CLI or issue template.
2. `scheduled` — a scheduled re-grading run (e.g. monthly).
3. `scoring-system-bump` — the `scoringSystem` version was bumped (see [`07-scoring-vs-grading.md`](./07-scoring-vs-grading.md)); affected dimensions are re-scored.
4. `grading-system-bump` — the `gradingSystem` version was bumped; affected dimensions are re-aggregated.

The grader reads `reportedIssue` (when present) and prioritises the re-evaluation of the dimensions implicated by the report. Implementers MUST NOT delete or overwrite the superseded grading entry. The lineage is preserved through `previousGradingId`.

---

## 12. `n/a` Pragma (Memo 054)

> *"Any grading > no grading."* (Memo 054, repeatedly reaffirmed by the user.)

The spec does NOT require a full grading across all 17 dimensions. It requires an **honest** `gradings[]` array: dimensions that were not actually tested MUST be recorded with `score = n/a`. The Anti-Pattern — and it is explicitly forbidden — is to **invent entries** instead of writing `n/a`. A grader that does not have evidence for a dimension MUST emit `n/a` rather than fabricate a score.

Aggregation logic at the level of `aggregateGrade` MUST treat `n/a` as **excluded from the weighted sum**: the entry contributes neither to the numerator nor to the denominator. Implementers MUST NOT silently substitute `n/a` with `0`, `1.0`, or any other numeric value. This rule is the binding interpretation of the [`feedback_no_silent_defaults`](https://github.com/) auto-memory.

---

## 13. Personas Obligation

Non-deterministic entries (`determinism = non-deterministic`) MUST carry at least one `personaId` in `selectionContext.personaIds[]`. A non-deterministic entry without persona context is INVALID; the JSON-Schema annex enforces this via a conditional `if/then` (see [`08-grading-model.schema.json`](./08-grading-model.schema.json)).

The Personas contract — including the Lens concept and the source of the four generalised personas — is defined in [`12-personas-contract.md`](./12-personas-contract.md).

Error-code names for the personas obligation are:

- `GRD-005` — non-deterministic entry missing `personaIds[]`.
- `VET-003` — Categorical Veto entry missing required `evidence` or `reasoning` when `triggeredBy = ai-security-veto`.

The full error-code catalogue is delivered in Phase 6 (PRD-22).

---

## 14. Aggregate-Grade Computation

The `aggregateGrade` is computed by the following rules.

1. **Veto short-circuit.** If `categoricalVeto != null`, then `aggregateGrade = REJECTED`. No aggregation runs.
2. **Weighted sum.** Otherwise, the grader computes a weighted average over all `gradings[]` entries whose `score` is a number, ignoring entries with `score ∈ { n/a }`. Entries with `score ∈ { pass, fail, stale }` are mapped to numbers by the Grading System version (`pass → 5.0`, `fail → 1.0`, `stale → omitted from numerator and denominator unless the Grading System version specifies otherwise`).
3. **Tier trim.** The weighted average is mapped to a grade letter `A`/`B`/`C`/`D`/`F` by thresholds defined at the `gradingSystem` version. The result is then **trimmed** by `maxAttainableGrade`: an `autonomous` entry capped at `B` cannot emit `A`.
4. **Minimum LLM rule.** For `aggregateGrade >= B`, at least one non-deterministic (LLM) entry SHOULD be present (see [`06-determinism-and-tier.md`](./06-determinism-and-tier.md) §5 rule 3).
5. **Group-bound rule for `A`.** For `aggregateGrade >= A`, at least one `group-bound` entry MUST be present (see [`06-determinism-and-tier.md`](./06-determinism-and-tier.md) §5 rule 4). A purely autonomous grading cannot yield `A`.

The concrete threshold values, weights per dimension, and `stale`-handling policy are NOT part of this spec chapter — they live in the `gradingSystem/1.0.0` implementation in Phase 6. The above five rules are the binding contract.

---

## 15. Examples

### 15.1 Autonomous Grading (Three Dimensions)

```json
{
    "schemaId": "etherscan/getBalance",
    "gradingTier": "autonomous",
    "scoringSystem": "scoringSystem/1.0.0",
    "gradingSystem": "gradingSystem/1.0.0",
    "gradings": [
        {
            "dimension": "apiAvailability",
            "score": "pass",
            "weight": 1.0,
            "determinism": "deterministic",
            "graderIdentity": { "kind": "script", "name": "single-schema-validator", "version": "0.1.0" },
            "timestamp": "2026-05-29T10:00:00Z",
            "evidence": "https://example.org/proofs/etherscan-getBalance/2026-05-29.txt"
        },
        {
            "dimension": "descriptionNeutrality",
            "score": 4.5,
            "weight": 1.0,
            "determinism": "deterministic",
            "graderIdentity": { "kind": "script", "name": "single-schema-validator", "version": "0.1.0" },
            "timestamp": "2026-05-29T10:00:00Z"
        },
        {
            "dimension": "whenToUse",
            "score": 4.0,
            "weight": 1.0,
            "determinism": "non-deterministic",
            "graderIdentity": { "kind": "llm", "name": "claude-opus-4-7", "version": "1m" },
            "llmModel": "claude-opus-4-7",
            "selectionContext": {
                "groupId": "crypto",
                "personaIds": ["decision-maker"],
                "domainDocId": "crypto-1.0.0"
            },
            "timestamp": "2026-05-29T10:00:00Z",
            "reasoning": "Clear, unambiguous trigger sentence; covers the canonical balance-lookup use case."
        }
    ],
    "categoricalVeto": null,
    "aggregateGrade": "B",
    "maxAttainableGrade": "B"
}
```

### 15.2 Rejected (Categorical Veto)

```json
{
    "schemaId": "example/maliciousAdapter",
    "gradingTier": "autonomous",
    "scoringSystem": "scoringSystem/1.0.0",
    "gradingSystem": "gradingSystem/1.0.0",
    "gradings": [
        {
            "dimension": "securityScore",
            "score": "fail",
            "weight": 1.0,
            "determinism": "deterministic",
            "graderIdentity": { "kind": "script", "name": "imports-scanner", "version": "0.1.0" },
            "timestamp": "2026-05-29T10:00:00Z",
            "evidence": "https://example.org/proofs/imports-scan.txt"
        }
    ],
    "categoricalVeto": {
        "triggeredBy": "api-key-domain-mismatch",
        "graderIdentity": { "kind": "script", "name": "api-key-domain-checker", "version": "0.1.0" },
        "evidence": "schema declares FACEBOOK_API_KEY for example.xyz",
        "timestamp": "2026-05-29T10:00:00Z"
    },
    "aggregateGrade": "REJECTED",
    "maxAttainableGrade": "B"
}
```

Both example documents validate against [`08-grading-model.schema.json`](./08-grading-model.schema.json).

---

## 16. Annex — JSON-Schema

The normative JSON-Schema for the grading entry is [`08-grading-model.schema.json`](./08-grading-model.schema.json) (JSON-Schema 2020-12). Every grading entry emitted by a grader MUST validate against this schema. The schema mirrors the conditional rules (e.g. `selectionId` required when `gradingTier=group-bound`, `llmModel` required when `graderIdentity.kind=llm`, `personaIds[]` required when `determinism=non-deterministic`) via JSON-Schema `if/then` blocks.

### 16.1 Smoke-Test (Pseudo-code)

```javascript
import { readFileSync } from 'node:fs'
import Ajv from 'ajv/dist/2020.js'

const schema = JSON.parse( readFileSync( 'spec/1.0.0/08-grading-model.schema.json', 'utf8' ) )
const valid = JSON.parse( readFileSync( 'spec/1.0.0/examples/grading-autonomous.json', 'utf8' ) )
const rejected = JSON.parse( readFileSync( 'spec/1.0.0/examples/grading-rejected.json', 'utf8' ) )

const ajv = new Ajv( { strict: true, allErrors: true } )
const validate = ajv.compile( schema )

const okValid = validate( valid )
const okRejected = validate( rejected )

if( !okValid ) { throw new Error( 'autonomous example invalid: ' + JSON.stringify( validate.errors ) ) }
if( !okRejected ) { throw new Error( 'rejected example invalid: ' + JSON.stringify( validate.errors ) ) }
if( rejected.aggregateGrade !== 'REJECTED' ) { throw new Error( 'rejected example must aggregate to REJECTED' ) }
```

---

## 17. Cross-References

- [`07-scoring-vs-grading.md`](./07-scoring-vs-grading.md) — separation of the two systems and their version namespaces.
- [`06-determinism-and-tier.md`](./06-determinism-and-tier.md) — the two axes that underlie the `determinism` and `gradingTier` fields.
- [`09-security-and-development.md`](./09-security-and-development.md) — the Categorical-Veto trigger definitions and the API-key-hygiene rules.
- [`10-domain-knowledge.md`](./10-domain-knowledge.md) — the source of `selectionContext.domainDocId`.
- [`12-personas-contract.md`](./12-personas-contract.md) — the source of `selectionContext.personaIds[]`.
- [`13-skills.md`](./13-skills.md) — the source of the dimensions `namespaceSkillValidity`, `selectionSkillL1`, `selectionSkillL2`, `selectionSkillL3`.

---

Source: Memo 076 Kap 7, lines 252–319.
