# 12 — Personas Contract

| Field | Value |
|-------|-------|
| Status | Normative |
| Version | `gradingSpec/1.0.0` |
| Depends on | [`00-overview.md`](./00-overview.md), [`08-grading-model.md`](./08-grading-model.md), [`10-domain-knowledge.md`](./10-domain-knowledge.md) |
| Related | Schemas-Spec sister-repo personas folder `repos/flowmcp-spec/personas/`, [`13-skills.md`](./13-skills.md) |

> Conformance language (MUST/SHOULD/MAY) follows BCP 14 [RFC2119]/[RFC8174] as defined in [`00-overview.md`](./00-overview.md). The binding source is the FlowMCP Schemas Specification v4.1.0.

---

## 1. Source of Truth

The Grading-Spec does NOT define personas of its own. It **references** the personas maintained in the sister repository `flowmcp-spec` at the path `repos/flowmcp-spec/personas/`. That folder is the **single source of truth** for persona identity, goals, scenarios, and success criteria.

At spec version `gradingSpec/1.0.0`, the personas folder contains **four generalised personas** plus a set of helper documents:

| Persona | Slug | Short description |
|---------|------|-------------------|
| AI Engineer | `ai-engineer` | A developer who integrates schemas into agent runtimes and cares about deterministic, machine-consumable contracts. |
| Decision Maker | `decision-maker` | A user who consumes the output of schemas to make a downstream decision (trade, route, escalation, purchase). |
| Hackathon Builder | `hackathon-builder` | A builder under time pressure who needs working primitives without deep documentation. |
| Schema Maintainer | `schema-maintainer` | A maintainer of one or several schemas who cares about test coverage, conventions, and grading feedback. |

Helper documents in the same folder are:

- `overview.md` — index of the personas.
- `entry-points.md` — how personas enter the system.
- `persona-lens.md` — the Lens concept (§4).
- `_template.md` — the persona template (§3).
- `diagramme-policy.md`, `tone-guide.md`, `vision.md` — style and tone references.

Implementers MUST read the personas in `repos/flowmcp-spec/personas/` before producing a `group-bound` grading entry. Any deviation from these four generalised personas requires a Lens (§4), not a new generalised persona.

---

## 2. Persona Reference Contract for Grading Entries

A grading entry's `selectionContext.personaIds[]` field (see [`08-grading-model.md`](./08-grading-model.md) §4) carries one or more persona references. The contract for each reference is defined by the following four fields. Implementers MAY model them as a single string (the slug) when the other three can be resolved by lookup against the personas folder + the relevant Domain-Knowledge document.

| Field | Type | Pflicht | Description |
|-------|------|---------|-------------|
| `personaId` | `string` | MUST | Slug as listed in §1 (`ai-engineer`, `decision-maker`, `hackathon-builder`, `schema-maintainer`). The slug MUST be one of the four — new generalised slugs require a spec version bump. |
| `goals` | `string[]` | MUST | The goals the persona pursues under the current Selection. Resolved either inline or via the Domain-Knowledge document's Personas Reference section (see [`10-domain-knowledge.md`](./10-domain-knowledge.md) §3 sec. 6). |
| `groupId` | `string` | MUST | The `groupId` of the Themengruppe to which this persona binding applies (see [`10-domain-knowledge.md`](./10-domain-knowledge.md) §2). |
| `lens` | `string` | SHOULD | The domain-specific Lens identifier (§4). When present, narrows the generalised persona to the group's domain. |

