---
name: tools-aggregate-namespace-apply-improvement
description: Consumes the JSON response from tools-aggregate-namespace-start-grade. Reads improvementHints[], decides whether a next iteration starts (default maxIterations=3) or whether the final grading file is written to grading-data/namespace/<ns>/gradings/<hash>--<ts>--neutral.json (gitignored). On re-iteration, produces the re-invocation call of tools-aggregate-namespace-start-grade with iteration+1 + previousGradingPath. The decision matrix follows the grading spec. Per the grading spec, the tools-aggregate-namespace area uses a neutral persona.
allowed-tools: Read, Write, Bash
model: inherit
---

## Input

Parameters (passed by the `tools-aggregate-namespace-start-grade` skill via hand-off):

| Parameter | Required | Format | Example |
|-----------|----------|--------|---------|
| `responseJson` | yes | Strict JSON per `tools-aggregate-namespace.schema.json` | `{ area: "tools-aggregate-namespace", iteration: 1, gradings: [...], improvementHints: [...] }` |
| `iteration` | yes | Integer 1..N | `1` |
| `namespacePath` | yes | Absolute path to the namespace folder | `/.../etherscan/` |
| `personaSlug` | yes | `"neutral"` (the tools-aggregate-namespace area is neutral) | `neutral` |
| `maxIterations` | no (default 3) | Integer 1..N | `3` |

## Process

1. **Validate Input** — `responseJson` is valid. `iteration >= 1`. `namespacePath` exists.
2. **Extract improvementHints** — `responseJson.improvementHints[]`. If empty: finalize.
3. **Decide next iteration** — Decision matrix (see below).
4a. **If re-iteration:**
    - Optional: write interim state to `grading-data/_tmp/<hash>--iteration-<n>.json` (gitignored).
    - Re-invoke `tools-aggregate-namespace-start-grade` with `iteration + 1`, `previousGradingPath`, `personaSlug="neutral"`.
    - Skill ends.
4b. **If finalizing:**
    - Compute `<schemaHash>` (8-character sha256 truncate).
    - Compute `<ISO-ts>` (`2026-MM-DDTHH-MM-SSZ`).
    - Compute the target path: `grading-data/namespace/<namespace>/gradings/<schemaHash>--<ISO-ts>--neutral.json`.
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

**Default `maxIterations = 3`.**

**Re-Invocation:** Hand off to `tools-aggregate-namespace-start-grade` with:

```json
{
  "namespacePath": "<unchanged>",
  "personaSlug": "neutral",
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

**Path template:**

```
grading-data/namespace/<namespace>/gradings/<schemaHash>--<ISO-ts>--<personaSlug>.json
```

With `<personaSlug> = neutral` (tools-aggregate-namespace area).

**Example:**

```
grading-data/namespace/etherscan/gradings/a1b2c3d4--2026-05-30T15-34-12Z--neutral.json
```

## Filename Helper

Filename construction may run ONLY via `Grading.formatGradingFilename({ hash, ts, persona })` from `src/Grading.mjs` — **no** string concatenation in the save step.

```javascript
import { Grading } from 'flowmcp-grading'

const { filename } = Grading.formatGradingFilename( {
    hash: schemaHash,
    ts: isoTs,
    persona: personaSlug          // 'neutral' (tools-aggregate-namespace area)
} )
const targetPath = `grading-data/namespace/${namespace}/gradings/${filename}`
```

Validation in the helper (GRD-040/041/042) catches malformed slugs, hashes, and timestamps. Full convention: `docs/grading-filename-convention.md`.
