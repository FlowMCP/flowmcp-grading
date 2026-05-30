---
name: selection-skills-L1-apply-improvement
description: Consumes the JSON response from selection-skills-L1-start-grade. Reads improvementHints[], decides whether to start a next iteration run (default maxIterations=3) or to write the final grading file to grading-data/selection/<sel>/gradings/<hash>--<ts>--<basePersona>--<lens>--L1.json (gitignored). On re-iteration it builds the re-invocation call to selection-skills-L1-start-grade with iteration+1 and previousGradingPath. The decision matrix follows the grading spec. Persona application for the selection-skills L1 sub-area is mandatory (persona required). Note — selection skills are more complex, so a practical mini-test verifies the token budget.
allowed-tools: Read, Write, Bash
model: inherit
---

## Input

Parameters (handed off from the `selection-skills-L1-start-grade` skill):

| Parameter | Required | Format | Example |
|-----------|----------|--------|---------|
| `responseJson` | yes | Strict JSON per `selection-skills-L1.schema.json` | `{ area: "selection-skills", tier: "L1", iteration: 1, gradings: [...], improvementHints: [...] }` |
| `iteration` | yes | Integer 1..N | `1` |
| `selectionPath` | yes | Absolute path to the selection | `/.../grading-data/selection/crypto-mini/` |
| `personaSlug` | **yes (persona required)** | `<basePersona>--<lens>` | `decision-maker--crypto-trader` |
| `maxIterations` | no (default 3) | Integer 1..N | `3` |

## Procedure

1. **Validate input** — `responseJson` is valid (`tier == "L1"`). `iteration >= 1`. `selectionPath` exists. `personaSlug` matches the pattern `<basePersona>--<lens>`.
2. **Extract improvementHints** — `responseJson.improvementHints[]`. If empty: finalize.
3. **Decide next iteration** — see the decision matrix below.
4a. **If re-iterating:**
    - Optional: write intermediate state to `grading-data/_tmp/<hash>--iteration-<n>--L1.json` (gitignored).
    - Re-invoke `selection-skills-L1-start-grade` with `iteration + 1`, `previousGradingPath`, and `personaSlug` unchanged.
    - The skill ends.
4b. **If finalizing:**
    - Compute `<schemaHash>` (8-character sha256 truncate).
    - Compute `<ISO-ts>` (`2026-MM-DDTHH-MM-SSZ`).
    - Compute the target path: `grading-data/selection/<selectionId>/gradings/<schemaHash>--<ISO-ts>--<personaSlug>--L1.json` (the tier suffix `--L1` is optional, for clarity).
    - `mkdir -p` the target folder.
    - Write the final JSON via the `Write` tool.
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

**Default `maxIterations = 3`** (recommended). **Note:** selection skills are more complex — a practical mini-test verifies token/time consumption, especially for L1/L2/L3.

**Re-invocation:** Hand off to `selection-skills-L1-start-grade` with:

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

The write target is ALWAYS inside the gitignored `grading-data/` folder (see `.gitignore`). Never inside public-repo paths.

**Path template (persona-slug convention + tier suffix):**

```
grading-data/selection/<selectionId>/gradings/<schemaHash>--<ISO-ts>--<personaSlug>--L1.json
```

With `<personaSlug> = <basePersona>--<lens>` (the L1 sub-area requires a persona).

**Example:**

```
grading-data/selection/crypto-mini/gradings/f9e8d7c6--2026-05-30T16-02-44Z--decision-maker--crypto-trader--L1.json
```

## Filename helper

Filename construction may only run through `Grading.formatGradingFilename({ hash, ts, persona })` from `src/Grading.mjs` — **no** string concatenation in the save step. The `--L1` tier suffix is appended in the caller after the helper result (the helper returns the base filename; the tier is an L-specific suffix).

```javascript
import { Grading } from 'flowmcp-grading'

const { filename } = Grading.formatGradingFilename( {
    hash: schemaHash,
    ts: isoTs,
    persona: personaSlug          // '<basePersona>--<lens>' (L1 sub-area requires a persona)
} )
// Tier suffix `--L1` appended afterward for the selection-skills tier:
const tieredFilename = filename.replace( /\.json$/, '--L1.json' )
const targetPath = `grading-data/selection/${selectionId}/gradings/${tieredFilename}`
```

Validation in the helper (GRD-040/041/042) catches malformed slugs, hashes, and timestamps. Full convention: `docs/grading-filename-convention.md`.
