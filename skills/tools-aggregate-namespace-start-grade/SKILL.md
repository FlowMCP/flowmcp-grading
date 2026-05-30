---
name: tools-aggregate-namespace-start-grade
description: Starts a grading iteration for the tools-aggregate-namespace area — a neutral evaluation of a namespace's tool coverage against the domain expectation. Loads the template, pre-instructions, filtered questions (area=tools-aggregate-namespace), and the output schema. Calls PromptBuilder.build, spawns a fresh sub-agent (read-only, empty context, strict JSON), and validates the response against prompts/output-schemas/tools-aggregate-namespace.schema.json. Initializes the iteration counter and hands off to tools-aggregate-namespace-apply-improvement. Per the grading spec, the tools-aggregate-namespace area is graded neutrally (personaRequired: false).
allowed-tools: Read, Bash, Grep
model: inherit
---

## Input

Parameters (passed by the caller via tool call):

| Parameter | Required | Format | Example |
|-----------|----------|--------|---------|
| `namespacePath` | yes | Absolute path to the namespace folder | `/.../schemas-private/v3/etherscan/` |
| `personaSlug` | no (tools-aggregate-namespace is neutral) | `"neutral"` (literal) | `neutral` |
| `iteration` | no (default 1) | Integer 1..N | `1` |
| `previousGradingPath` | only from iteration 2 onward | Absolute path | `/.../grading-data/namespace/.../gradings/abc--ts--neutral.json` |

**Persona handling:** `personaRequired: false`. Coverage against the domain expectation is deterministically readable from the domain-knowledge doc.

## Process

1. **Validate Inputs** — `namespacePath` exists. On error: `{ "blocker": "namespacePath", "reason": "not found" }`.
2. **Load Template** — Read `prompts/templates/tools-aggregate-namespace.md`.
3. **Load Pre-Instructions** — Read `prompts/pre-instructions/tools-aggregate-namespace.md` (files-to-read = all schemas of the namespace + domain-knowledge doc).
4. **Load Output-Schema** — Read `prompts/output-schemas/tools-aggregate-namespace.schema.json`.
5. **Filter Questions** — Read `prompts/generated/questions.json`, filter `area == "tools-aggregate-namespace"`.
6. **Load Persona (optional)** — `personaRequired: false` — the persona block stays empty.
7. **Load previous Grading (optional)** — If `iteration > 1`: read `previousGradingPath`, extract `improvementHints[]`.
8. **Build Prompt** — Call `PromptBuilder.build({ template, preInstructions, outputSchema, questions, persona: null, previousHints, namespacePath, iteration })`.
9. **Spawn Sub-Agent** — Via `Agent()` (sub-agent evaluator; harness `claude-code` — fresh empty context, read-only, strict JSON validated against the output-schema. See `docs/harness.md`). Read-only tools. Fresh, empty context.
10. **Validate Response** — Parse JSON. Validate against `tools-aggregate-namespace.schema.json`. On schema failure: `{ "blocker": "schema-validation", "reason": "<details>" }`.
11. **Hand-off** — Call `tools-aggregate-namespace-apply-improvement` with the JSON + `iteration` + `namespacePath` + `personaSlug="neutral"`.

## Output

Strict JSON per `prompts/output-schemas/tools-aggregate-namespace.schema.json` with required fields:

- `area: "tools-aggregate-namespace"` (literal match)
- `iteration`: Integer
- `personaSlug: "neutral"`
- `gradings[]`: Question answers on the namespace's tool coverage
- `improvementHints[]`: Hints for the next iteration

On blocker:

```json
{ "blocker": "<file-path-or-stage>", "reason": "<plain-text>" }
```

## Recursive-Loop Hand-off

After successful validation, hand off to `tools-aggregate-namespace-apply-improvement` with:

- `responseJson` — the validated JSON from step 10
- `iteration` — current iteration (default start = 1)
- `namespacePath` — unchanged
- `personaSlug` — `"neutral"` (the tools-aggregate-namespace area is neutral)

`apply-improvement` decides whether a next iteration runs (`iteration < maxIterations`, default 3) or whether the final grading file is written.

## Recursive Feedback Loop (micro-loop)

After the first evaluator call, the loop runs:

1. **Parse JSON-Response** of the evaluator skill strictly against
   `prompts/output-schemas/tools-aggregate-namespace.schema.json`. On parse error OR
   a set `blocker` field: end the loop immediately, save the final
   answer, set `iteration` to the value of the last call.
2. **Termination check** (before each new iteration):
   - `improvementHints` empty? -> loop done.
   - `iteration >= N`? -> loop done.
   - otherwise: continue with step 3.
3. **Re-Invoke** `evaluate` with additional context:
   - The previous evaluator answer is inserted into a `## Previous Response`
     block in the prompt (full text, not summarized).
   - The `improvementHints[]` are prepended in an `## Improvement Hints`
     block with the explicit request to "address each hint and improve
     the answer accordingly".
   - The question set, files-to-read, persona block (if present), and
     output schema stay **unchanged** — partial consistency: every call
     ALWAYS answers all questions of the area/sub-area.
4. **Increment iteration** (`iteration += 1`), back to step 1.

### Iteration Default

`N = 3` (default). Rationale: 2-3 iterations are recommended. Real-world
cost (tokens/time) is verified in a small practical test run.
Override possible via the call parameter `maxIterations` (if set by the
caller, otherwise the default applies).

### Termination Conditions

| Condition | Action |
|-----------|--------|
| `improvementHints[]` empty | Save final answer, loop done |
| `iteration >= N` | Save current answer, loop done |
| `blocker` field set | Save blocker answer, loop done |
| Parse error | Save raw answer, loop done |

## Partial vs. Full

Per sub-agent call, ALL questions of an area are ALWAYS answered (or, for
the selection-skills area, all questions of one sub-area L1/L2/L3).
Partial grading is a subset of the **areas** at the call level, never a
subset of the questions within an area. The loop does not change this
invariant — every iteration re-answers all questions of the area.

## Save

The final answer is persisted via `src/Grading.mjs#createEntry({...})`. Required fields for grading entries:

- `iteration` (integer, 0-based on the first call, incremented per loop pass)
- `improvementHints` (string[], from the last evaluator answer)
- `persona` (string, `<basePersona>--<lens>` or `'neutral'`)

The filename follows the convention:
`<schemaHash>--<timestamp>--<persona-slug>.json` — built via
`Grading.formatGradingFilename({ hash, ts, persona })`, NEVER via
string concatenation.

Storage location (gitignored):
`grading-data/namespace/<ns>/gradings/...`

## Cross-Refs

- The generator-skill family (base structure)
- The evaluator skill (`tools-aggregate-namespace-evaluate`), which is orchestrated here
- The `gradings/*.json` entry schema (`iteration`, `improvementHints`, `persona`)
- The persona-slug filename convention (`Grading.formatGradingFilename`)
- Token/time cost is verified in a small practical test run
