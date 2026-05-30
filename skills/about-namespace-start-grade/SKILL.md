---
name: about-namespace-start-grade
description: Starts a grading iteration for the about-namespace area — persona-based assessment of a namespace's about page. Loads the template, pre-instructions, filtered questions (area=about-namespace), the output schema, and the persona (mandatory). Calls PromptBuilder.build, spawns a fresh sub-agent (read-only, empty context, strict JSON), and validates the response against prompts/output-schemas/about-namespace.schema.json. Initializes the iteration counter and hands off to about-namespace-apply-improvement. The about-namespace area requires a persona (personaRequired: true); the FlowMCP specification requires a persona reference in the about content.
allowed-tools: Read, Bash, Grep
model: inherit
---

## Input

Parameters (passed by the caller via tool call):

| Parameter | Required | Format | Example |
|-----------|----------|--------|---------|
| `namespacePath` | yes | Absolute path to the namespace folder | `/.../schemas-private/v3/etherscan/` |
| `personaSlug` | **yes** (about-namespace requires a persona) | `<basePersona>--<lens>` | `decision-maker--crypto-trader` |
| `iteration` | no (default 1) | Integer 1..N | `1` |
| `previousGradingPath` | only from iteration 2 onward | Absolute path | `/.../grading-data/namespace/.../gradings/abc--ts--decision-maker--crypto-trader.json` |

**Persona application:** `personaRequired: true` — the about-namespace area MUST run with a persona.

## Procedure

1. **Validate inputs** — `namespacePath` exists. `personaSlug` is set (mandatory). On error: `{ "blocker": "personaSlug", "reason": "missing — personaRequired: true" }`.
2. **Load template** — read `prompts/templates/about-namespace.md`.
3. **Load pre-instructions** — read `prompts/pre-instructions/about-namespace.md` (files-to-read = about-page file + domain-knowledge doc).
4. **Load output schema** — read `prompts/output-schemas/about-namespace.schema.json`.
5. **Filter questions** — read `prompts/generated/questions.json`, filter `area == "about-namespace"`.
6. **Load persona (mandatory)** — split `personaSlug` into `<basePersona>--<lens>`. Read the base persona from `repos/flowmcp-spec/personas/<basePersona>.md`. Read the lens helper from `flowmcp-grading/grading-data/personas/<lens>-<YYYY>.md`.
7. **Load previous grading (optional)** — if `iteration > 1`: read `previousGradingPath`, extract `improvementHints[]`.
8. **Build prompt** — call `PromptBuilder.build({ template, preInstructions, outputSchema, questions, persona: { base, lens }, previousHints, namespacePath, iteration })`.
9. **Spawn sub-agent** — via Bash: `claude --print --model inherit --max-turns 1 --output-format json --append-system-prompt "Sub-Agent: Strict-JSON only. No prose." -- <prompt>`. Read-only tools. Fresh empty context.
10. **Validate response** — parse JSON. Validate against `about-namespace.schema.json`. On schema failure: `{ "blocker": "schema-validation", "reason": "<details>" }`.
11. **Hand-off** — call `about-namespace-apply-improvement` with the JSON + `iteration` + `namespacePath` + `personaSlug`.

## Output

Strict JSON per `prompts/output-schemas/about-namespace.schema.json` with required fields:

- `area: "about-namespace"` (literal match)
- `iteration`: integer
- `personaSlug`: `<basePersona>--<lens>`
- `gradings[]`: persona-specific question/answer pairs for the about page
- `improvementHints[]`: hints for the next iteration

On blocker:

```json
{ "blocker": "<file-path-or-stage>", "reason": "<plain text>" }
```

## Recursive loop hand-off

After successful validation, hand off to `about-namespace-apply-improvement` with:

- `responseJson` — the validated JSON from step 10
- `iteration` — current iteration (default start = 1)
- `namespacePath` — unchanged
- `personaSlug` — unchanged (`<basePersona>--<lens>`)

`apply-improvement` decides whether a next iteration runs (`iteration < maxIterations`, default 3) or whether the final grading file is written.

## Recursive feedback loop (micro loop)

After the first evaluator call, the loop runs:

1. **Parse the JSON response** of the evaluator skill strictly against
   `prompts/output-schemas/about-namespace.schema.json`. On parse error OR
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
- Evaluator skill (`about-namespace-evaluate`), orchestrated here
- `gradings/*.json` entry schema (`iteration`, `improvementHints`, `persona`)
- Persona-slug filename convention (`Grading.formatGradingFilename`)
- Token/time consumption is verified in a practical mini-test
