---
name: single-test-apply-improvement
description: Consumes the JSON response from single-test-start-grade. Reads improvementHints[], decides whether a next iteration starts (default maxIterations=3) or whether the final grading file is written to grading-data/single/<ns>--<tool>/gradings/<hash>--<ts>--neutral.json (gitignored). On re-iteration, produces the re-invocation call of single-test-start-grade with iteration+1 + previousGradingPath. The decision matrix follows the grading spec. Per the grading spec, the single-test area uses a neutral persona.
allowed-tools: Read, Write, Bash
model: inherit
---

## Input

Parameters (passed by the `single-test-start-grade` skill via hand-off):

| Parameter | Required | Format | Example |
|-----------|----------|--------|---------|
| `responseJson` | yes | Strict JSON per `single-test.schema.json` | `{ area: "single-test", iteration: 1, gradings: [...], improvementHints: [...] }` |
| `iteration` | yes | Integer 1..N | `1` |
| `schemaPath` | yes | Absolute path to the tool schema | `/.../etherscan/getContractEthereum.mjs` |
| `personaSlug` | yes | `"neutral"` (the single-test area is neutral) | `neutral` |
| `maxIterations` | no (default 3) | Integer 1..N | `3` |

## Process

1. **Validate Input** — `responseJson` is valid (no `blocker`). `iteration >= 1`. `schemaPath` exists.
2. **Extract improvementHints** — `responseJson.improvementHints[]`. If empty: no improvement potential → finalize.
3. **Decide next iteration** — Decision matrix (see below).
4a. **If re-iteration:**
    - Optional: write interim state to `grading-data/_tmp/<schemaHash>--iteration-<n>.json` (recovery, gitignored).
    - Re-invoke `single-test-start-grade` with:
      - `schemaPath`: unchanged
      - `personaSlug`: `"neutral"`
      - `iteration`: `iteration + 1`
      - `previousGradingPath`: path to the interim file or inline hand-off of the `responseJson`
    - Skill ends — the next loop cycle starts in the `start-grade` skill.
4b. **If finalizing:**
    - Compute `<schemaHash>` (8-character sha256 truncate of the canonical schema JSON)
    - Compute `<ISO-ts>` (`2026-MM-DDTHH-MM-SSZ`, colon replaced by hyphen for filesystem compatibility)
    - Compute the target path: `grading-data/single/<namespace>--<tool>/gradings/<schemaHash>--<ISO-ts>--neutral.json`
    - `mkdir -p` the target folder
    - Write the final JSON via the `Write` tool
    - Output: `{ finalPath: "<absolute-path>", iteration: <n>, status: "done" }`

## Recursive-Loop Mechanics

**Decision matrix:**

| Condition | Action |
|-----------|--------|
| `iteration >= maxIterations` | Finalize |
| `improvementHints[]` is empty | Finalize |
| `responseJson.confidence == "high"` (if set by the output schema) | Finalize |
| `responseJson.blocker` is set | Finalize (with blocker status) |
| otherwise | Re-iterate with `iteration + 1` |

**Default `maxIterations = 3`.** Iteration 1 = initial assessment, iteration 2 = self-correction based on iteration-1 improvementHints, iteration 3 = final consistency check.

**Re-Invocation:** Hand off to `single-test-start-grade` with:

```json
{
  "schemaPath": "<unchanged>",
  "personaSlug": "neutral",
  "iteration": "<iteration + 1>",
  "previousGradingPath": "<path or inline data>"
}
```

The next `start-grade` run loads `improvementHints[]` and passes them to `PromptBuilder.build({ ...previousHints })` — this is the improvement loop.

## Output

On re-iteration: no file; the next loop cycle starts in the `start-grade` skill.

On finalizing:

```json
{ "finalPath": "<absolute-path>", "iteration": "<n>", "status": "done" }
```

## Folder Guarantee

The write target is ALWAYS inside the **gitignored `grading-data/` folder** (see `.gitignore:1`). Never write into `prompts/`, `skills/`, `spec/`, `src/`, `tests/`, `scripts/`, or `docs/`.

**Path template:**

```
grading-data/single/<namespace>--<tool>/gradings/<schemaHash>--<ISO-ts>--<personaSlug>.json
```

Components:
- `<schemaHash>`: 8-character sha256 truncate of the canonical schema JSON
- `<ISO-ts>`: `2026-MM-DDTHH-MM-SSZ` (hyphen instead of colon)
- `<personaSlug>`: `neutral` (single-test area)

**Example:**

```
grading-data/single/etherscan--getContractEthereum/gradings/a1b2c3d4--2026-05-30T15-34-12Z--neutral.json
```

## Filename Helper

Filename construction may run ONLY via `Grading.formatGradingFilename({ hash, ts, persona })` from `src/Grading.mjs` — **no** string concatenation in the save step.

```javascript
import { Grading } from 'flowmcp-grading'

const { filename } = Grading.formatGradingFilename( {
    hash: schemaHash,             // 8-character sha256 truncate OR PLACEHOLDER\d{3}
    ts: isoTs,                    // '2026-05-30T15-34-12Z' (hyphen instead of colon)
    persona: personaSlug          // 'neutral' (single-test area)
} )
const targetPath = `grading-data/single/${namespace}--${tool}/gradings/${filename}`
```

Validation in the helper (GRD-040/041/042) catches malformed slugs, hashes, and timestamps. Full convention: `docs/grading-filename-convention.md`.
