# 13 — Skills: Namespace-Skill vs. Selection-Skill

| Field | Value |
|-------|-------|
| Status | Normative |
| Version | `gradingSpec/1.0.0` |
| Depends on | [`00-overview.md`](./00-overview.md), [`08-grading-model.md`](./08-grading-model.md), [`11-about-convention.md`](./11-about-convention.md), [`12-personas-contract.md`](./12-personas-contract.md) |
| Related | Schemas-Spec v4.1.0 [`14-skills.md`](https://github.com/FlowMCP/flowmcp-spec/blob/main/spec/v4.1.0/14-skills.md), [`10-domain-knowledge.md`](./10-domain-knowledge.md) |

> Conformance language (MUST/SHOULD/MAY) follows BCP 14 [RFC2119]/[RFC8174] as defined in [`00-overview.md`](./00-overview.md). The binding source is the FlowMCP Schemas Specification v4.1.0.

---

## 1. Opening Clarification

The L1/L2/L3 hierarchy described in this chapter applies **ONLY to Selection-Skills**. Namespace-Skills are a separate, simpler category and do NOT have a hierarchy.

The two categories cover different scopes (a namespace versus a Selection of namespaces) and accordingly different tiers in the sense of [`06-determinism-and-tier.md`](./06-determinism-and-tier.md): Namespace-Skill validation is `autonomous` (no group context required); Selection-Skill validation is `group-bound` (a Domain-Knowledge document is required — see [`10-domain-knowledge.md`](./10-domain-knowledge.md)).

---

## 2. Existing v4.1 Anchor

The Schemas-Spec v4.1.0 already distinguishes the three skill scopes via the `type` field. The relevant definition is at **`repos/flowmcp-spec/spec/v4.1.0/14-skills.md` line 134**, which declares:

```text
| `type` | `string` | One of: `'namespace'`, `'selection'`, `'agent'` | … |
```

The skill types are therefore already semantically distinguished at the Schemas-Spec level. This Grading-Spec chapter makes the **validation consequences** of each type explicit. The optional Sub-Patch B of Memo 076 PRD-18 would add a Tier-Konsequenzen clarification to that v4.1 file directly; absent the patch, this chapter is the binding clarification.

The Schemas-Spec also caps the number of skills per Selection-/Agent-Registration-Scope at **4** via rule **`SKL018`** (see `14-skills.md` in the sister repo). This Grading-Spec does NOT change the cap.

---

## 3. Category 1 — Namespace-Skill

| Property | Value |
|----------|-------|
| Scope | Exactly one namespace, one-dimensional. |
| Tier | `autonomous` (validation does NOT require group context). |
| Hierarchy | None. L1/L2/L3 is **explicitly forbidden** for Namespace-Skills. |
| Persona requirement | OPTIONAL — Namespace-Skills MAY but do not have to focus on a single persona. |

### 3.1 Mandatory Content (MUST)

A Namespace-Skill MUST contain:

1. The **tools** of the namespace, listed with a one-sentence purpose each.
2. The **limitations** of the namespace, listed explicitly. Implementers MUST NOT omit limitations — under-stating limitations is the single most common skill anti-pattern.
3. A **reference to the namespace's About Resource** (see [`11-about-convention.md`](./11-about-convention.md) §3). When the namespace exposes `Namespace.Resource.About`, the Skill MUST link or embed the reference.

### 3.2 Validation Obligations

A grader validating a Namespace-Skill MUST check:

1. **Description neutrality.** The Skill's description avoids marketing language and does not over-promise.
2. **About reference presence.** The link to the About Resource is present and resolves to a Resource conformant to [`11-about-convention.md`](./11-about-convention.md) §4.
3. **Explicit limitations.** The limitations section exists and lists at least one limitation.

### 3.3 Grading Dimension

| Dimension | Determinism | Tier |
|-----------|-------------|------|
| `namespaceSkillValidity` | deterministic + non-deterministic | autonomous |

The deterministic sub-part scores About-reference presence and limitations existence. The non-deterministic sub-part scores description neutrality and the quality of the limitations text.

---

## 4. Category 2 — Selection-Skill (L1/L2/L3, Full Anspruch)

A Selection-Skill carries a three-level hierarchy. The hierarchy reflects depth of context, not difficulty: L1 is the broad entry point, L3 is the tool-level deep dive.

### 4.1 Levels

| Level | Focus | Mandatory Content |
|-------|-------|-------------------|
| **L1 — Einstieg** (single namespace within the Selection) | Skill levels overview, topics, domain particularities, persona focus | Which topics, which domain specifics, which personas the Skill targets; **limitations prominent**. |
| **L2 — Themenbereich** (2–4 selections within a wider group) | Namespaces listed, provider-side view, tools, About-Resource links, persona focus | Which namespaces are included, which tools per namespace, references to each namespace's About Resource. |
| **L3 — Tiefe** (5+ selections, persona-focused deep dive) | Tools focus, very detailed, persona focus | Which tools with which parameters for which use cases; the deepest expansion still bound to a persona focus. |

### 4.2 Binding Statements (MUST)

The following statements are binding for every Selection-Skill at every level:

1. **Persona focus is mandatory on ALL three levels.** A Selection-Skill at L1, L2, or L3 without a persona reference is INVALID.
2. **Limitations MUST be explicit on every level.** Limitations are the single most important skill aufgabe; a Selection-Skill MUST list them prominently. Hiding limitations behind an "ask for details" gesture is non-conformant.
3. **Anti-recursion (Anti-Rekursion).** An L3 Skill SHOULD call only L2 and L1 Skills, **never another L3 Skill**. Calling another L3 from L3 is forbidden by SHOULD; the rule prevents the runaway recursion that occurs when each level expands by referencing the next deepest level.

The Skill quality standards (character counts, mandatory section ordering, fixed templates) are intentionally NOT fixed at `gradingSpec/1.0.0` — room for experimentation is preserved (Memo 076 line 522).

### 4.3 Grading Dimensions

| Dimension | Determinism | Tier |
|-----------|-------------|------|
| `selectionSkillL1` | non-deterministic | group-bound |
| `selectionSkillL2` | non-deterministic | group-bound |
| `selectionSkillL3` | non-deterministic | group-bound |
| `skillLimitationsExplicit` (cross-cuts L1/L2/L3) | deterministic + non-deterministic | group-bound |
| `skillPersonaFocus` (cross-cuts L1/L2/L3) | non-deterministic | group-bound |

All five dimensions are `group-bound` — a Selection-Skill validation contributes to `aggregateGrade ≥ A` attainability (see [`06-determinism-and-tier.md`](./06-determinism-and-tier.md) §5 rule 4).

---

## 5. Relationship Between the Two Categories

The User-belegte statement (Memo 076 Kap 12.3) is:

> A Namespace-Skill is the **abgespeckte Variante** of a Selection-Skill.

A Selection-Skill validation can therefore be **conceptually** decomposed into several Namespace-Skill validations plus the group-level aspects (Domain-Knowledge alignment, persona focus, anti-recursion). The decomposition is a useful **implementation hint** for graders that want to reuse Namespace-Skill validation logic across Selection-Skill validation — it is NOT a mandatory implementation strategy.

The two categories share:

- The about-reference obligation (Namespace-Skill MUST reference the namespace's About Resource; Selection-Skill at L2 MUST reference its included namespaces' About Resources).
- The explicit-limitations obligation (Namespace-Skill at §3.1 sec. 2; Selection-Skill at §4.2 sec. 2).

The two categories differ on:

- The persona obligation (OPTIONAL for Namespace, MUST for Selection at every level).
- The hierarchy (none for Namespace, three-level for Selection).
- The tier (autonomous for Namespace, group-bound for Selection).

---

## 6. Relationship to the Schemas-Spec v4.1.0

The Schemas-Spec v4.1.0 [`14-skills.md`](https://github.com/FlowMCP/flowmcp-spec/blob/main/spec/v4.1.0/14-skills.md) line 134 declares the `type` field with values `'namespace'`, `'selection'`, `'agent'`. The Tier-Konsequenzen of these values — namely:

- `type: 'namespace'` → Skill validation runs `autonomous`,
- `type: 'selection'` → Skill validation runs `group-bound` (L1/L2/L3 hierarchy, persona focus, soft 5 / hard 7 thresholds from [`10-domain-knowledge.md`](./10-domain-knowledge.md)),
- `type: 'agent'` → unchanged at this spec version,

— are the binding interpretation of the `type` values for grading purposes. This chapter is the binding source for those Tier-Konsequenzen. Memo 076 PRD-18 Sub-Patch B (OPTIONAL) would add a short clarification of the same Tier-Konsequenzen directly in the v4.1 file; absent the patch, this Grading-Spec chapter is the binding location.

The Schemas-Spec rule `SKL018` (max 4 skills per Selection-/Agent-Registration-Scope) is preserved without modification.

---

## 7. Cross-References

- Schemas-Spec v4.1.0 [`14-skills.md`](https://github.com/FlowMCP/flowmcp-spec/blob/main/spec/v4.1.0/14-skills.md) — the `type` field and the `SKL018` limit.
- [`11-about-convention.md`](./11-about-convention.md) — the About-Resource obligation that Skills reference.
- [`12-personas-contract.md`](./12-personas-contract.md) — the persona contract that the persona focus draws from.
- [`10-domain-knowledge.md`](./10-domain-knowledge.md) — the soft 5 / hard 7 thresholds that determine whether a Selection-Skill is allowed at full Anspruch.
- [`08-grading-model.md`](./08-grading-model.md) — the dimensions `namespaceSkillValidity`, `selectionSkillL1`, `selectionSkillL2`, `selectionSkillL3` defined in §5.1.
- Memo 076 PRD-18 Sub-Patch B — the optional v4.1 patch that would mirror this clarification.

---

Source: Memo 076 Kap 12, lines 485–539.
