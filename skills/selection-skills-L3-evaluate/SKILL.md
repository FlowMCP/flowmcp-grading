---
name: selection-skills-L3-evaluate
description: Evaluator skill for the selection-skills-L3 area. Receives the prompt artifact produced by the generator skill selection-skills-L3-start-grade and orchestrates a fresh LLM sub-agent in an empty context. Enforces strict-JSON output per prompts/output-schemas/selection-skills-L3.schema.json. Per the grading spec, this area is graded WITH a persona (personaRequired: true, per the FlowMCP Spec §13 MUST).
allowed-tools: Read, Grep, Glob
model: inherit
---

# selection-skills-L3-evaluate

## Purpose

This skill is invoked by the generator skill `selection-skills-L3-start-grade`. It receives the prompt artifact produced by `PromptBuilder.build(...)` via tool result and orchestrates a **fresh sub-agent** for the evaluation.

## Input

The caller (`selection-skills-L3-start-grade`) passes a single string:

| Parameter | Required | Format | Source |
|-----------|----------|--------|--------|
| `promptArtifact` | yes | String (incl. persona block, mandatory) | `PromptBuilder.build(...)` |

The source of the mandatory-block logic is `prompts/pre-instructions/selection-skills-L3.md`.

## Architectural Role

- The generator skill `selection-skills-L3-start-grade` knows the optimization goal and drives the loop.
- This evaluator skill must **NOT** feed the optimization goal into the sub-agent context.
- The sub-agent sees only:
  1. The files-to-read block from the prompt artifact
  2. The eval questions of the `selection-skills-L3` area
  3. The output schema `prompts/output-schemas/selection-skills-L3.schema.json`
  4. The **persona block** (mandatory, per the FlowMCP Spec §13)

## Sub-Agent Configuration

- **Context:** EMPTY.
- **Tools:** ONLY `Read`, `Grep`, `Glob`. No `Write`, no `Bash`, no `Edit`.
- **Output:** Strict JSON per `prompts/output-schemas/selection-skills-L3.schema.json`.
- **Persona handling:** `personaRequired: true` (MUST per the FlowMCP Spec §13). Persona slug format `<basePersona>--<lens>`.

## Process

1. **Receive** — The generator passes the prompt artifact (string, incl. persona block).
2. **Pre-Check Files-to-Read** — On error, send **ONLY**:

   ```json
   { "blocker": "<path>", "reason": "<reason>" }
   ```

   and abort.
3. **Start Sub-Agent** — Fresh sub-agent with empty context.
4. **Read Files** — In **strict order** (L3 skill files, persona, lens helper).
5. **Answer Questions** — Eval questions of the `selection-skills-L3` area from the persona's perspective (L3 = expert skills).
6. **HTTP Status Evaluation** — If relevant: 4xx is **NEVER** a PASS (memory `feedback_http_400_is_not_pass`).
7. **Validate Strict JSON** — On violation: `{ "blocker": "schema-validation", "reason": "<details>" }`.
8. **Return** — Via tool result to `selection-skills-L3-apply-improvement`.

## Output Format

Strict JSON per `prompts/output-schemas/selection-skills-L3.schema.json`. Required fields:

| Field | Type | Value / Constraint |
|------|-----|--------------------|
| `gradingId` | string | `<schemaHash>--<ISO timestamp>` |
| `schemaHash` | string | 8-hex sha256 prefix |
| `area` | const | `"selection-skills-L3"` |
| `iteration` | integer | 1..5 |
| `timestamp` | string | ISO-8601 |
| `persona` | object | `{ basePersonaId, lensId }` (mandatory) |
| `answers` | array | 6 entries (Q-selection-skills-L3-01..06) |
| `improvementHints` | array | Optional |

On blocker:

```json
{ "blocker": "<file-path-or-stage>", "reason": "<plain-text>" }
```

## Safety Assertions

1. The sub-agent does NOT know the optimization goal.
2. No silent defaults — missing fields are marked as `missing`.
3. HTTP 4xx = FAIL/DEFECT, never PASS.

## Wiring

- **Caller:** `selection-skills-L3-start-grade`
- **Consumer:** `selection-skills-L3-apply-improvement`
- **Spec reference:**
  - FlowMCP Spec 1.1.0 §3 (Validity Rules)
  - FlowMCP Spec 1.1.0 §13 (Skills — Persona-Focus L1/L2/L3 MUST)
  - FlowMCP Spec 1.1.0 §19 (Folder layout)
