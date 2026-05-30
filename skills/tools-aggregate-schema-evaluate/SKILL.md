---
name: tools-aggregate-schema-evaluate
description: Evaluator skill for the tools-aggregate-schema area. Receives the prompt artifact produced by the generator skill tools-aggregate-schema-start-grade and orchestrates a fresh LLM sub-agent in an empty context. Enforces strict-JSON output per prompts/output-schemas/tools-aggregate-schema.schema.json. Per the grading spec, the tools-aggregate-schema area is NEUTRAL (personaRequired: false).
allowed-tools: Read, Grep, Glob
model: inherit
---

# tools-aggregate-schema-evaluate

## Purpose

This skill is invoked by the generator skill `tools-aggregate-schema-start-grade`. It receives the prompt artifact produced by `PromptBuilder.build(...)` via tool result and orchestrates a **fresh sub-agent** for the evaluation.

## Input

The caller (`tools-aggregate-schema-start-grade`) passes a single string:

| Parameter | Required | Format | Source |
|-----------|----------|--------|--------|
| `promptArtifact` | yes | String (Markdown + files-to-read block + questions + output schema) | `PromptBuilder.build(...)` |

The source of the mandatory-block logic is `prompts/pre-instructions/tools-aggregate-schema.md`.

## Architectural Role

- The generator skill `tools-aggregate-schema-start-grade` knows the optimization goal and drives the loop.
- This evaluator skill must **NOT** feed the optimization goal into the sub-agent context.
- The sub-agent sees only:
  1. The files-to-read block from the prompt artifact
  2. The eval questions of the `tools-aggregate-schema` area
  3. The output schema `prompts/output-schemas/tools-aggregate-schema.schema.json`
  4. The persona block (only if `personaRequired: true`; for `tools-aggregate-schema` it is EMPTY)

## Sub-Agent Configuration

- **Context:** EMPTY. No prior session memory, no global `CLAUDE.md`, no running optimization history.
- **Tools:** ONLY `Read`, `Grep`, `Glob` (see the `allowed-tools` frontmatter). No `Write`, no `Bash`, no `Edit`.
- **Output:** Strict JSON per `prompts/output-schemas/tools-aggregate-schema.schema.json`.
- **Persona handling:** `personaRequired: false`. The `tools-aggregate-schema` area is graded **neutrally**. The `persona` field in the output is `null`.

## Process

1. **Receive** — The generator passes the prompt artifact (string) via tool result.
2. **Pre-Check Files-to-Read** — Check that all listed paths exist and are readable. On error, send **ONLY**:

   ```json
   { "blocker": "<path>", "reason": "<reason>" }
   ```

   and abort.
3. **Start Sub-Agent** — Fresh sub-agent with empty context.
4. **Read Files** — The sub-agent reads the files-to-read in **strict order** (tool: `Read`).
5. **Answer Questions** — The sub-agent answers each eval question of the `tools-aggregate-schema` area along the output schema.
6. **HTTP Status Evaluation** — If the `evaluatorTask` interprets an HTTP status: 4xx is **NEVER** a PASS (memory `feedback_http_400_is_not_pass`). PASS = HTTP 200.
7. **Validate Strict JSON** — The answer is validated against the output schema. On violation: `{ "blocker": "schema-validation", "reason": "<details>" }`.
8. **Return** — Via tool result to `tools-aggregate-schema-apply-improvement`.

## Output Format

Strict JSON per `prompts/output-schemas/tools-aggregate-schema.schema.json`. Required fields:

| Field | Type | Value / Constraint |
|------|-----|--------------------|
| `gradingId` | string | `<schemaHash>--<ISO timestamp>` |
| `schemaHash` | string | 8-hex sha256 prefix |
| `area` | const | `"tools-aggregate-schema"` |
| `iteration` | integer | 1..5 |
| `timestamp` | string | ISO-8601 |
| `persona` | null | `null` (NEUTRAL) |
| `answers` | array | 6 entries (Q-tools-aggregate-schema-01..06) |
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

- **Caller:** `tools-aggregate-schema-start-grade`
- **Consumer:** `tools-aggregate-schema-apply-improvement` (recursive loop)
- **Spec reference:** FlowMCP Spec 1.1.0 §3, §19
