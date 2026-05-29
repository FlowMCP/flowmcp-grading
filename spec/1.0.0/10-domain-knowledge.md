# 10 — Domain Knowledge and Group Definition

| Field | Value |
|-------|-------|
| Status | Normative |
| Version | `gradingSpec/1.0.0` |
| Depends on | [`00-overview.md`](./00-overview.md), [`08-grading-model.md`](./08-grading-model.md), [`09-security-and-development.md`](./09-security-and-development.md) |
| Related | [`12-personas-contract.md`](./12-personas-contract.md), [`13-skills.md`](./13-skills.md) |

> Conformance language (MUST/SHOULD/MAY) follows BCP 14 [RFC2119]/[RFC8174] as defined in [`00-overview.md`](./00-overview.md). The binding source is the FlowMCP Schemas Specification v4.1.0.

---

## 1. Purpose

A **topic group** (Selection composed of several namespaces) develops conventions, shared vocabularies, and provider-specific quirks that are not visible from any single namespace in isolation. Schema and Selection grading at the `group-bound` tier (see [`06-determinism-and-tier.md`](./06-determinism-and-tier.md) §3.2) MUST be validated against a **Domain-Knowledge document** that captures these conventions in writing.

Without a Domain-Knowledge document for a group, the Selection-Validator cannot produce a `group-bound` grading entry. The schemas in the Selection MAY still be graded at the `autonomous` tier; the grading entries then carry `gradingTier = autonomous` and `maxAttainableGrade = B`.

The dimension that consumes the Domain-Knowledge document is `domainConformance` (see [`08-grading-model.md`](./08-grading-model.md) §5.1).

---

## 2. Group Definition

A "group" — i.e. a Selection deserving its own Domain-Knowledge document — is defined by **two thresholds** over the number of namespaces in the Selection:

| Threshold | Condition | Effect |
|-----------|-----------|--------|
| **Soft** | ≥ **5** namespaces | A Selection SHOULD be treated as a group. Selection-Skill MAY be created. Phases S2/S3 (see [`05-phases-selection.md`](./05-phases-selection.md)) run with a **reduced anspruch**. `aggregateGrade = A` is NOT regularly attainable at this threshold. |
| **Hard** | ≥ **7** namespaces | Full group optimisation applies. Phase S4 (`personaUseCaseFit`) is fully scaled. `aggregateGrade = A` is **regularly attainable** at this threshold. |

A Selection with **fewer than 5 namespaces** is explicitly **not a group in the narrow sense**. A 3-namespace Selection MAY still be grouped for convenience (UI grouping, Skill registration), but it does NOT trigger the group-bound grading path; entries derived from it carry `gradingTier = autonomous`.

### 2.1 Diversity Argument (User-Belegt)

> **User belief (REV-03 feedback, Memo 076 Kap 10):** *"Umso mehr Namespaces dabei sind, umso besser."* — The more namespaces a Selection contains, the better.

This statement is the **belegte rationale** behind the hard threshold of seven. Diversity of sources is the precondition for a meaningful persona-/domain-conformance evaluation: a Selection that aggregates only two or three providers cannot reliably tell whether a given convention is a domain-wide standard or a single-provider quirk. The hard threshold encodes this preference structurally.

---

## 3. Mandatory Sections of a Domain-Knowledge Document

A Domain-Knowledge document MUST contain the following **seven sections**. The document MAY add further sections; the seven below are the binding minimum. A document that lacks any of these sections is INVALID for the purpose of `domainConformance` grading.

1. **Identity** — `groupId`, human name, one-paragraph description.
2. **Shared Lists** — the list of Shared Lists the group adopts (e.g. the Shared Chain Name List), with a MUST-statement that schemas in the group use the Shared List in place of any provider-specific convention.
3. **Conventions** — naming, casing, ordering, aggregation strategy. The conventions the group has agreed upon and which schemas MUST follow.
4. **Forbidden Conventions** — explicitly listed **provider conventions** that schemas MUST NOT adopt. The crypto example below is the canonical illustration.
5. **Use Cases** — typical scenarios the group serves; the source of truth for `personaUseCaseFit` reasoning at the Selection level.
6. **Personas Reference** — which of the four generalised personas (see [`12-personas-contract.md`](./12-personas-contract.md)) apply to the group, including the group's **Lens definitions** (e.g. `crypto-trader` as a Lens over `decision-maker`).
7. **Aging Rule** — how long the document remains valid for grading purposes. Default: **90 days**. Once exceeded, the document MUST be re-reviewed; grading entries that referenced it MAY be marked `score = stale` per the aging rule in [`08-grading-model.md`](./08-grading-model.md) §9.

