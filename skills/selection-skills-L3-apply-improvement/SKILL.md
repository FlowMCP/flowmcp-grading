---
name: selection-skills-L3-apply-improvement
description: Consumes the JSON response from selection-skills-L3-start-grade. Reads improvementHints[], decides whether a next iteration starts (default maxIterations=3) or whether the final grading file is written to grading-data/selection/<sel>/gradings/<hash>--<ts>--<basePersona>--<lens>--L3.json (gitignored). On re-iteration, produces the re-invocation call of selection-skills-L3-start-grade with iteration+1 + previousGradingPath. The decision matrix follows the grading spec. Persona application for this area is mandatory (personaRequired: true, per the FlowMCP Spec §13). Note — selection-skills are more complex, so a small practical test run verifies the token budget.
allowed-tools: Read, Write, Bash
model: inherit
---

## Input

Parameters (passed by the `selection-skills-L3-start-grade` skill via hand-off):

| Parameter | Required | Format | Example |
|-----------|----------|--------|---------|
| `responseJson` | yes | Strict JSON per `selection-skills-L3.schema.json` | `{ area: "selection-skills", tier: "L3", iteration: 1, gradings: [...], improvementHints: [...] }` |
| `iteration` | yes | Integer 1..N | `1` |
| `selectionPath` | yes | Absolute path to the selection | `/.../grading-data/selection/crypto-mini/` |
| `personaSlug` | **yes (mandatory, per the FlowMCP Spec §13)** | `<basePersona>--<lens>` | `decision-maker--crypto-trader` |
| `maxIterations` | no (default 3) | Integer 1..N | `3` |

## Process

1. **Validate Input** — `responseJson` is valid (`tier == "L3"`). `iteration >= 1`. `selectionPath` exists. `personaSlug` matches the pattern `<basePersona>--<lens>`.
2. **Extract improvementHints** — `responseJson.improvementHints[]`. If empty: finalize.
3. **Decide next iteration** — Decision matrix (see below).
4a. **If re-iteration:**
    - Optional: write interim state to `grading-data/_tmp/<hash>--iteration-<n>--L3.json` (gitignored).
    - Re-invoke `selection-skills-L3-start-grade` with `iteration + 1`, `previousGradingPath`, `personaSlug` unchanged.
    - Skill ends.
4b. **If finalizing:**
    - Compute `<schemaHash>` (8-character sha256 truncate).
    - Compute `<ISO-ts>` (`2026-MM-DDTHH-MM-SSZ`).
    - Compute the target path: `grading-data/selection/<selectionId>/gradings/<schemaHash>--<ISO-ts>--<personaSlug>--L3.json`.
    - `mkdir -p` the target folder.
    - Write the final JSON via the `Write` tool.
    - Output: `{ finalPath: "<absolute-path>", iteration: <n>, status: "done" }`.

## Recursive-Loop Mechanics

**Decision matrix:**

| Condition | Action |
|-----------|--------|
| `iteration >= maxIterations` | Finalize |
| `improvementHints[]` is empty | Finalize |
| `responseJson.confidence == "high"` | Finalize |
| `responseJson.blocker` set | Finalize (with blocker status) |
| otherwise | Re-iterate with `iteration + 1` |

**Default `maxIterations = 3`.** Note: selection-skills are more complex — a small practical test run verifies the token/time cost, especially for L1/L2/L3.

**Re-Invocation:** Hand off to `selection-skills-L3-start-grade` with:

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

On finalizing:

```json
{ "finalPath": "<absolute-path>", "iteration": "<n>", "status": "done" }
```

## Folder Guarantee

The write target is ALWAYS inside the **gitignored `grading-data/` folder** (see `.gitignore:1`). Never write into public-repo paths.

**Path template (persona-slug convention + tier suffix):**

```
grading-data/selection/<selectionId>/gradings/<schemaHash>--<ISO-ts>--<personaSlug>--L3.json
```

With `<personaSlug> = <basePersona>--<lens>` (persona mandatory for this area, per the FlowMCP Spec §13).

**Example:**

```
grading-data/selection/crypto-mini/gradings/f9e8d7c6--2026-05-30T16-02-44Z--decision-maker--crypto-trader--L3.json
```

## Filename Helper

Filename construction may run ONLY via `Grading.formatGradingFilename({ hash, ts, persona })` from `src/Grading.mjs` — **no** string concatenation in the save step. The `--L3` tier suffix is appended by the caller after the helper result.

```javascript
import { Grading } from 'flowmcp-grading'

const { filename } = Grading.formatGradingFilename( {
    hash: schemaHash,
    ts: isoTs,
    persona: personaSlug          // '<basePersona>--<lens>' (persona mandatory for this area)
} )
const tieredFilename = filename.replace( /\.json$/, '--L3.json' )
const targetPath = `grading-data/selection/${selectionId}/gradings/${tieredFilename}`
```

Validation in the helper (GRD-040/041/042) catches malformed slugs, hashes, and timestamps. Full convention: `docs/grading-filename-convention.md`.
