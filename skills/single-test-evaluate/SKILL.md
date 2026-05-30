---
name: single-test-evaluate
description: Evaluator skill for the single-test area. Receives the prompt artifact produced by the generator skill single-test-start-grade and orchestrates a fresh LLM sub-agent in an empty context. Enforces strict-JSON output per prompts/output-schemas/single-test.schema.json. Per the grading spec, the single-test area is NEUTRAL (personaRequired: false).
allowed-tools: Read, Grep, Glob
model: inherit
---

# single-test-evaluate

## Purpose

This skill is invoked by the generator skill `single-test-start-grade`. It receives the prompt artifact produced by `PromptBuilder.build(...)` via tool result and orchestrates a **fresh sub-agent** for the evaluation.

## Input

The caller (`single-test-start-grade`) passes a single string:

| Parameter | Required | Format | Source |
|-----------|----------|--------|--------|
| `promptArtifact` | yes | String (Markdown + files-to-read block + questions + output schema) | `PromptBuilder.build(...)` |

The filesystem path to the prompt artifact is optional — contents are usually passed inline via tool result (an architectural requirement: the evaluator must not be coupled to a filesystem path).

The source of the mandatory-block logic is `prompts/pre-instructions/single-test.md`.

## Architectural Role

- The generator skill `single-test-start-grade` knows the optimization goal and drives the loop.
- This evaluator skill must **NOT** feed the optimization goal into the sub-agent context.
- The sub-agent sees only:
  1. The files-to-read block from the prompt artifact
  2. The eval questions of the `single-test` area
  3. The output schema `prompts/output-schemas/single-test.schema.json`
  4. The persona block (only if `personaRequired: true`; for `single-test` it is EMPTY)

## Sub-Agent Configuration

- **Context:** EMPTY. No prior session memory, no global `CLAUDE.md`, no running optimization history. Enforced by convention via the pre-instruction.
- **Tools:** ONLY `Read`, `Grep`, `Glob` (see the `allowed-tools` frontmatter). No `Write`, no `Bash`, no `Edit`.
- **Output:** Strict JSON per `prompts/output-schemas/single-test.schema.json`.
- **Persona handling:** `personaRequired: false`. The `single-test` area is graded **neutrally**. The `persona` field in the output is `null`.

## Process

1. **Receive** — The generator passes the prompt artifact (string) via tool result.
2. **Pre-Check Files-to-Read** — Check that all paths listed in the files-to-read block exist and are readable. If a path does not exist or is not readable, send **ONLY**:

   ```json
   { "blocker": "<path>", "reason": "<reason>" }
   ```

   and abort. No partial answers, no fallback defaults.
3. **Start Sub-Agent** — Fresh sub-agent with empty context (by convention via the pre-instruction preamble, not a technical reset).
4. **Read Files** — The sub-agent reads the files-to-read in **strict order** (tool: `Read`).
5. **Answer Questions** — The sub-agent answers each eval question of the `single-test` area along the output schema. Per question: `questionId`, `score` (numeric 1.0–5.0 or `pass`/`fail`/`stale`/`n/a`), `reasoning`, optional `evidence`, and the mandatory `naReason` field when the score is `n/a`.
6. **HTTP Status Evaluation** — If the `evaluatorTask` interprets an HTTP status: 4xx is **NEVER** a PASS (memory `feedback_http_400_is_not_pass`). PASS = HTTP 200; anything else is `fail` or numeric <= 2.0.
7. **Validate Strict JSON** — The answer is validated against the output schema. On schema violation: `{ "blocker": "schema-validation", "reason": "<details>" }`.
8. **Return** — The answer is returned via tool result to the consumer skill (`single-test-apply-improvement`).

## Output Format

Strict JSON per `prompts/output-schemas/single-test.schema.json`. Required fields:

| Field | Type | Value / Constraint |
|------|-----|--------------------|
| `gradingId` | string | `<schemaHash>--<ISO timestamp>` |
| `schemaHash` | string | 8-hex sha256 prefix |
| `area` | const | `"single-test"` |
| `iteration` | integer | 1..5 |
| `timestamp` | string | ISO-8601 |
| `persona` | null | `null` (NEUTRAL) |
| `answers` | array | 10 entries (Q-single-test-01..10) |
| `improvementHints` | array | Optional, for the recursive loop |

On blocker:

```json
{ "blocker": "<file-path-or-stage>", "reason": "<plain-text>" }
```

## Safety Assertions

1. The sub-agent does NOT know the optimization goal.
2. No silent defaults — missing fields are marked as `missing`.
3. HTTP 4xx = FAIL/DEFECT, never PASS.

## Wiring

- **Caller:** `single-test-start-grade`
- **Consumer:** `single-test-apply-improvement` (recursive loop)
- **Spec reference:**
  - FlowMCP Spec 1.1.0 §3 (Validity Rules — empty-context convention)
  - FlowMCP Spec 1.1.0 §19 (Folder layout, output path gitignored under `grading-data/`)
