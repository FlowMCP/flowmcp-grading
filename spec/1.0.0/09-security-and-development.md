# 09 — Security and Development

| Field | Value |
|-------|-------|
| Status | Normative |
| Version | `gradingSpec/1.0.0`, `gradingSystem/1.0.0` |
| Depends on | [`00-overview.md`](./00-overview.md), [`07-scoring-vs-grading.md`](./07-scoring-vs-grading.md), [`08-grading-model.md`](./08-grading-model.md) |
| Related | [`10-domain-knowledge.md`](./10-domain-knowledge.md), Schemas-Spec v4.1.0 [`11-preload.md`](https://github.com/FlowMCP/flowmcp-spec/blob/main/spec/v4.1.0/11-preload.md), [`node-formatting`](https://github.com/) skill, [`node-error-codes`](https://github.com/) skill |

> Conformance language (MUST/SHOULD/MAY) follows BCP 14 [RFC2119]/[RFC8174] as defined in [`00-overview.md`](./00-overview.md). The binding source is the FlowMCP Schemas Specification v4.1.0.

---

## 1. Introduction

Security and development discipline form an **independent grading area with high veto affinity**. Three of the four Categorical-Veto triggers defined in [`08-grading-model.md`](./08-grading-model.md) §6 live in this chapter (`malicious-module`, `api-key-domain-mismatch`, `illegal-content`), and the fourth (`ai-security-veto`) is the non-deterministic counterpart that catches what the deterministic triggers miss. This chapter defines the binding rules for each.

The dimensions covered here feed primarily `securityScore` (autonomous tier), plus `formattingCompliance` and the `outputSchemaConformance` sub-dimension "pipebarkeit". No dimension defined in this chapter raises the maximum attainable grade beyond `B` on its own.

---

## 2. API-Key Hygiene (Deterministic)

The following three rules are binding for every schema. A violation of rule (3) raises a Categorical Veto with `triggeredBy = api-key-domain-mismatch`.

1. API keys MUST NOT be printed via `console.log` (or any equivalent stdout/stderr writer). Schemas that leak credentials at runtime are scored `securityScore = fail`.
2. API keys MUST NOT appear in comments. Hard-coded examples, "TODO remove" lines, and forgotten debug values count as comments.
3. `requiredServerParams` MUST contain only key names that belong **to the API's own domain** OR **to the same company**. A key name from an unrelated provider is a domain-mismatch.

**Example (Memo 076, verbatim).** A schema for API `example.xyz` declares `requiredServerParams: [ "FACEBOOK_API_KEY" ]`. Facebook is unrelated to `example.xyz`; this is a domain-mismatch. The grader MUST raise `categoricalVeto.triggeredBy = api-key-domain-mismatch` with `evidence` pointing to the offending `requiredServerParams` entry.

A schema that uses a generic placeholder (e.g. `EXAMPLE_API_KEY`) for an API hosted at `example.xyz` is NOT a domain-mismatch — the placeholder name aligns with the domain.

---

## 3. External Modules and Imports

Every imported external module is part of the schema's attack surface. The grader runs an **imports scan** (deterministic) and an **intent judgement** (non-deterministic) over each import.

| Class | Determinism | Rule |
|-------|-------------|------|
| Minimalist, on-purpose | deterministic + non-deterministic | Allowed. Example: `node-fetch` for an HTTP-based schema. Score-boost on `securityScore` for explicit, on-purpose imports. |
| Telemetry-only / tracker | deterministic (import name) + non-deterministic (purpose) | Reduces `securityScore`. NOT a Categorical Veto by itself, but a measurable penalty. |
| Behaviour outside the tool's stated purpose | deterministic (import name) + non-deterministic (behaviour) | Categorical Veto `malicious-module`. Examples: trackers without user awareness, telemetry that exfiltrates user data, malware. |

The imports scanner MUST list every external module with its name, version, and source (npm, file, URL). The list is part of the `evidence` field of the relevant grading entry.

**Binding rule.** A telemetry-only module that does not exfiltrate user data is NOT a veto trigger — it is a `securityScore` reducer. A veto requires either the deterministic match against the malicious-module list (Phase 6 implementation) OR a non-deterministic judgement under `ai-security-veto` (see §4).

---

## 4. AI Security Veto (Non-Deterministic)

A grader (typically an LLM grader) CAN raise `categoricalVeto.triggeredBy = ai-security-veto` when it detects a security finding that is **not on the deterministic veto list** but is well-evidenced and well-reasoned.

The `ai-security-veto` trigger REQUIRES both:

- `evidence` — a pointer to the concrete artefact (code snippet, output sample, third-party report) that supports the finding.
- `reasoning` — a free-text explanation of why the artefact constitutes a security risk.

A grading entry that sets `triggeredBy = ai-security-veto` without populating `evidence` AND `reasoning` is INVALID (see [`08-grading-model.schema.json`](./08-grading-model.schema.json)) and is rejected at validation time with error code `VET-003` (see [`08-grading-model.md`](./08-grading-model.md) §13).

This rule deliberately keeps the AI veto open-ended in its trigger condition but **closed in its evidence and reasoning obligation**. The closed list of trigger names (`malicious-module`, `api-key-domain-mismatch`, `illegal-content`, `ai-security-veto`) is NOT extensible at runtime; widening the list is a `gradingSystem` bump.

---

## 5. Error Management (Deterministic)

Schemas SHOULD use the PREFIX-NUMBER error-code pattern defined by the [`node-error-codes`](https://github.com/) skill (catalogue available at `~/.claude/skills/node-error-codes`). The pattern requires every emitted error to carry a stable prefix (e.g. `RES`, `SKL`, `GRD`) and a stable numeric code (e.g. `RES013`).

| Pattern | Score impact |
|---------|--------------|
| PREFIX-NUMBER catalogued errors with stable codes and severity classification | Score-boost on `formattingCompliance` and `securityScore` |
| Generic `try { ... } catch( e ) { throw e }` re-throws without code annotation | Score reduction on `formattingCompliance` |
| Swallowing errors without re-throw or log | Severe reduction on `securityScore` — silent failures hide security incidents |

The full error-code catalogue for the grading subsystem itself (codes `GRD-*`, `SCO-*`, `VET-*`) is delivered in Phase 6 (PRD-22, referenced from [`08-grading-model.md`](./08-grading-model.md) §13).

---

## 6. Best-Practice Reference — Preload Pattern

The Schemas-Spec v4.1.0 defines the **Preload pattern** in [`11-preload.md`](https://github.com/FlowMCP/flowmcp-spec/blob/main/spec/v4.1.0/11-preload.md). For schemas that handle **large, infrequently-updated data sets**, Preload SHOULD be used.

**Example (Memo 076, verbatim).** A schema fetches a 2-MB reference data file that is updated daily. The schema SHOULD use Preload to cache the file once per day rather than re-fetching it on every tool call.

| Behaviour | Score impact |
|-----------|--------------|
| Correct Preload use for large daily-update data | Score-boost on `securityScore` (network attack surface) and on `outputSchemaConformance` |
| Repeated fetch of a large file that fits the Preload pattern | Score reduction on `securityScore` |
| Preload on data that changes per request (anti-pattern) | Score reduction on `outputSchemaConformance` |

Preload is a recommendation; the absence of Preload is NOT a Categorical Veto.

---

## 7. Best-Practice Reference — Shared Lists

A group's Domain-Knowledge document (see [`10-domain-knowledge.md`](./10-domain-knowledge.md) — Phase 5; this is a forward reference) MAY prescribe a **Shared List** that all schemas in the group MUST use instead of a provider-specific convention. The canonical example is the Shared Chain Name List in the crypto domain: schemas in the crypto group MUST emit `sol` (Shared List) rather than `solana` (CoinGecko convention) when referring to the Solana chain.

A violation of a Shared-List obligation is NOT a Categorical Veto. It is a **strong score penalty** on `domainConformance` (the dimension is `group-bound`, see [`06-determinism-and-tier.md`](./06-determinism-and-tier.md) §4 dimension matrix). The "forbidden conventions" section of the Domain-Knowledge document is the source of truth for which provider conventions are disallowed per group.

---

## 8. Formatting (Deterministic)

Schema source code MUST follow the rules defined by the [`node-formatting`](https://github.com/) skill (catalogue available at `~/.claude/skills/node-formatting`). The three most-cited rules are:

1. **4-space indentation.** Tabs and 2-space indentation are not conformant.
2. **No semicolons.** Statement terminators are omitted; ASI (automatic semicolon insertion) is relied upon.
3. **`if()` spacing.** Single space between `if` and its condition; condition parenthesised with spaces inside: `if ( condition )`.

A **lint script** is expected as part of the grader's setup (the spec requires its existence; the implementation is Phase 6). The lint script's output feeds the `formattingCompliance` dimension.

---

## 9. Pipebarkeit + Output Schema (Sub-Dimension)

jq-pipe compatibility is a **sub-dimension** of `outputSchemaConformance` with **low weight**. A schema's output SHOULD be navigable by canonical jq expressions (`.data.results[0].balance`); a schema that emits free-form prose at the top level reduces its pipebarkeit score even though no veto is raised.

This sub-dimension is deterministic: the test runs a fixed jq expression against the schema's output and checks whether the expression yields a value. It contributes a small score adjustment to `outputSchemaConformance`; the weight is set by the `gradingSystem` version.

---

## 10. Veto-Trigger Overview

The following table lists all four Categorical-Veto triggers defined by `gradingSpec/1.0.0`. The trigger names are **identical to** the enum values in [`08-grading-model.schema.json`](./08-grading-model.schema.json) `properties.categoricalVeto.oneOf[1].properties.triggeredBy.enum`. The grader MUST NOT introduce new names at runtime.

| Trigger | Class | Source |
|---------|-------|--------|
| `malicious-module` | deterministic (imports scan) + non-deterministic (behaviour judgement) | Module audit (§3) |
| `api-key-domain-mismatch` | deterministic | API-key hygiene (§2) |
| `illegal-content` | non-deterministic | Content review |
| `ai-security-veto` | non-deterministic | AI grader reasoning (§4) |

The data model for veto entries lives in [`08-grading-model.md`](./08-grading-model.md) §6; this chapter does NOT redefine the veto record. The four trigger names enumerated above MUST match the enum values defined there.

---

## 11. Env Handling Reference

Grader tools MUST NOT read `.env` files **directly** via `Read`/`grep`/`Edit` or any equivalent file API. The only conformant way to consume `~/.flowmcp/.env` is via the helper scripts (`flowmcp dev env doctor`, `flowmcp dev env acquire`, `flowmcp dev env backup`, `flowmcp dev env restore`, `flowmcp dev env diff`) defined in Memo 032. The binding rationale is the auto-memory [`feedback_never_read_env_files_with_values`](https://github.com/), which records the 2026-05-15 incident in which seven API keys were exposed by direct file operations.

Implementers of graders MUST treat any direct `.env` read as a `securityScore` failure of the grader itself (meta-rule). This rule does NOT apply to the schema under grading — it applies to the grader tooling.

---

## 12. Anti-Defaults

The auto-memory [`feedback_no_silent_defaults`](https://github.com/) is binding for this spec chapter. Every score-boost and every score-reduction described above MUST be **explicit** in the `gradingSystem/1.0.0` implementation:

- No silent fall-through to `0` for missing dimensions (`n/a` is the documented placeholder — see [`08-grading-model.md`](./08-grading-model.md) §12).
- No silent `||`-defaulting in scoring code (the `||` operator MUST NOT be used to substitute a missing value; explicit conditional validation is required).
- Aging defaults (14 / 30 / 180 days, the `#AGING_DEFAULTS` constant) MUST be exposed as named constants in the implementation, not as inline literals.

Concrete weights, thresholds, and score-boost magnitudes belong in the `gradingSystem/1.0.0` implementation (Phase 6); this chapter does NOT enumerate them. The binding contract is the **explicitness** rule, not specific numerical values.

---

## 13. Cross-References

- [`07-scoring-vs-grading.md`](./07-scoring-vs-grading.md) — the version namespaces (`scoringSystem` / `gradingSystem`) that bind score changes from this chapter.
- [`08-grading-model.md`](./08-grading-model.md) — the data model of the Categorical Veto entries defined here.
- [`10-domain-knowledge.md`](./10-domain-knowledge.md) — Shared Lists and forbidden provider conventions (forward reference, Phase 5).
- Schemas-Spec v4.1.0 [`11-preload.md`](https://github.com/FlowMCP/flowmcp-spec/blob/main/spec/v4.1.0/11-preload.md) — the Preload pattern (external).
- [`node-formatting`](https://github.com/) skill (`~/.claude/skills/node-formatting`) — formatting rules.
- [`node-error-codes`](https://github.com/) skill (`~/.claude/skills/node-error-codes`) — PREFIX-NUMBER error-code pattern.
- [`feedback_no_silent_defaults`](https://github.com/) auto-memory — anti-defaults rule.
- [`feedback_never_read_env_files_with_values`](https://github.com/) auto-memory + Memo 032 — env handling.

---

Source: Memo 076 Kap 9, lines 356–390.
