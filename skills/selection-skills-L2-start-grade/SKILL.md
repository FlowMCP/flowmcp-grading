---
name: selection-skills-L2-start-grade
description: Starts a grading iteration for the selection-skills-L2 area — a persona-based evaluation of the L2 skills of a selection. Loads the L2 template, pre-instructions, filtered questions (area=selection-skills, tier=L2), the output schema, and the persona (mandatory). Calls PromptBuilder.build, spawns a fresh sub-agent (read-only, empty context, strict JSON), and validates the response against prompts/output-schemas/selection-skills-L2.schema.json. Initializes the iteration counter and hands off to selection-skills-L2-apply-improvement. Note — selection-skills are more complex, so a small practical test run verifies the token budget.
allowed-tools: Read, Bash, Grep
model: inherit
---

## Input

Parameters (passed by the caller via tool call):

| Parameter | Required | Format | Example |
|-----------|----------|--------|---------|
| `selectionPath` | yes | Absolute path to the selection (with selection lock + L2 skill file) | `/.../grading-data/selection/crypto-mini/` |
| `personaSlug` | **yes (mandatory)** | `<basePersona>--<lens>` | `decision-maker--crypto-trader` |
| `iteration` | no (default 1) | Integer 1..N | `1` |
| `previousGradingPath` | only from iteration 2 onward | Absolute path | `/.../grading-data/selection/.../gradings/abc--ts--decision-maker--crypto-trader.json` |

**Persona handling:** `personaRequired: true` — mandatory per the FlowMCP Spec §13.

## Process

1. **Validate Inputs** — `selectionPath` exists. `personaSlug` is set. On error: `{ "blocker": "personaSlug", "reason": "missing — personaRequired: true (FlowMCP Spec §13)" }`.
2. **Load Template** — Read `prompts/templates/selection-skills-L2.md`.
3. **Load Pre-Instructions** — Read `prompts/pre-instructions/selection-skills-L2.md` (files-to-read = selection lock + domain-knowledge doc + base persona).
4. **Load Output-Schema** — Read `prompts/output-schemas/selection-skills-L2.schema.json`.
5. **Filter Questions** — Read `prompts/generated/questions.json`, filter `area == "selection-skills" && tier == "L2"`.
6. **Load Persona (mandatory)** — Split `personaSlug` into `<basePersona>--<lens>`. Read the base persona from `repos/flowmcp-spec/personas/<basePersona>.md`. Read the lens helper from `flowmcp-grading/grading-data/personas/<lens>-<YYYY>.md`.
7. **Load previous Grading (optional)** — If `iteration > 1`: read `previousGradingPath`, extract `improvementHints[]`.
8. **Build Prompt** — Call `PromptBuilder.build({ template, preInstructions, outputSchema, questions, persona: { base, lens }, previousHints, selectionPath, iteration, tier: "L2" })`.
9. **Spawn Sub-Agent** — Via Bash: `claude --print --model inherit --max-turns 1 --output-format json --append-system-prompt "Sub-Agent: Strict-JSON only. No prose." -- <prompt>`. Read-only tools. Fresh, empty context.
10. **Validate Response** — Parse JSON. Validate against `selection-skills-L2.schema.json`. On schema failure: `{ "blocker": "schema-validation", "reason": "<details>" }`.
11. **Hand-off** — Call `selection-skills-L2-apply-improvement` with the JSON + `iteration` + `selectionPath` + `personaSlug`.

## Output

Strict JSON per `prompts/output-schemas/selection-skills-L2.schema.json` with required fields:

- `area: "selection-skills"` (literal match) + `tier: "L2"`
- `iteration`: Integer
- `personaSlug`: `<basePersona>--<lens>`
- `gradings[]`: Persona-specific L2 skill evaluations
- `improvementHints[]`: Hints for the next iteration

On blocker:

```json
{ "blocker": "<file-path-or-stage>", "reason": "<plain-text>" }
```

## Recursive-Loop Hand-off

After successful validation, hand off to `selection-skills-L2-apply-improvement` with:

- `responseJson` — the validated JSON from step 10
- `iteration` — current iteration (default start = 1)
- `selectionPath` — unchanged
- `personaSlug` — unchanged (`<basePersona>--<lens>`)

`apply-improvement` decides whether a next iteration runs (`iteration < maxIterations`, default 3) or whether the final grading file is written. Note: selection-skills are more complex — a small practical test run verifies the token/time cost.

## Recursive Feedback Loop (micro-loop)

After the first evaluator call, the loop runs:

1. **Parse JSON-Response** of the evaluator skill strictly against
   `prompts/output-schemas/selection-skills-L2.schema.json`. On parse error OR
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
`grading-data/selection/<sel>/gradings/...`

## Cross-Refs

- The generator-skill family (base structure)
- The evaluator skill (`selection-skills-L2-evaluate`), which is orchestrated here
- The `gradings/*.json` entry schema (`iteration`, `improvementHints`, `persona`)
- The persona-slug filename convention (`Grading.formatGradingFilename`)
- Token/time cost is verified in a small practical test run
