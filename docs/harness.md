# Grading Harness

A grading run is executed by a **harness** — the runtime that turns a built
evaluator prompt into a validated grading. The harness must be specified for
every grading run, and every grading records which harness produced it
(`harness` field in the output envelope, see `prompts/output-schemas/_master.schema.json`).

## Supported harnesses

| harness | status | how the evaluation is performed |
|---------|--------|---------------------------------|
| `claude-code` | supported (only one currently) | see below |

No other harness is supported yet. A grading whose `harness` is not in this
table is invalid.

## `claude-code` — how the evaluation is performed

The non-deterministic evaluation is performed by spawning a **sub-agent as the
evaluator** through the Claude Code agent mechanism — i.e. an `Agent()` call
(the `Task`/sub-agent tool), **not** an external `claude --print` shell call.

Procedure (driven by the `*-start-grade` skill):

1. Build the evaluator prompt with `PromptBuilder.build(...)` — template +
   filtered questions (one area) + persona (or null) + output-schema reference.
2. **Spawn the evaluator sub-agent via `Agent()`**:
   - fresh, **empty context** (no conversation history),
   - **read-only** tools (the sub-agent reads the schema files it is told to read),
   - single evaluation pass,
   - the prompt instructs **strict-JSON only** (no prose, no markdown fences).
3. Parse the sub-agent's final message as JSON and **validate** it against the
   area output-schema (`prompts/output-schemas/<area>.schema.json`,
   resolving `_master.schema.json`). On a parse or schema failure, treat it as a
   `blocker`.
4. The orchestrator wraps the validated answers in the envelope and sets
   `harness: "claude-code"` (plus `gradingId`, `schemaHash`, `timestamp`, ...).

Deterministic questions are answered by code (the deterministic checks), not by
the sub-agent; the two answer sets are merged into the full area grading.

> Harness-agnostic note: conceptually the evaluator is "a single-turn,
> read-only, strict-JSON evaluator call". In the `claude-code` harness that
> concept is realized as an `Agent()` sub-agent. Earlier skill drafts described
> it as a `claude --print --output-format json` CLI call — that was the
> abstract/legacy form; the binding mechanism in this harness is `Agent()`.

---

## Persona-path rule

Sourced from `skills/*-start-grade/SKILL.md` (files scheduled for removal per
Memo 097 Kap. 9.0.1 — preserved here before deletion).

**Persona slug format:** `<basePersona>--<lens>`

The slug is validated by `FleetRunner` with the regex `^[a-z][a-z0-9-]*--[a-z][a-z0-9-]*$`
(`FleetRunner.mjs` — the double-hyphen separates the two components).

**File resolution:**

| Component | File path |
|-----------|-----------|
| Base persona | `repos/flowmcp-spec/personas/<basePersona>.md` |
| Lens helper | `grading-data/personas/<lens>-<YYYY>.md` |

`<YYYY>` in the lens filename is the year of the lens document (e.g. `2026`).

**Neutral areas** (persona not required) use `personaSlug = "neutral"` and skip
both file reads. The persona block in the prompt stays empty.

**Persona-required areas:** `about-namespace`, `about-selection`,
`selection-skills-L1`, `selection-skills-L2`, `selection-skills-L3`,
`namespace-skills`, `selection-aggregate` — all 7. Missing persona in a
required area raises `FLEET-001`.

**"lens" disambiguation:** In the grading slug, "lens" is a structural
sub-facette of the persona (e.g. domain expertise). This is distinct from the
"lens" concept in `flowmcp-spec/personas/persona-lens.md`, which is a 5-question
review checklist for documentation personas (Spec-Personas, Memo 048). Do not
confuse the two. See the Spec Glossary for the authoritative definitions.

---

## selection-aggregate: predecessor-grades rule

Sourced from `skills/selection-aggregate-start-grade/SKILL.md` (scheduled for
removal per Memo 097 Kap. 9.0.1 — preserved here before deletion).

The `selection-aggregate` area loads **predecessor grades** as evidence before
building its prompt. This is the only area that does so.

**What is read:**
- Per-skill area grades from the selection `index.json` (the aggregated skill
  scores within the selection).
- Member grades from each member's `_gradings/` folder inside the selection's
  `grading-data/selection/<sel>/` tree.

**Key invariant:** The `selection-aggregate` skill reads existing grades as
context — it does NOT re-grade individual members. Re-grading members is out of
scope for this area.

**Prompt injection:** The predecessor grades are passed to `PromptBuilder.build()`
via the `predecessorGrades` parameter and rendered into the
`{{PREDECESSOR_GRADES_BLOCK}}` placeholder in the template. This is the only area
that populates that block.

**Cross-ref:** `PromptBuilder.mjs` — `#buildPredecessorGradesBlock`,
`#normalizePredecessorGrades`; `prompts/templates/selection-aggregate.md`.
