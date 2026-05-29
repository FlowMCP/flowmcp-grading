---
name: selection-skills-L2-apply-improvement
description: Konsumiert die JSON-Response von selection-skills-L2-start-grade. Liest improvementHints[], entscheidet ob ein naechster Iterations-Lauf startet (Default maxIterations=3) oder ob die finale Grading-Datei nach grading-data/selection/<sel>/gradings/<hash>--<ts>--<basePersona>--<lens>--L2.json (gitignored, Kap 4.6) geschrieben wird. Erzeugt bei Re-Iteration den Re-Invocation-Aufruf von selection-skills-L2-start-grade mit iteration+1 + previousGradingPath. Decision-Matrix gemaess Memo 082 Kap 12. Persona-Anwendung Bereich 7b = Pflicht (Kap 7.4, Spec 13 §4.2). User-Caveat REV-04 — Selection-Skill-Komplexitaet (Mini-Praxis-Test P6 verifiziert Token-Budget).
allowed-tools: Read, Write, Bash
model: inherit
---

## Input

Parameter (vom `selection-skills-L2-start-grade`-Skill via Hand-off uebergeben):

| Parameter | Pflicht | Format | Beispiel |
|-----------|---------|--------|----------|
| `responseJson` | ja | Strict-JSON gemaess `selection-skills-L2.schema.json` | `{ area: "selection-skills", tier: "L2", iteration: 1, gradings: [...], improvementHints: [...] }` |
| `iteration` | ja | Integer 1..N | `1` |
| `selectionPath` | ja | Absoluter Pfad zur Selection | `/.../grading-data/selection/crypto-mini/` |
| `personaSlug` | **ja (Pflicht, Spec 13 §4.2)** | `<basePersona>--<lens>` | `decision-maker--crypto-trader` |
| `maxIterations` | nein (Default 3, Kap 12) | Integer 1..N | `3` |

## Ablauf

1. **Validate Input** — `responseJson` ist valid (`tier == "L2"`). `iteration >= 1`. `selectionPath` existiert. `personaSlug` matcht Pattern `<basePersona>--<lens>`.
2. **Extract improvementHints** — `responseJson.improvementHints[]`. Bei leer: Finalisieren.
3. **Decide next iteration** — Decision-Matrix (siehe unten).
4a. **Wenn Re-Iteration:**
    - Optional: Zwischen-State nach `grading-data/_tmp/<hash>--iteration-<n>--L2.json` (gitignored).
    - Re-invoke `selection-skills-L2-start-grade` mit `iteration + 1`, `previousGradingPath`, `personaSlug` unveraendert.
    - Skill endet.
4b. **Wenn Finalisieren:**
    - Berechne `<schemaHash>` (8-Zeichen sha256-Truncate, Spec 08 §5).
    - Berechne `<ISO-ts>` (`2026-MM-DDTHH-MM-SSZ`).
    - Berechne Zielpfad: `grading-data/selection/<selectionId>/gradings/<schemaHash>--<ISO-ts>--<personaSlug>--L2.json`.
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

**Default `maxIterations = 3`** (Kap 12 Empfehlung). **User-Caveat REV-04:** Selection-Skills sind komplexer — Mini-Praxis-Test (Phase 6) verifiziert Token-/Zeit-Verbrauch besonders fuer L1/L2/L3.

**Re-Invocation:** Hand-off an `selection-skills-L2-start-grade` mit:

```json
{
  "selectionPath": "<unveraendert>",
  "personaSlug": "<basePersona>--<lens> (unveraendert)",
  "iteration": "<iteration + 1>",
  "previousGradingPath": "<Pfad oder Inline-Daten>"
}
```

## Output

Bei Re-Iteration: keine Datei.

Bei Finalisieren:

```json
{ "finalPath": "<absoluter-Pfad>", "iteration": "<n>", "status": "done" }
```

## Folder-Garantie (Kap 4.6)

Write-Target IMMER im **gitignored `grading-data/`-Folder** (Kap 4.6 — `.gitignore:1`). Niemals in Public-Repo-Pfade.

**Pfad-Template (Kap 13 Persona-Slug-Konvention + Tier-Suffix):**

```
grading-data/selection/<selectionId>/gradings/<schemaHash>--<ISO-ts>--<personaSlug>--L2.json
```

Mit `<personaSlug> = <basePersona>--<lens>` (Bereich 7b Persona-Pflicht, Spec 13 §4.2 + Kap 13).

**Beispiel:**

```
grading-data/selection/crypto-mini/gradings/f9e8d7c6--2026-05-30T16-02-44Z--decision-maker--crypto-trader--L2.json
```

## Filename-Helper (PRD-21)

Filename-Bildung darf nur via `Grading.formatGradingFilename({ hash, ts, persona })` aus `src/Grading.mjs` laufen — **kein** String-Concat im Save-Step. Der `--L2`-Tier-Suffix wird im Aufrufer nach dem Helper-Ergebnis angehaengt.

```javascript
import { Grading } from 'flowmcp-grading'

const { filename } = Grading.formatGradingFilename( {
    hash: schemaHash,
    ts: isoTs,
    persona: personaSlug          // '<basePersona>--<lens>' (Bereich 7b Persona-Pflicht)
} )
const tieredFilename = filename.replace( /\.json$/, '--L2.json' )
const targetPath = `grading-data/selection/${selectionId}/gradings/${tieredFilename}`
```

Validierung im Helper (GRD-040/041/042) faengt fehlerhafte Slugs, Hashes und Timestamps ab. Vollstaendige Konvention: `docs/grading-filename-convention.md`.
