---
name: namespace-skills-apply-improvement
description: Consumes the JSON response from namespace-skills-start-grade. Reads improvementHints[], decides whether to start a next iteration run (default maxIterations=3) or to write the final grading file to grading-data/namespace/<ns>/gradings/<hash>--<ts>--<basePersona>--<lens>.json (gitignored). On re-iteration it builds the re-invocation call to namespace-skills-start-grade with iteration+1 and previousGradingPath. The decision matrix follows the grading spec. Persona application for the namespace-skills area is the recommended default (persona required).
allowed-tools: Read, Write, Bash
model: inherit
---

## Input

Parameters (handed off from the `namespace-skills-start-grade` skill):

| Parameter | Required | Format | Example |
|-----------|----------|--------|---------|
| `responseJson` | yes | Strict JSON per `namespace-skills.schema.json` | `{ area: "namespace-skills", iteration: 1, gradings: [...], improvementHints: [...] }` |
| `iteration` | yes | Integer 1..N | `1` |
| `namespacePath` | yes | Absolute path to the namespace folder | `/.../etherscan/` |
| `personaSlug` | **yes (recommended default)** | `<basePersona>--<lens>` | `decision-maker--crypto-trader` |
| `maxIterations` | no (default 3) | Integer 1..N | `3` |

## Procedure

1. **Validate input** — `responseJson` is valid. `iteration >= 1`. `namespacePath` exists. `personaSlug` matches the pattern `<basePersona>--<lens>`.
2. **Extract improvementHints** — `responseJson.improvementHints[]`. If empty: finalize.
3. **Decide next iteration** — see the decision matrix below.
4a. **If re-iterating:**
    - Optional: write intermediate state to `grading-data/_tmp/<hash>--iteration-<n>.json` (gitignored).
    - Re-invoke `namespace-skills-start-grade` with `iteration + 1`, `previousGradingPath`, and `personaSlug` unchanged.
    - The skill ends.
4b. **If finalizing:**
    - Compute `<schemaHash>` (8-character sha256 truncate).
    - Compute `<ISO-ts>` (`2026-MM-DDTHH-MM-SSZ`).
    - Compute the target path: `grading-data/namespace/<namespace>/gradings/<schemaHash>--<ISO-ts>--<personaSlug>.json`.
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

**Default `maxIterations = 3`** (recommended).

**Re-invocation:** Hand off to `namespace-skills-start-grade` with:

```json
{
  "namespacePath": "<unchanged>",
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

**Path template (persona-slug convention):**

```
grading-data/namespace/<namespace>/gradings/<schemaHash>--<ISO-ts>--<personaSlug>.json
```

With `<personaSlug> = <basePersona>--<lens>` (namespace-skills uses a persona as the recommended default).

**Example:**

```
grading-data/namespace/etherscan/gradings/a1b2c3d4--2026-05-30T15-34-12Z--decision-maker--crypto-trader.json
```

## Filename helper

Filename construction may only run through `Grading.formatGradingFilename({ hash, ts, persona })` from `src/Grading.mjs` — **no** string concatenation in the save step.

```javascript
import { Grading } from 'flowmcp-grading'

const { filename } = Grading.formatGradingFilename( {
    hash: schemaHash,
    ts: isoTs,
    persona: personaSlug          // '<basePersona>--<lens>' (namespace-skills persona is the recommended default)
} )
const targetPath = `grading-data/namespace/${namespace}/gradings/${filename}`
```

Validation in the helper (GRD-040/041/042) catches malformed slugs, hashes, and timestamps. Full convention: `docs/grading-filename-convention.md`.
