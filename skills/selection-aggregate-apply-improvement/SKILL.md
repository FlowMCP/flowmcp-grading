---
name: selection-aggregate-apply-improvement
description: Consumes the JSON response from selection-aggregate-start-grade. Reads improvementHints[], decides whether to start a next iteration run (default maxIterations=3) or to write the final grading file to grading-data/selection/<sel>/_gradings/<hash>--<ts>--<basePersona>--<lens>.json (gitignored). On re-iteration it builds the re-invocation call to selection-aggregate-start-grade with iteration+1 and previousGradingPath. The decision matrix follows the grading spec. Persona application for the selection-aggregate area is mandatory (persona required).
allowed-tools: Read, Write, Bash
model: inherit
---

## Input

Parameters (handed off from the `selection-aggregate-start-grade` skill):

| Parameter | Required | Format | Example |
|-----------|----------|--------|---------|
| `responseJson` | yes | Strict JSON per `selection-aggregate.schema.json` | `{ area: "selection-aggregate", iteration: 1, answers: [...], improvementHints: [...] }` |
| `iteration` | yes | Integer 1..N | `1` |
| `selectionPath` | yes | Absolute path to the selection | `/.../grading-data/selection/crypto-mini/` |
| `personaSlug` | **yes (persona required)** | `<basePersona>--<lens>` | `decision-maker--crypto-trader` |
| `maxIterations` | no (default 3) | Integer 1..N | `3` |

## Procedure

1. **Validate input** — `responseJson` is valid. `iteration >= 1`. `selectionPath` exists. `personaSlug` matches the pattern `<basePersona>--<lens>`.
2. **Extract improvementHints** — `responseJson.improvementHints[]`. If empty: finalize.
3. **Decide next iteration** — see the decision matrix below.
4a. **If re-iterating:**
    - Optional: write intermediate state to `grading-data/_tmp/<hash>--iteration-<n>.json` (gitignored).
    - Re-invoke `selection-aggregate-start-grade` with `iteration + 1`, `previousGradingPath`, and `personaSlug` unchanged.
    - The skill ends.
4b. **If finalizing:**
    - Compute `<schemaHash>` (8-character sha256 truncate).
    - Compute `<ISO-ts>` (`2026-MM-DDTHH-MM-SSZ`).
    - Compute the target path: `grading-data/selection/<selectionId>/_gradings/<schemaHash>--<ISO-ts>--<personaSlug>.json`.
    - `mkdir -p` the target folder.
    - Write the final JSON via the `Write` tool.
    - Surface the end-state into the transcript so the `/goal` evaluator can confirm: `[GRADING] area=selection-aggregate schema-valid=✓ status=<status> written=✓` and `[GRADING] DONE`.
    - Output: `{ finalPath: "<absolute-path>", iteration: <n>, status: "done" }`.

## Recursive loop mechanics

**Decision matrix:**

| Condition | Action |
|-----------|--------|
| `iteration >= maxIterations` | Finalize |
| `improvementHints[]` is empty | Finalize |
| `responseJson.confidence == "high"` | Finalize |
| `responseJson.blocker` set | Finalize (with blocker status) |
| otherwise | Re-iterate with `iteration + 1` |

**Default `maxIterations = 3`** (recommended).

**Re-invocation:** Hand off to `selection-aggregate-start-grade` with:

```json
{
  "selectionPath": "<unchanged>",
  "personaSlug": "<basePersona>--<lens> (unchanged)",
  "iteration": "<iteration + 1>",
  "previousGradingPath": "<path or inline data>"
}
```

## Output

On re-iteration: no file.

On finalize:

```json
{ "finalPath": "<absolute-path>", "iteration": "<n>", "status": "done" }
```

## Folder guarantee

The write target is ALWAYS inside the gitignored `grading-data/` folder (see `.gitignore`). Never inside public-repo paths. The selection-aggregate gradings live in the selection-level `_gradings/` folder.

**Path template (persona-slug convention):**

```
grading-data/selection/<selectionId>/_gradings/<schemaHash>--<ISO-ts>--<personaSlug>.json
```

With `<personaSlug> = <basePersona>--<lens>` (selection-aggregate requires a persona).

**Example:**

```
grading-data/selection/crypto-mini/_gradings/f9e8d7c6--2026-05-30T16-02-44Z--decision-maker--crypto-trader.json
```

## Filename helper

Filename construction may only run through `Grading.formatGradingFilename({ hash, ts, persona })` from `src/Grading.mjs` — **no** string concatenation in the save step.

```javascript
import { Grading } from 'flowmcp-grading'

const { filename } = Grading.formatGradingFilename( {
    hash: schemaHash,
    ts: isoTs,
    persona: personaSlug          // '<basePersona>--<lens>' (selection-aggregate requires a persona)
} )
const targetPath = `grading-data/selection/${selectionId}/_gradings/${filename}`
```

Validation in the helper (GRD-040/041/042) catches malformed slugs, hashes, and timestamps. Full convention: `docs/grading-filename-convention.md`.
