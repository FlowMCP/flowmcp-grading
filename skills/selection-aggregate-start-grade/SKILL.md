---
name: selection-aggregate-start-grade
description: Starts a grading iteration for the selection-aggregate area — persona-based assessment of a selection as a whole. Loads the template, pre-instructions, filtered questions (area=selection-aggregate), the output schema, the persona (mandatory), and the predecessor grades (per-skill area grades + member grades). Calls PromptBuilder.build, spawns a fresh sub-agent (read-only, empty context, strict JSON), and validates the response against prompts/output-schemas/selection-aggregate.schema.json. Initializes the iteration counter and hands off to selection-aggregate-apply-improvement. The selection-aggregate area requires a persona (personaRequired: true).
allowed-tools: Read, Bash, Grep
model: inherit
---

## Input

Parameters (passed by the caller via tool call):

| Parameter | Required | Format | Example |
|-----------|----------|--------|---------|
| `selectionPath` | yes | Absolute path to the selection (about page + selection lock + manifest) | `/.../grading-data/selection/crypto-mini/` |
| `personaSlug` | **yes** (selection-aggregate requires a persona) | `<basePersona>--<lens>` | `decision-maker--crypto-trader` |
| `iteration` | no (default 1) | Integer 1..N | `1` |
| `previousGradingPath` | only from iteration 2 onward | Absolute path | `/.../grading-data/selection/.../_gradings/abc--ts--decision-maker--crypto-trader.json` |

**Persona application:** `personaRequired: true` — the selection-aggregate area MUST run with a persona.

## Procedure

1. **Validate inputs** — `selectionPath` exists. `personaSlug` is set. On error: `{ "blocker": "personaSlug", "reason": "missing — personaRequired: true" }`.
2. **Load template** — read `prompts/templates/selection-aggregate.md`.
3. **Load pre-instructions** — read `prompts/pre-instructions/selection-aggregate.md` (files-to-read = member-resolution manifest + the selection's about-page file + domain-knowledge + persona).
4. **Load output schema** — read `prompts/output-schemas/selection-aggregate.schema.json`.
5. **Filter questions** — read `prompts/generated/questions.json`, filter `area == "selection-aggregate"`.
6. **Load persona (mandatory)** — split `personaSlug` into `<basePersona>--<lens>`. Read the base persona from `repos/flowmcp-spec/personas/<basePersona>.md`. Read the lens helper from `flowmcp-grading/grading-data/personas/<lens>-<YYYY>.md`.
7. **Load predecessor grades** — read the per-skill area grades and the member grades from the selection `index.json` / member `_gradings/` folders. These feed the aggregate as evidence; the aggregate does NOT re-grade an individual member.
8. **Load previous grading (optional)** — if `iteration > 1`: read `previousGradingPath`, extract `improvementHints[]`.
9. **Build prompt** — call `PromptBuilder.build({ template, preInstructions, outputSchema, questions, persona: { base, lens }, predecessorGrades, previousHints, selectionPath, iteration, area: "selection-aggregate" })`. The builder appends the Goal-Block + surfacing convention.
10. **Spawn sub-agent** — via Bash: `Agent()` (sub-agent evaluator; harness `claude-code` — fresh empty context, read-only, strict JSON validated against the output-schema. See `docs/harness.md`). Read-only tools. Fresh empty context.
11. **Validate response** — parse JSON. Validate against `selection-aggregate.schema.json`. On schema failure: `{ "blocker": "schema-validation", "reason": "<details>" }`.
12. **Surface result** — emit the surfacing lines into the transcript so the `/goal` evaluator (transcript-only, no tools) can confirm completion: `[GRADING] area=selection-aggregate schema-valid=✓ status=<status> written=✓`, `[GRADING] PROGRESS x/y`, `[GRADING] DONE`.
13. **Hand-off** — call `selection-aggregate-apply-improvement` with the JSON + `iteration` + `selectionPath` + `personaSlug`.

## Output

Strict JSON per `prompts/output-schemas/selection-aggregate.schema.json` with required fields:

- `area: "selection-aggregate"` (literal match)
- `iteration`: integer
- `persona`: `{ basePersonaId, lensId }` (mandatory)
- `answers[]`: six answers — one per carried dimension (thresholds, topic coherence, domainConformance, personaUseCaseFit, group-bound tier, cascade-stop). The threshold + cascade-stop answers are deterministic (categorical); the judgment answers are non-deterministic (numeric 1–5). A deterministic-only result is not a valid grading.
- `improvementHints[]`: hints for the next iteration

On blocker:

```json
{ "blocker": "<file-path-or-stage>", "reason": "<plain text>" }
```

## Recursive loop hand-off

After successful validation, hand off to `selection-aggregate-apply-improvement` with:

- `responseJson` — the validated JSON from step 11
- `iteration` — current iteration (default start = 1)
- `selectionPath` — unchanged
- `personaSlug` — unchanged (`<basePersona>--<lens>`)

`apply-improvement` decides whether a next iteration runs (`iteration < maxIterations`, default 3) or whether the final grading file is written.

## Recursive feedback loop (micro loop)

After the first evaluator call, the loop runs:

1. **Parse the JSON response** of the evaluator skill strictly against
   `prompts/output-schemas/selection-aggregate.schema.json`. On parse error OR
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
   - The question set, files-to-read, persona block, predecessor-grades
     block, and output schema stay **unchanged** — partial consistency: every
     call ALWAYS covers all questions of the area.
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

Each sub-agent call ALWAYS answers all questions of the area. Partial grading is
a subset of the **areas** at the call level, never a subset of the questions
within an area. The loop does not change this invariant — every iteration
re-answers all six carried-dimension questions of the area.

## Save

The final answer is persisted via `src/Grading.mjs#createEntry({...})`. Required fields for entries:

- `iteration` (integer, incremented per loop pass)
- `improvementHints` (string[], from the last evaluator answer)
- `persona` (string, `<basePersona>--<lens>`)

The filename follows the convention
`<schemaHash>--<timestamp>--<persona-slug>.json` — built via
`Grading.formatGradingFilename({ hash, ts, persona })`, NEVER by
string concatenation.

Storage location (gitignored), the selection-level `_gradings/` folder:
`grading-data/selection/<sel>/_gradings/...`

## Cross-refs

- Generator skill family (base structure)
- Evaluator skill (`selection-aggregate-evaluate`), orchestrated here
- Consumer skill (`selection-aggregate-apply-improvement`)
- `_gradings/*.json` entry schema (`iteration`, `improvementHints`, `persona`)
- Persona-slug filename convention (`Grading.formatGradingFilename`)
- Harness, Goal-Block, surfacing convention: the grading spec Area 25
- Token/time consumption is verified in a practical mini-test