The aging rule for the Domain-Knowledge document itself is separate from the aging defaults for individual dimensions (`API_DAYS`, `TOS_DAYS`, `RETENTION_DAYS` — see [`08-grading-model.md`](./08-grading-model.md) §9). The 90-day default for Domain-Knowledge documents is a SHOULD; groups MAY override.

---

## 4. Crypto Reference Example

The crypto domain is the canonical illustration of the Domain-Knowledge contract, and the **Forbidden Conventions** section is where the contract bites.

**Concrete conflict.** CoinGecko, a widely-used third-party data provider, uses the chain name `solana` in its API responses. The Shared Chain Name List — adopted by the crypto group as its canonical Shared List — uses `sol` for the same chain. A schema in the crypto Selection that emits `solana` (CoinGecko convention) instead of `sol` (Shared List) is in **direct conflict** with the group's Domain-Knowledge document.

**Grading consequence.** The grader records a Forbidden-Conventions violation in the `domainConformance` dimension. The violation is **NOT a Categorical Veto** — it does not raise `aggregateGrade = REJECTED`. It IS a **strong score reduction** on `domainConformance` via a high `weight`. The high weight reflects the user's repeated experience of having to explain the Shared-List rule across multiple schema reviews.

The choice of "high weight, no veto" deliberately keeps the door open: a schema that violates a Forbidden Convention is **fixable** by remapping the value at the schema's output layer, and the grading should incentivise the fix rather than reject the schema outright.

---

## 5. Diversity Maxim — "More Namespaces, Better"

The user-belegte maxim from §2.1 has a second concrete consequence beyond the hard threshold: **more namespaces in a group widen the basis** against which `domainConformance` can be evaluated. A 7-namespace crypto Selection that draws from CoinGecko + Etherscan + Alchemy + Moralis + Solana RPC + Dune + Bitquery exposes provider quirks (e.g. CoinGecko's `solana` vs. Solana RPC's native chain identifier) to direct comparison; a 3-namespace Selection cannot do this comparison at all.

The grading consequence is **indirect** — there is no dimension named "namespace diversity" — but the maxim is reflected in:

- the hard threshold of 7 (§2),
- the high weight on Forbidden-Conventions violations (§4),
- the binding obligation to list Shared Lists in the Domain-Knowledge document (§3 sec. 2).

Groups that aspire to `aggregateGrade = A` SHOULD aim for ≥ 7 namespaces and a comprehensive Forbidden-Conventions section.

---

## 6. Storage Location

The Domain-Knowledge document is stored under one of two paths:

| Path | Use |
|------|-----|
| `flowmcp-schemas-private/domain-knowledge/<groupId>.md` | **Default.** Group conventions live alongside the private schemas they govern. |
| Grading-repo-internal storage | Alternative for groups whose documents are sensitive or whose schemas are not in `flowmcp-schemas-private`. The exact path is defined by the Grading-repo structure (see PRD-19 in Phase 6 — forward reference). |

A grading entry that uses a Domain-Knowledge document MUST record the document identifier in `selectionContext.domainDocId` (see [`08-grading-model.md`](./08-grading-model.md) §4). The identifier is the `groupId` plus a version suffix (e.g. `crypto-1.0.0`).

---

## 7. Grading Effect

| Dimension | Tier | Effect |
|-----------|------|--------|
| `domainConformance` | `group-bound` | Score reflects alignment with the group's Conventions and absence of Forbidden-Conventions violations. Without a Domain-Knowledge document, `domainConformance` cannot be scored above `stale`/`n/a`. |
| `personaUseCaseFit` | `group-bound` | Reads the Personas Reference and Use Cases sections of the Domain-Knowledge document as ground truth. |

**Binding rule.** Without a Domain-Knowledge document for a group, no `group-bound` grading entry can be produced, and `aggregateGrade = A` is consequently NOT attainable for the schemas in that Selection. This rule is the **structural enforcement** of the diversity maxim: groups have to invest in their Domain-Knowledge document to unlock the top grade.

---

## 8. Cross-References

- [`08-grading-model.md`](./08-grading-model.md) — the `domainConformance` dimension and the `selectionContext.domainDocId` field.
- [`09-security-and-development.md`](./09-security-and-development.md) §7 — Shared-List enforcement is referenced from the security chapter.
- [`12-personas-contract.md`](./12-personas-contract.md) — the Personas Reference section consumes the persona slugs and Lens definitions.
- [`13-skills.md`](./13-skills.md) — Selection-Skill validation reads the group's Domain-Knowledge document as context.
- PRD-19 (Phase 6, forthcoming) — the Grading-repo internal storage layout for Domain-Knowledge documents that are not in `flowmcp-schemas-private`.

---

Source: Memo 076 Kap 10, lines 394–431.
