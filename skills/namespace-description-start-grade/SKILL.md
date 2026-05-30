---
name: namespace-description-start-grade
description: Starts a grading iteration for the namespace-description area — neutral assessment of how clearly the namespace identity is expressed. Loads the template, pre-instructions, filtered questions (area=namespace-description), and the output schema. Calls PromptBuilder.build, spawns a fresh sub-agent (read-only, empty context, strict JSON), and validates the response against prompts/output-schemas/namespace-description.schema.json. Initializes the iteration counter and hands off to namespace-description-apply-improvement. The namespace-description area is graded neutrally (personaRequired: false).
allowed-tools: Read, Bash, Grep
model: inherit
---

## Input

Parameters (passed by the caller via tool call):

| Parameter | Required | Format | Example |
|-----------|----------|--------|---------|
| `namespacePath` | yes | Absolute path to the namespace (semantically the namespace folder) | `/.../schemas-private/v3/etherscan/` |
| `personaSlug` | no (the namespace-description area is neutral) | `"neutral"` (literal) | `neutral` |
| `iteration` | no (default 1) | Integer 1..N | `1` |
| `previousGradingPath` | only from iteration 2 onward | Absolute path | `/.../grading-data/namespace/.../gradings/abc--ts--neutral.json` |

**Persona application:** `personaRequired: false`. The clarity of the namespace identity is judged objectively.

## Procedure

1. **Validate inputs** — `namespacePath` exists. On error: `{ "blocker": "namespacePath", "reason": "not found" }`.
2. **Load template** — read `prompts/templates/namespace-description.md`.
3. **Load pre-instructions** — read `prompts/pre-instructions/namespace-description.md` (files-to-read = namespace metadata + domain-knowledge doc).
4. **Load output schema** — read `prompts/output-schemas/namespace-description.schema.json`.
5. **Filter questions** — read `prompts/generated/questions.json`, filter `area == "namespace-description"`.
6. **Load persona (optional)** — `personaRequired: false` — the persona block stays empty.
7. **Load previous grading (optional)** — if `iteration > 1`: read `previousGradingPath`, extract `improvementHints[]`.
8. **Build prompt** — call `PromptBuilder.build({ template, preInstructions, outputSchema, questions, persona: null, previousHints, namespacePath, iteration })`.
9. **Spawn sub-agent** — via Bash: `claude --print --model inherit --max-turns 1 --output-format json --append-system-prompt "Sub-Agent: Strict-JSON only. No prose." -- <prompt>`. Read-only tools. Fresh empty context.
10. **Validate response** — parse JSON. Validate against `namespace-description.schema.json`. On schema failure: `{ "blocker": "schema-validation", "reason": "<details>" }`.
11. **Hand-off** — call `namespace-description-apply-improvement` with the JSON + `iteration` + `namespacePath` + `personaSlug="neutral"`.

## Output

Strict JSON per `prompts/output-schemas/namespace-description.schema.json` with required fields:

- `area: "namespace-description"` (literal match)
- `iteration`: integer
- `personaSlug: "neutral"`
- `gradings[]`: question/answer pairs about the namespace clarity
- `improvementHints[]`: hints for the next iteration

On blocker:

```json
{ "blocker": "<file-path-or-stage>", "reason": "<plain text>" }
```

## Recursive loop hand-off

After successful validation, hand off to `namespace-description-apply-improvement` with:

- `responseJson` — the validated JSON from step 10
- `iteration` — current iteration (default start = 1)
- `namespacePath` — unchanged
- `personaSlug` — `"neutral"` (the namespace-description area is neutral)

`apply-improvement` decides whether a next iteration runs (`iteration < maxIterations`, default 3) or whether the final grading file is written.

## Recursive feedback loop (micro loop)

After the first evaluator call, the loop runs:

1. **Parse the JSON response** of the evaluator skill strictly against
   `prompts/output-schemas/namespace-description.schema.json`. On parse error OR
   a set `blocker` field: end the loop immediately, save the final answer,
   set `iteration` to the value of the last call.
2. **Stop check** (before each new iteration):
   - `improvementHints` empty? -> loop done.
   - `iteration >= N`? -> loop done.
   - otherwise: continue with step 3.
3. **Re-invoke** `evaluate` with additional context:
   - The previous evaluator answer is inserted into the prompt in a
     `## Previous Response` block (full text, not summarized).
   - The `improvementHints[]` are prepended in an `## Improvement Hints`
     block with the explicit instruction to "address every hint and
     improve the answer accordingly".
   - The question set, files-to-read, persona block (if present), and
     output schema stay **unchanged** — partial consistency: every call
     ALWAYS covers all questions of the area/sub-area.
4. **Increment iteration** (`iteration += 1`), back to step 1.

### Iteration default

`N = 3` (default). Rationale: recommended 2–3 runs. Real-world cost
(token/time) is verified in a practical mini-test. Override possible via
the call parameter `maxIterations` (if set by the caller, otherwise the
default applies).

### Stop conditions

| Condition | Action |
|-----------|--------|
| `improvementHints[]` empty | Save final answer, loop done |
| `iteration >= N` | Save current answer, loop done |
| `blocker` field set | Save blocker answer, loop done |
| Parse error | Save raw answer, loop done |

## Partial vs. full

Each sub-agent call ALWAYS answers all questions of an area (or, for the
skills area, all questions of one sub-area L1/L2/L3). Partial grading is a
subset of the **areas** at the call level, never a subset of the questions
within an area. The loop does not change this invariant — every iteration
re-answers all questions of the area.

## Save

The final answer is persisted via `src/Grading.mjs#createEntry({...})`. Required fields for entries:

- `iteration` (integer, 0-based on the first call, incremented per loop pass)
- `improvementHints` (string[], from the last evaluator answer)
- `persona` (string, `<basePersona>--<lens>` or `'neutral'`)

The filename follows the convention
`<schemaHash>--<timestamp>--<persona-slug>.json` — built via
`Grading.formatGradingFilename({ hash, ts, persona })`, NEVER by
string concatenation.

Storage location (gitignored):
`grading-data/namespace/<ns>/gradings/...`

## Cross-refs

- Generator skill family (base structure)
- Evaluator skill (`namespace-description-evaluate`), orchestrated here
- `gradings/*.json` entry schema (`iteration`, `improvementHints`, `persona`)
- Persona-slug filename convention (`Grading.formatGradingFilename`)
- Token/time consumption is verified in a practical mini-test
