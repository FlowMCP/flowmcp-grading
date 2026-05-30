---
name: namespace-description-evaluate
description: Evaluator skill for the namespace-description area. Receives the prompt artifact produced by the generator skill namespace-description-start-grade and orchestrates a fresh LLM sub-agent in an empty context. Enforces strict-JSON output per prompts/output-schemas/namespace-description.schema.json. The namespace-description area is graded neutrally (personaRequired: false).
allowed-tools: Read, Grep, Glob
model: inherit
---

# namespace-description-evaluate

## Purpose

This skill is invoked by the generator skill `namespace-description-start-grade`. It receives the prompt artifact produced by `PromptBuilder.build(...)` via tool result and orchestrates a **fresh sub-agent** for the evaluation.

## Input

The caller (`namespace-description-start-grade`) passes a single string:

| Parameter | Required | Format | Source |
|-----------|----------|--------|--------|
| `promptArtifact` | yes | String | `PromptBuilder.build(...)` |

Source of the mandatory-block logic: `prompts/pre-instructions/namespace-description.md`.

## Architectural role

- The generator skill `namespace-description-start-grade` knows the optimization goal and drives the loop.
- This evaluator skill must **NOT** feed the optimization goal into the sub-agent context.
- The sub-agent sees only:
  1. The files-to-read block from the prompt artifact
  2. The eval questions for the `namespace-description` area
  3. The output schema `prompts/output-schemas/namespace-description.schema.json`
  4. The persona block (only when `personaRequired: true`; for `namespace-description` this is EMPTY)

## Sub-agent configuration

- **Context:** EMPTY. No prior-session memory, no global `CLAUDE.md`, no running optimization history.
- **Tools:** ONLY `Read`, `Grep`, `Glob` (see the `allowed-tools` frontmatter). No `Write`, no `Bash`, no `Edit`.
- **Output:** Strict JSON per `prompts/output-schemas/namespace-description.schema.json`.
- **Persona application:** `personaRequired: false`. The `namespace-description` area is graded **neutrally**. The `persona` field in the output is `null`.

## Procedure

1. **Receive** — the generator hands over the prompt artifact (string) via tool result.
2. **Pre-check files-to-read** — check that all listed paths exist. On error return **ONLY**:

   ```json
   { "blocker": "<path>", "reason": "<reason>" }
   ```

   and abort.
3. **Start sub-agent** — fresh sub-agent with empty context.
4. **Read files** — the sub-agent reads the files-to-read in **strict order**.
5. **Answer questions** — the sub-agent answers every eval question for the `namespace-description` area.
6. **HTTP status evaluation** — where relevant: 4xx is **NEVER** PASS.
7. **Validate strict JSON** — on violation: `{ "blocker": "schema-validation", "reason": "<details>" }`.
8. **Return** — via tool result to `namespace-description-apply-improvement`.

## Output format

Strict JSON per `prompts/output-schemas/namespace-description.schema.json`. Required fields:

| Field | Type | Value / constraint |
|-------|------|--------------------|
| `gradingId` | string | `<schemaHash>--<ISO timestamp>` |
| `schemaHash` | string | 8-hex sha256 prefix |
| `area` | const | `"namespace-description"` |
| `iteration` | integer | 1..5 |
| `timestamp` | string | ISO-8601 |
| `persona` | null | `null` (NEUTRAL) |
| `answers` | array | 4 entries (Q-namespace-description-01..04) |
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

- **Caller:** `namespace-description-start-grade`
- **Consumer:** `namespace-description-apply-improvement`
- **Spec reference:** the FlowMCP specification — validity rules and folder layout.
