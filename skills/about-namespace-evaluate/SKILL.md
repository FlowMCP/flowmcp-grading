---
name: about-namespace-evaluate
description: Evaluator skill for the about-namespace area. Receives the prompt artifact produced by the generator skill about-namespace-start-grade and orchestrates a fresh LLM sub-agent in an empty context. Enforces strict-JSON output per prompts/output-schemas/about-namespace.schema.json. The about-namespace area requires a persona (personaRequired: true).
allowed-tools: Read, Grep, Glob
model: inherit
---

# about-namespace-evaluate

## Purpose

This skill is invoked by the generator skill `about-namespace-start-grade`. It receives the prompt artifact produced by `PromptBuilder.build(...)` via tool result and orchestrates a **fresh sub-agent** for the evaluation.

## Input

The caller (`about-namespace-start-grade`) passes a single string:

| Parameter | Required | Format | Source |
|-----------|----------|--------|--------|
| `promptArtifact` | yes | String (including the mandatory persona block) | `PromptBuilder.build(...)` |

Source of the mandatory-block logic: `prompts/pre-instructions/about-namespace.md`.

## Architectural role

- The generator skill `about-namespace-start-grade` knows the optimization goal and drives the loop.
- This evaluator skill must **NOT** feed the optimization goal into the sub-agent context.
- The sub-agent sees only:
  1. The files-to-read block from the prompt artifact
  2. The eval questions for the `about-namespace` area
  3. The output schema `prompts/output-schemas/about-namespace.schema.json`
  4. The **persona block** (mandatory)

## Sub-agent configuration

- **Context:** EMPTY. No prior-session memory, no global `CLAUDE.md`, no running optimization history.
- **Tools:** ONLY `Read`, `Grep`, `Glob`. No `Write`, no `Bash`, no `Edit`.
- **Output:** Strict JSON per `prompts/output-schemas/about-namespace.schema.json`.
- **Persona application:** `personaRequired: true`. Persona-slug format `<basePersona>--<lens>` (e.g. `decision-maker--crypto-trader`). Source: base persona from `repos/flowmcp-spec/personas/<basePersona>.md` plus the lens helper from `flowmcp-grading/grading-data/personas/<lens>-<YYYY>.md`.

## Procedure

1. **Receive** — the generator hands over the prompt artifact (string, including the persona block).
2. **Pre-check files-to-read** — on error return **ONLY**:

   ```json
   { "blocker": "<path>", "reason": "<reason>" }
   ```

   and abort. A missing persona file is also treated as a blocker.
3. **Start sub-agent** — fresh sub-agent with empty context.
4. **Read files** — in **strict order** (about-page file, persona, lens helper, domain knowledge).
5. **Answer questions** — answer the eval questions for the `about-namespace` area from the persona's point of view.
6. **HTTP status evaluation** — where relevant: 4xx is **NEVER** PASS.
7. **Validate strict JSON** — on violation: `{ "blocker": "schema-validation", "reason": "<details>" }`.
8. **Return** — via tool result to `about-namespace-apply-improvement`.

## Output format

Strict JSON per `prompts/output-schemas/about-namespace.schema.json`. Required fields:

| Field | Type | Value / constraint |
|-------|------|--------------------|
| `gradingId` | string | `<schemaHash>--<ISO timestamp>` |
| `schemaHash` | string | 8-hex sha256 prefix |
| `area` | const | `"about-namespace"` |
| `iteration` | integer | 1..5 |
| `timestamp` | string | ISO-8601 |
| `persona` | object | `{ basePersonaId, lensId }` (mandatory) |
| `answers` | array | 7 entries (Q-about-namespace-01..07) |
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

- **Caller:** `about-namespace-start-grade`
- **Consumer:** `about-namespace-apply-improvement`
- **Spec reference:** the FlowMCP specification — empty-context convention, about convention (persona reference required), personas contract (base personas), and folder layout.