A grading entry that carries `determinism = non-deterministic` and does NOT supply at least one `personaId` is INVALID (see [`08-grading-model.md`](./08-grading-model.md) §13 and the JSON-Schema's `if/then` conditional). Error code `GRD-005` (see [`08-grading-model.md`](./08-grading-model.md) §13) is raised by the validator.

The four-field contract maps to the persona-template structure in `repos/flowmcp-spec/personas/_template.md`: **identity** (persona slug), **goal** (`goals[]`), **scenario** (the group / domain context provided by `groupId` + Domain-Knowledge document), **success criteria** (resolvable from the persona file + the Domain-Knowledge document's Use Cases section).

---

## 3. Persona Template (Derived)

The persona-template structure (`_template.md`) is the source for the four-field contract above. The four template fields and their mapping to the grading contract:

| Template field | Maps to | Source |
|----------------|---------|--------|
| Identity | `personaId` | `repos/flowmcp-spec/personas/<slug>.md` header |
| Goal | `goals[]` | Persona file + Domain-Knowledge document's Personas Reference |
| Scenario | (`groupId` + Lens) | Domain-Knowledge document; Lens narrows the scenario to the domain |
| Success criteria | (resolved by aggregator) | Domain-Knowledge document's Use Cases + Personas Reference |

The mapping is the binding interpretation of the template. Implementers MUST NOT introduce additional persona fields without a `gradingSystem` bump.

---

## 4. Lens Concept

The Lens concept — described in detail in `repos/flowmcp-spec/personas/persona-lens.md` — is the **hybrid generalisation model** of `gradingSpec/1.0.0`. Two design choices live behind it:

1. **Generalised personas as the base.** The four personas in §1 are deliberately abstract; they apply across every domain.
2. **Domain-specific Lenses as optional refinements.** A group's Domain-Knowledge document (see [`10-domain-knowledge.md`](./10-domain-knowledge.md) §3 sec. 6) MAY define one or more Lenses, each narrowing a generalised persona to a domain-specific shape.

A Lens is a **named refinement** identified by a slug (e.g. `crypto-trader`, `mobility-planner`). The Lens slug is carried in the optional `lens` field of the persona reference contract (§2).

### 4.1 Example — Crypto (`crypto-trader` Lens)

A crypto Selection's Domain-Knowledge document defines a Lens `crypto-trader` over the base persona `decision-maker`. The Lens narrows the abstract decision-maker into someone who decides to buy, sell, or hold a token based on price, liquidity, and on-chain signals. A grading entry that uses this Lens carries:

```json
{
    "personaId": "decision-maker",
    "groupId": "crypto",
    "lens": "crypto-trader",
    "goals": ["evaluate whether to enter or exit a position", "estimate liquidity risk"]
}
```

The Lens makes the persona's expectations concrete (price endpoints, slippage estimates) without inventing a fifth generalised persona.

### 4.2 Example — Mobility (`mobility-planner` Lens)

The Mobility group's Domain-Knowledge document defines a Lens `mobility-planner` over the **same** base persona `decision-maker`. The Lens narrows the abstract decision-maker into someone who decides between transport options based on time, cost, and reliability:

```json
{
    "personaId": "decision-maker",
    "groupId": "mobility",
    "lens": "mobility-planner",
    "goals": ["choose between train, bus, and car for a given route", "estimate delay risk"]
}
```

The two examples demonstrate the **re-use of the base persona** across domains. The Lens is what changes; the persona slug remains `decision-maker` in both cases.

---

## 5. Where Lenses are Defined

Lenses are defined in the **Domain-Knowledge document** of the relevant group, not in this spec and not in the personas folder of `flowmcp-spec`. The reasoning is:

- Lenses are domain-specific and change with domain knowledge — they belong with the rest of the group's conventions.
- The personas folder of `flowmcp-spec` is generalised and stable across domains.
- A new group can define its Lenses without coordinating a change in the Grading-Spec.

See [`10-domain-knowledge.md`](./10-domain-knowledge.md) §3 sec. 6 for the binding obligation that a Domain-Knowledge document carries a Personas Reference section that lists the Lenses applicable to the group.

---

## 6. Grading Effect

| Dimension | Determinism | Tier | Source |
|-----------|-------------|------|--------|
| `personaUseCaseFit` | non-deterministic | group-bound | Selection S4 |

**Binding rule.** At least one persona reference MUST be present in `selectionContext.personaIds[]` for every `group-bound` grading entry. A `group-bound` entry without a persona reference is INVALID and the validator raises error code `GRD-005` (see [`08-grading-model.md`](./08-grading-model.md) §13).

The Lens (when present) refines the persona but does NOT replace it. A grading entry MAY carry `lens` without a `groupId` only in degenerate cases (cross-group meta-evaluation); the JSON-Schema requires `groupId` together with the persona reference in the typical group-bound case.

---

## 7. Cross-References

- `repos/flowmcp-spec/personas/` — the single source of truth for the four generalised personas and the Lens concept.
- `repos/flowmcp-spec/personas/persona-lens.md` — detailed description of the Lens concept.
- [`08-grading-model.md`](./08-grading-model.md) §4, §13 — `selectionContext.personaIds[]` field and the Personas obligation rule.
- [`10-domain-knowledge.md`](./10-domain-knowledge.md) §3 sec. 6 — Lens definition lives in the Domain-Knowledge document.
- [`13-skills.md`](./13-skills.md) — Selection-Skills MUST carry persona focus on all three levels.

---

Source: Memo 076 Kap 13, lines 543–571.
