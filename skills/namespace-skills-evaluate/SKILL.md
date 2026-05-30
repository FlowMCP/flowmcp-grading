---
name: namespace-skills-evaluate
description: Evaluator skill for the namespace-skills area. Receives the prompt artifact produced by the generator skill namespace-skills-start-grade and orchestrates a fresh LLM sub-agent in an empty context. Enforces strict-JSON output per prompts/output-schemas/namespace-skills.schema.json. The namespace-skills area uses a persona (personaRequired: true) as the recommended default.
allowed-tools: Read, Grep, Glob
model: inherit
---

# namespace-skills-evaluate

## Purpose

This skill is invoked by the generator skill `namespace-skills-start-grade`. It receives the prompt artifact produced by `PromptBuilder.build(...)` via tool result and orchestrates a **fresh sub-agent** for the evaluation.

## Input

The caller (`namespace-skills-start-grade`) passes a single string:

| Parameter | Required | Format | Source |
|-----------|----------|--------|--------|
| `promptArtifact` | yes | String (including the persona block, recommended default) | `PromptBuilder.build(...)` |

Source of the mandatory-block logic: `prompts/pre-instructions/namespace-skills.md`.

## Architectural role

- The generator skill `namespace-skills-start-grade` knows the optimization goal and drives the loop.
- This evaluator skill must **NOT** feed the optimization goal into the sub-agent context.
- The sub-agent sees only:
  1. The files-to-read block from the prompt artifact
  2. The eval questions for the `namespace-skills` area
  3. The output schema `prompts/output-schemas/namespace-skills.schema.json`
  4. The **persona block** (mandatory, recommended default)

## Sub-agent configuration

- **Context:** EMPTY.
- **Tools:** ONLY `Read`, `Grep`, `Glob`. No `Write`, no `Bash`, no `Edit`.
- **Output:** Strict JSON per `prompts/output-schemas/namespace-skills.schema.json`.
- **Persona application:** `personaRequired: true` (recommended default). Persona-slug format `<basePersona>--<lens>`.

## Procedure

1. **Receive** — the generator hands over the prompt artifact (string, including the persona block).
2. **Pre-check files-to-read** — on error return **ONLY**:

   ```json
   { "blocker": "<path>", "reason": "<reason>" }
   ```

   and abort.
3. **Start sub-agent** — fresh sub-agent with empty context.
4. **Read files** — in **strict order** (namespace skills index, individual skill files, persona, lens helper).
5. **Answer questions** — answer the eval questions for the `namespace-skills` area from the persona's point of view.
6. **HTTP status evaluation** — where relevant: 4xx is **NEVER** PASS.
7. **Validate strict JSON** — on violation: `{ "blocker": "schema-validation", "reason": "<details>" }`.
8. **Return** — via tool result to `namespace-skills-apply-improvement`.

## Output format

Strict JSON per `prompts/output-schemas/namespace-skills.schema.json`. Required fields:

| Field | Type | Value / constraint |
|-------|------|--------------------|
| `gradingId` | string | `<schemaHash>--<ISO timestamp>` |
| `schemaHash` | string | 8-hex sha256 prefix |
| `area` | const | `"namespace-skills"` |
| `iteration` | integer | 1..5 |
| `timestamp` | string | ISO-8601 |
| `persona` | object | `{ basePersonaId, lensId }` (mandatory — recommended default) |
| `answers` | array | 6 entries (Q-namespace-skills-01..06) |
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

- **Caller:** `namespace-skills-start-grade`
- **Consumer:** `namespace-skills-apply-improvement`
- **Spec reference:** the FlowMCP specification — validity rules, skills (persona recommended default), and folder layout.
