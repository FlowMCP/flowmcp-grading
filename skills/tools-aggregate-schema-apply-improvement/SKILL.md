---
name: tools-aggregate-schema-apply-improvement
description: Consumes the JSON response from tools-aggregate-schema-start-grade. Reads improvementHints[], decides whether a next iteration starts (default maxIterations=3) or whether the final grading file is written to grading-data/single/<ns>--<tool>/gradings/<hash>--<ts>--neutral.json (gitignored). On re-iteration, produces the re-invocation call of tools-aggregate-schema-start-grade with iteration+1 + previousGradingPath. The decision matrix follows the grading spec. Per the grading spec, the tools-aggregate-schema area uses a neutral persona.
allowed-tools: Read, Write, Bash
model: inherit
---

## Input

Parameters (passed by the `tools-aggregate-schema-start-grade` skill via hand-off):

| Parameter | Required | Format | Example |
|-----------|----------|--------|---------|
| `responseJson` | yes | Strict JSON per `tools-aggregate-schema.schema.json` | `{ area: "tools-aggregate-schema", iteration: 1, gradings: [...], improvementHints: [...] }` |
| `iteration` | yes | Integer 1..N | `1` |
| `schemaPath` | yes | Absolute path to the schema (all routes aggregated) | `/.../etherscan/getContractEthereum.mjs` |
| `personaSlug` | yes | `"neutral"` (the tools-aggregate-schema area is neutral) | `neutral` |
| `maxIterations` | no (default 3) | Integer 1..N | `3` |

## Process

1. **Validate Input** — `responseJson` is valid. `iteration >= 1`. `schemaPath` exists.
2. **Extract improvementHints** — `responseJson.improvementHints[]`. If empty: finalize.
3. **Decide next iteration** — Decision matrix (see below).
4a. **If re-iteration:**
    - Optional: write interim state to `grading-data/_tmp/<hash>--iteration-<n>.json` (gitignored).
    - Re-invoke `tools-aggregate-schema-start-grade` with `iteration + 1`, `previousGradingPath`, `personaSlug="neutral"`.
    - Skill ends.
4b. **If finalizing:**
    - Compute `<schemaHash>` (8-character sha256 truncate).
    - Compute `<ISO-ts>` (`2026-MM-DDTHH-MM-SSZ`).
    - Compute the target path: `grading-data/single/<namespace>--<tool>/gradings/<schemaHash>--<ISO-ts>--neutral.json`.
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

**Default `maxIterations = 3`.** Iteration 1 = initial assessment, iteration 2 = self-correction, iteration 3 = final consistency check.

**Re-Invocation:** Hand off to `tools-aggregate-schema-start-grade` with:

```json
{
  "schemaPath": "<unchanged>",
  "personaSlug": "neutral",
  "iteration": "<iteration + 1>",
  "previousGradingPath": "<path or inline data>"
}
```

## Output

On re-iteration: no file; the next loop cycle starts.

On finalizing:

```json
{ "finalPath": "<absolute-path>", "iteration": "<n>", "status": "done" }
```

## Folder Guarantee

The write target is ALWAYS inside the **gitignored `grading-data/` folder** (see `.gitignore:1`). Never write into public-repo paths.

**Path template:**

```
grading-data/single/<namespace>--<tool>/gradings/<schemaHash>--<ISO-ts>--<personaSlug>.json
```

With `<personaSlug> = neutral` (tools-aggregate-schema area).

**Example:**

```
grading-data/single/etherscan--getContractEthereum/gradings/a1b2c3d4--2026-05-30T15-34-12Z--neutral.json
```

## Filename Helper

Filename construction may run ONLY via `Grading.formatGradingFilename({ hash, ts, persona })` from `src/Grading.mjs` — **no** string concatenation in the save step.

```javascript
import { Grading } from 'flowmcp-grading'

const { filename } = Grading.formatGradingFilename( {
    hash: schemaHash,
    ts: isoTs,
    persona: personaSlug          // 'neutral' (tools-aggregate-schema area)
} )
const targetPath = `grading-data/single/${namespace}--${tool}/gradings/${filename}`
```

Validation in the helper (GRD-040/041/042) catches malformed slugs, hashes, and timestamps. Full convention: `docs/grading-filename-convention.md`.
