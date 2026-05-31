---
name: selection-aggregate-evaluate
description: Evaluator skill for the selection-aggregate area. Receives the prompt artifact produced by the generator skill selection-aggregate-start-grade and orchestrates a fresh LLM sub-agent in an empty context. Enforces strict-JSON output per prompts/output-schemas/selection-aggregate.schema.json. The selection-aggregate area requires a persona (personaRequired: true).
allowed-tools: Read, Grep, Glob
model: inherit
---

# selection-aggregate-evaluate

## Purpose

This skill is invoked by the generator skill `selection-aggregate-start-grade`. It receives the prompt artifact produced by `PromptBuilder.build(...)` via tool result and orchestrates a **fresh sub-agent** for the evaluation.

## Input

The caller (`selection-aggregate-start-grade`) passes a single string:

| Parameter | Required | Format | Source |
|-----------|----------|--------|--------|
| `promptArtifact` | yes | String (including the mandatory persona block + predecessor-grades block + Goal-Block) | `PromptBuilder.build(...)` |

Source of the mandatory-block logic: `prompts/pre-instructions/selection-aggregate.md`.

## Architectural role

- The generator skill `selection-aggregate-start-grade` knows the optimization goal and drives the loop.
- This evaluator skill must **NOT** feed the optimization goal into the sub-agent context.
- The sub-agent sees only:
  1. The files-to-read block from the prompt artifact (member-resolution manifest, About, domain-knowledge, persona)
  2. The eval questions for the `selection-aggregate` area
  3. The output schema `prompts/output-schemas/selection-aggregate.schema.json`
  4. The **persona block** (mandatory)
  5. The **predecessor-grades block** (per-skill area grades + member grades, as evidence only)

## Sub-agent configuration

- **Context:** EMPTY. No prior-session memory.
- **Tools:** ONLY `Read`, `Grep`, `Glob`. No `Write`, no `Bash`, no `Edit`.
- **Output:** Strict JSON per `prompts/output-schemas/selection-aggregate.schema.json`.
- **Persona application:** `personaRequired: true`. Persona-slug format `<basePersona>--<lens>`. Source: base persona plus lens helper.

## Procedure

1. **Receive** — the generator hands over the prompt artifact (string, including the persona + predecessor-grades blocks).
2. **Pre-check files-to-read** — on error return **ONLY**:

   ```json
   { "blocker": "<path>", "reason": "<reason>" }
   ```

   and abort.
3. **Start sub-agent** — fresh sub-agent with empty context.
4. **Read files** — in **strict order** (member-resolution manifest, About, domain-knowledge, persona, lens helper).
5. **Answer questions** — answer the six carried-dimension questions for the `selection-aggregate` area from the persona's point of view. The threshold + cascade-stop answers are deterministic (categorical) and merged with the non-deterministic judgment answers; a deterministic-only result is NOT a valid grading.
6. **HTTP status evaluation** — where relevant: 4xx is **NEVER** PASS.
7. **Validate strict JSON** — on violation: `{ "blocker": "schema-validation", "reason": "<details>" }`.
8. **Return** — via tool result to `selection-aggregate-apply-improvement`.

## Output format

Strict JSON per `prompts/output-schemas/selection-aggregate.schema.json`. Required fields:

| Field | Type | Value / constraint |
|-------|------|--------------------|
| `gradingId` | string | `<schemaHash>--<ISO timestamp>` |
| `schemaHash` | string | 8-hex sha256 prefix |
| `area` | const | `"selection-aggregate"` |
| `iteration` | integer | 1..5 |
| `timestamp` | string | ISO-8601 |
| `persona` | object | `{ basePersonaId, lensId }` (mandatory) |
| `answers` | array | 6 entries (Q-selection-aggregate-01..06) |
| `improvementHints` | array | optional |

On blocker:

```json
{ "blocker": "<file-path-or-stage>", "reason": "<plain text>" }
```

## Safety assertions

1. The sub-agent does NOT know the optimization goal.
2. No silent defaults — missing fields are marked as `missing`.
3. HTTP 4xx = FAIL/DEFECT, never PASS.

## Wiring

- **Caller:** `selection-aggregate-start-grade`
- **Consumer:** `selection-aggregate-apply-improvement`
- **Spec reference:** the FlowMCP specification — selection-aggregate area, thresholds, domain knowledge / About distinction, personas contract, harness + Goal-Block, and folder layout.
