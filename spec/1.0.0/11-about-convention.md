# 11 — About Convention on the Resource-Route Level

| Field | Value |
|-------|-------|
| Status | Normative |
| Version | `gradingSpec/1.0.0` |
| Depends on | [`00-overview.md`](./00-overview.md), [`08-grading-model.md`](./08-grading-model.md) |
| Related | Schemas-Spec v4.1.0 [`13-resources.md`](https://github.com/FlowMCP/flowmcp-spec/blob/main/spec/v4.1.0/13-resources.md), [`12-personas-contract.md`](./12-personas-contract.md), [`13-skills.md`](./13-skills.md) |

> Conformance language (MUST/SHOULD/MAY) follows BCP 14 [RFC2119]/[RFC8174] as defined in [`00-overview.md`](./00-overview.md). The binding source is the FlowMCP Schemas Specification v4.1.0.

---

## 1. Scope Statement

This chapter is **NOT a new primitive**, **NOT a schema break**, and **NOT a change to the Schemas-Spec v4.1.0 validation rules**. It is a **convention**: the reservation of a single route name and a content contract for what that route delivers when it exists.

The convention has three parts:

1. The **route name `about`** is reserved on the Namespace level (§3).
2. The **content contract** of an `about` Resource (§4) defines what MUST, SHOULD, and MAY be present when a namespace exposes the route.
3. The **Selection-level SHOULD** (§7) recommends that every Selection expose a `selection.about` resource of its own.

The convention takes effect only when a namespace exposes the route. A namespace that does NOT expose `about` is **not** in violation; it simply does not benefit from the score boost on `aboutConventionCompliance`.

---

## 2. Purpose

The convention exists because consumers — LLM graders, Skill authors, third-party tools, dashboards — repeatedly need a uniform way to ask: *"What does this namespace do, what doesn't it do, which conventions does it follow?"* When every namespace uses a different route name (`overview`, `info`, `meta`, `readme`), the consumer has to look up the name per namespace before any other interaction is possible. When the route name is **guessable**, the consumer can ask directly.

This is the **ratbarkeits-argument** from Memo 076 Kap 11 (line 442). The argument is the deep cause for the route-name reservation; the content contract (§4) is what makes the reserved name worth asking against.

---

## 3. Route-Name Reservation (Namespace Level)

The Resource route name `about` MUST be **reserved** by every namespace that follows `gradingSpec/1.0.0`. A namespace MAY expose a Resource at this route name; if it does, the Resource MUST conform to the content contract (§4). A namespace MUST NOT use the route name `about` for any Resource that is **not** an About Resource per this contract.

The reservation is the **only** binding rule at this level. It does NOT obligate a namespace to expose an About Resource; it forbids re-purposing the name.

**Examples.** Namespaces conformant to the reservation expose their About Resource at the conventional path:

- `Moralis.Resource.About`
- `Alchemy.Resource.About`
- `Etherscan.Resource.About`

A consumer that wants the Moralis About Resource asks for `Moralis.Resource.About` without needing to consult the Moralis schema first.

---

## 4. Content Contract

The content of an About Resource is governed by the following MUST / SHOULD / MAY contract.

| Element | Required | Description |
|---------|---------|-------------|
| Capability summary — *what the namespace can do* | MUST | A short tool inventory in human-readable form: which tools are exposed, what each tool does at a glance. |
| Limitations — *what the namespace cannot do* | MUST | Explicit limitations. The user MUST be able to learn from the About Resource what they should NOT expect. |
| Tools with their conventions | MUST | Which tools follow which conventions (Shared Lists, naming, casing). A pointer to the relevant Domain-Knowledge document is sufficient. |
| Personas reference | MUST | Pointer to the personas (see [`12-personas-contract.md`](./12-personas-contract.md)) for which the namespace is built. The pointer MAY be a Lens identifier. |
| Use cases / application areas | MUST | Concrete scenarios in which the namespace adds value, written so that a decision-maker can read them without prior context. |
| Version / freshness metadata | SHOULD | Last-updated timestamp, source pointers for the inventory (test outputs, manual curation notes). |
| Background and motivation | MAY | History of the namespace, provider relationship, sponsorship. |

A namespace About Resource that lacks any MUST element scores low on `aboutConventionCompliance` (non-deterministic sub-part); the deterministic sub-part of the dimension (the route-name match) still passes as long as the route exists.

---

## 5. Production Obligation (SHOULD)

The Single-Schema phase **P6** (see [`04-phases-single.md`](./04-phases-single.md)) is the natural production point for the namespace About Resource. After P6, a generator SHOULD produce an About Resource for the namespace. The generator synthesises content from three sources:

1. Test responses gathered in earlier phases (P4 / P5),
2. The tool descriptions and `whenToUse` strings of each tool in the namespace,
3. Manual curation by the namespace maintainer.

The SHOULD is deliberate. A namespace that has the inventory but chooses not to publish an About Resource is NOT in violation of the convention; it simply does not benefit from the score boost on `aboutConventionCompliance`. The generation step itself is a Phase 6 implementation concern (out of scope here).

---

## 6. Consumers

The About Resource is consumed by three classes of actor:

| Consumer | Use |
|----------|-----|
| Skills (see [`13-skills.md`](./13-skills.md)) | The Namespace-Skill MUST link the namespace's own About Resource. The Selection-Skill MAY reference multiple About Resources via `selection.resources[]` (Schemas-Spec v4.1.0 [`17-selections.md`](https://github.com/FlowMCP/flowmcp-spec/blob/main/spec/v4.1.0/17-selections.md)). |
| Graders | The Selection-Validator reads the About Resource as the source of truth for `personaUseCaseFit` reasoning. |
| Third parties | External tools (registry dashboards, agent runtimes, IDE plugins) can consume the About Resource as the *README of the namespace*. |

---

## 7. Selection Level (SHOULD)

Every Selection SHOULD expose its own `selection.about` Resource. The technical realisation uses `selection.resources[]` defined in the Schemas-Spec v4.1.0 [`17-selections.md`](https://github.com/FlowMCP/flowmcp-spec/blob/main/spec/v4.1.0/17-selections.md): the Selection's `resources[]` MAY reference either a dedicated `selection.about` resource or the About Resources of the contained namespaces.

**Score consequence.** Absence of a `selection.about` is **NOT** a Categorical Veto. It IS a score deduction on `aboutConventionCompliance` at the `group-bound` sub-part. A Selection without a Selection-level About Resource cannot reach the top of `aboutConventionCompliance` even when each contained namespace has its own About Resource.

### 7.1 Why SHOULD and Not MUST

A MUST at the Selection level would over-burden small Selections. A Selection composed of two tools and intended for ad-hoc use should not be forced to maintain its own About Resource — the cost outweighs the benefit. The MUST level is reserved for the namespace-level route-name reservation (§3), where the burden is minimal (one resource per namespace).

### 7.2 Why SHOULD and Not MAY

A MAY at the Selection level would surrender the ratbarkeits-argument from §2. A Selection's About Resource is precisely what an agent asks for when entering the Selection; if it MAY be present or absent without consequence, agents cannot rely on it. SHOULD preserves the ratbarkeit (consumers can ask blind) while still allowing for the small-Selection exception (no veto).

---

## 8. Grading Effect

| Dimension | Determinism | Tier | Source |
|-----------|-------------|------|--------|
| `aboutConventionCompliance` (route-name match) | deterministic | autonomous | Single-Schema P6 |
| `aboutConventionCompliance` (content quality) | non-deterministic | autonomous | Single-Schema P6 / Selection S2 |
| `personaUseCaseFit` (consumes About) | non-deterministic | group-bound | Selection S4 |

The deterministic sub-part of `aboutConventionCompliance` is binary: the route `about` exists (pass) or it does not (fail). The non-deterministic sub-part scores the content of the resource against the contract (§4). The mixed-form handling rule from [`06-determinism-and-tier.md`](./06-determinism-and-tier.md) §2.3 applies.

---

## 9. Relationship to the Schemas-Spec v4.1.0

The Schemas-Spec v4.1.0 — particularly [`13-resources.md`](https://github.com/FlowMCP/flowmcp-spec/blob/main/spec/v4.1.0/13-resources.md) — does NOT enforce the `about` route-name reservation as a validation rule. The reservation is **forward-looking convention**, applied by graders that conform to `gradingSpec/1.0.0`. A small additive sub-paragraph in `13-resources.md` (delivered by Memo 076 PRD-18 Sub-Patch A) points consumers at this Grading-Spec for the binding content contract.

The two documents are mutually consistent:

- v4.1 `13-resources.md` reserves the route name and points here.
- This chapter binds the content contract and the production obligation.

A schema-validator at v4.1 MUST NOT reject a schema for failing the About convention; the convention's enforcement lives entirely in the grader.

---

## 10. Cross-References

- Schemas-Spec v4.1.0 [`13-resources.md`](https://github.com/FlowMCP/flowmcp-spec/blob/main/spec/v4.1.0/13-resources.md) — the external Resource primitive against which the convention is defined.
- Schemas-Spec v4.1.0 [`17-selections.md`](https://github.com/FlowMCP/flowmcp-spec/blob/main/spec/v4.1.0/17-selections.md) — `selection.resources[]` field that carries Selection-level About Resources.
- [`12-personas-contract.md`](./12-personas-contract.md) — the Personas reference required by §4.
- [`13-skills.md`](./13-skills.md) — Skill obligation to link the About Resource.
- Memo 076 PRD-18 Sub-Patch A — the additive note in v4.1 `13-resources.md`.

---

Source: Memo 076 Kap 11, lines 433–482.
