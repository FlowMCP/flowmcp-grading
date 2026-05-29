---
name: single-test-apply-improvement
description: Konsumiert die JSON-Response von single-test-start-grade. Liest improvementHints[], entscheidet ob ein naechster Iterations-Lauf startet (Default maxIterations=3) oder ob die finale Grading-Datei nach grading-data/single/<ns>--<tool>/gradings/<hash>--<ts>--neutral.json (gitignored, Kap 4.6) geschrieben wird. Erzeugt bei Re-Iteration den Re-Invocation-Aufruf von single-test-start-grade mit iteration+1 + previousGradingPath. Decision-Matrix gemaess Memo 082 Kap 12. Persona-Anwendung Bereich 1 = neutral (Kap 7.4).
allowed-tools: Read, Write, Bash
model: inherit
---

## Input

Parameter (vom `single-test-start-grade`-Skill via Hand-off uebergeben):

| Parameter | Pflicht | Format | Beispiel |
|-----------|---------|--------|----------|
| `responseJson` | ja | Strict-JSON gemaess `single-test.schema.json` | `{ area: "single-test", iteration: 1, gradings: [...], improvementHints: [...] }` |
| `iteration` | ja | Integer 1..N | `1` |
| `schemaPath` | ja | Absoluter Pfad zum Tool-Schema | `/.../etherscan/getContractEthereum.mjs` |
| `personaSlug` | ja | `"neutral"` (Bereich 1 ist neutral, Kap 7.4) | `neutral` |
| `maxIterations` | nein (Default 3, Kap 12) | Integer 1..N | `3` |

## Ablauf

1. **Validate Input** — `responseJson` ist valid (kein `blocker`). `iteration >= 1`. `schemaPath` existiert.
2. **Extract improvementHints** — `responseJson.improvementHints[]`. Bei leer: kein Verbesserungs-Potenzial → Finalisieren.
3. **Decide next iteration** — Decision-Matrix (siehe unten).
4a. **Wenn Re-Iteration:**
    - Optional: Schreibe Zwischen-State nach `grading-data/_tmp/<schemaHash>--iteration-<n>.json` (Recovery, Kap 4.6 gitignored).
    - Re-invoke `single-test-start-grade` mit:
      - `schemaPath`: unveraendert
      - `personaSlug`: `"neutral"`
      - `iteration`: `iteration + 1`
      - `previousGradingPath`: Pfad zur Zwischen-Datei oder Inline-Uebergabe der `responseJson`
    - Skill endet — naechster Loop-Zyklus startet im `start-grade`-Skill.
4b. **Wenn Finalisieren:**
    - Berechne `<schemaHash>` (8-Zeichen sha256-Truncate des kanonischen Schema-JSON, Spec 08 §5)
    - Berechne `<ISO-ts>` (`2026-MM-DDTHH-MM-SSZ`, Doppelpunkt durch Bindestrich, Dateisystem-Kompatibilitaet)
    - Berechne Zielpfad: `grading-data/single/<namespace>--<tool>/gradings/<schemaHash>--<ISO-ts>--neutral.json`
    - `mkdir -p` Zielordner
    - Write finale JSON via `Write`-Tool
    - Output: `{ finalPath: "<absoluter-Pfad>", iteration: <n>, status: "done" }`

## Recursive-Loop-Mechanik

**Decision-Matrix (Kap 12):**

| Bedingung | Aktion |
|-----------|--------|
| `iteration >= maxIterations` | Finalisieren |
| `improvementHints[]` ist leer | Finalisieren |
| `responseJson.confidence == "high"` (sofern vom Output-Schema gesetzt) | Finalisieren |
| `responseJson.blocker` ist gesetzt | Finalisieren (mit Blocker-Status) |
| sonst | Re-Iteration mit `iteration + 1` |

**Default `maxIterations = 3`** (Kap 12 Empfehlung). Iteration 1 = initiale Bewertung, Iteration 2 = Selbst-Korrektur aufgrund Iter-1-improvementHints, Iteration 3 = finaler Konsistenz-Check.

**Re-Invocation:** Hand-off an `single-test-start-grade` mit:

```json
{
  "schemaPath": "<unveraendert>",
  "personaSlug": "neutral",
  "iteration": "<iteration + 1>",
  "previousGradingPath": "<Pfad oder Inline-Daten>"
}
```

Der naechste `start-grade`-Lauf laedt `improvementHints[]` und gibt sie an `PromptBuilder.build({ ...previousHints })` weiter — das ist die Verbesserungs-Schleife (Kap 12).

## Output

Bei Re-Iteration: keine Datei, naechster Loop-Zyklus startet im `start-grade`-Skill.

Bei Finalisieren:

```json
{ "finalPath": "<absoluter-Pfad>", "iteration": "<n>", "status": "done" }
```

## Folder-Garantie (Kap 4.6)

Write-Target IMMER im **gitignored `grading-data/`-Folder** (Kap 4.6 — `.gitignore:1`). Niemals in `prompts/`, `skills/`, `spec/`, `src/`, `tests/`, `scripts/`, `docs/` schreiben.

**Pfad-Template (Spec 08 §5 + Spec 19 §17.1 + Kap 13):**

```
grading-data/single/<namespace>--<tool>/gradings/<schemaHash>--<ISO-ts>--<personaSlug>.json
```

Komponenten:
- `<schemaHash>`: 8-Zeichen sha256-Truncate des kanonischen Schema-JSON
- `<ISO-ts>`: `2026-MM-DDTHH-MM-SSZ` (Bindestrich statt Doppelpunkt)
- `<personaSlug>`: `neutral` (Bereich 1, Kap 7.4)

**Beispiel:**

```
grading-data/single/etherscan--getContractEthereum/gradings/a1b2c3d4--2026-05-30T15-34-12Z--neutral.json
```

## Filename-Helper (PRD-21)

Filename-Bildung darf nur via `Grading.formatGradingFilename({ hash, ts, persona })` aus `src/Grading.mjs` laufen — **kein** String-Concat im Save-Step.

```javascript
import { Grading } from 'flowmcp-grading'

const { filename } = Grading.formatGradingFilename( {
    hash: schemaHash,             // 8-Zeichen sha256-Truncate ODER PLACEHOLDER\d{3}
    ts: isoTs,                    // '2026-05-30T15-34-12Z' (Bindestrich statt Doppelpunkt)
    persona: personaSlug          // 'neutral' (Bereich 1)
} )
const targetPath = `grading-data/single/${namespace}--${tool}/gradings/${filename}`
```

Validierung im Helper (GRD-040/041/042) faengt fehlerhafte Slugs, Hashes und Timestamps ab. Vollstaendige Konvention: `docs/grading-filename-convention.md`.
