---
name: tools-aggregate-schema-apply-improvement
description: Konsumiert die JSON-Response von tools-aggregate-schema-start-grade. Liest improvementHints[], entscheidet ob ein naechster Iterations-Lauf startet (Default maxIterations=3) oder ob die finale Grading-Datei nach grading-data/single/<ns>--<tool>/gradings/<hash>--<ts>--neutral.json (gitignored, Kap 4.6) geschrieben wird. Erzeugt bei Re-Iteration den Re-Invocation-Aufruf von tools-aggregate-schema-start-grade mit iteration+1 + previousGradingPath. Decision-Matrix gemaess Memo 082 Kap 12. Persona-Anwendung Bereich 2 = neutral (Kap 7.4).
allowed-tools: Read, Write, Bash
model: inherit
---

## Input

Parameter (vom `tools-aggregate-schema-start-grade`-Skill via Hand-off uebergeben):

| Parameter | Pflicht | Format | Beispiel |
|-----------|---------|--------|----------|
| `responseJson` | ja | Strict-JSON gemaess `tools-aggregate-schema.schema.json` | `{ area: "tools-aggregate-schema", iteration: 1, gradings: [...], improvementHints: [...] }` |
| `iteration` | ja | Integer 1..N | `1` |
| `schemaPath` | ja | Absoluter Pfad zum Schema (alle Routes aggregiert) | `/.../etherscan/getContractEthereum.mjs` |
| `personaSlug` | ja | `"neutral"` (Bereich 2 ist neutral, Kap 7.4) | `neutral` |
| `maxIterations` | nein (Default 3, Kap 12) | Integer 1..N | `3` |

## Ablauf

1. **Validate Input** — `responseJson` ist valid. `iteration >= 1`. `schemaPath` existiert.
2. **Extract improvementHints** — `responseJson.improvementHints[]`. Bei leer: Finalisieren.
3. **Decide next iteration** — Decision-Matrix (siehe unten).
4a. **Wenn Re-Iteration:**
    - Optional: Zwischen-State nach `grading-data/_tmp/<hash>--iteration-<n>.json` (gitignored).
    - Re-invoke `tools-aggregate-schema-start-grade` mit `iteration + 1`, `previousGradingPath`, `personaSlug="neutral"`.
    - Skill endet.
4b. **Wenn Finalisieren:**
    - Berechne `<schemaHash>` (8-Zeichen sha256-Truncate, Spec 08 §5).
    - Berechne `<ISO-ts>` (`2026-MM-DDTHH-MM-SSZ`).
    - Berechne Zielpfad: `grading-data/single/<namespace>--<tool>/gradings/<schemaHash>--<ISO-ts>--neutral.json`.
    - `mkdir -p` Zielordner.
    - Write finale JSON via `Write`-Tool.
    - Output: `{ finalPath: "<absoluter-Pfad>", iteration: <n>, status: "done" }`.

## Recursive-Loop-Mechanik

**Decision-Matrix (Kap 12):**

| Bedingung | Aktion |
|-----------|--------|
| `iteration >= maxIterations` | Finalisieren |
| `improvementHints[]` ist leer | Finalisieren |
| `responseJson.confidence == "high"` | Finalisieren |
| `responseJson.blocker` gesetzt | Finalisieren (mit Blocker-Status) |
| sonst | Re-Iteration mit `iteration + 1` |

**Default `maxIterations = 3`** (Kap 12 Empfehlung). Iteration 1 = initiale Bewertung, Iteration 2 = Selbst-Korrektur, Iteration 3 = finaler Konsistenz-Check.

**Re-Invocation:** Hand-off an `tools-aggregate-schema-start-grade` mit:

```json
{
  "schemaPath": "<unveraendert>",
  "personaSlug": "neutral",
  "iteration": "<iteration + 1>",
  "previousGradingPath": "<Pfad oder Inline-Daten>"
}
```

## Output

Bei Re-Iteration: keine Datei, naechster Loop-Zyklus.

Bei Finalisieren:

```json
{ "finalPath": "<absoluter-Pfad>", "iteration": "<n>", "status": "done" }
```

## Folder-Garantie (Kap 4.6)

Write-Target IMMER im **gitignored `grading-data/`-Folder** (Kap 4.6 — `.gitignore:1`). Niemals in Public-Repo-Pfade.

**Pfad-Template:**

```
grading-data/single/<namespace>--<tool>/gradings/<schemaHash>--<ISO-ts>--<personaSlug>.json
```

Mit `<personaSlug> = neutral` (Bereich 2, Kap 7.4).

**Beispiel:**

```
grading-data/single/etherscan--getContractEthereum/gradings/a1b2c3d4--2026-05-30T15-34-12Z--neutral.json
```

## Filename-Helper (PRD-21)

Filename-Bildung darf nur via `Grading.formatGradingFilename({ hash, ts, persona })` aus `src/Grading.mjs` laufen — **kein** String-Concat im Save-Step.

```javascript
import { Grading } from 'flowmcp-grading'

const { filename } = Grading.formatGradingFilename( {
    hash: schemaHash,
    ts: isoTs,
    persona: personaSlug          // 'neutral' (Bereich 2)
} )
const targetPath = `grading-data/single/${namespace}--${tool}/gradings/${filename}`
```

Validierung im Helper (GRD-040/041/042) faengt fehlerhafte Slugs, Hashes und Timestamps ab. Vollstaendige Konvention: `docs/grading-filename-convention.md`.
