---
name: about-selection-apply-improvement
description: Konsumiert die JSON-Response von about-selection-start-grade. Liest improvementHints[], entscheidet ob ein naechster Iterations-Lauf startet (Default maxIterations=3) oder ob die finale Grading-Datei nach grading-data/selection/<sel>/gradings/<hash>--<ts>--<basePersona>--<lens>.json (gitignored, Kap 4.6) geschrieben wird. Erzeugt bei Re-Iteration den Re-Invocation-Aufruf von about-selection-start-grade mit iteration+1 + previousGradingPath. Decision-Matrix gemaess Memo 082 Kap 12. Persona-Anwendung Bereich 6 = MIT Persona Pflicht (Kap 7.4, Spec 11 §4).
allowed-tools: Read, Write, Bash
model: inherit
---

## Input

Parameter (vom `about-selection-start-grade`-Skill via Hand-off uebergeben):

| Parameter | Pflicht | Format | Beispiel |
|-----------|---------|--------|----------|
| `responseJson` | ja | Strict-JSON gemaess `about-selection.schema.json` | `{ area: "about-selection", iteration: 1, gradings: [...], improvementHints: [...] }` |
| `iteration` | ja | Integer 1..N | `1` |
| `selectionPath` | ja | Absoluter Pfad zur Selection | `/.../grading-data/selection/crypto-mini/` |
| `personaSlug` | **ja (Persona-Pflicht, Kap 7.4)** | `<basePersona>--<lens>` | `decision-maker--crypto-trader` |
| `maxIterations` | nein (Default 3, Kap 12) | Integer 1..N | `3` |

## Ablauf

1. **Validate Input** — `responseJson` ist valid. `iteration >= 1`. `selectionPath` existiert. `personaSlug` matcht Pattern `<basePersona>--<lens>`.
2. **Extract improvementHints** — `responseJson.improvementHints[]`. Bei leer: Finalisieren.
3. **Decide next iteration** — Decision-Matrix (siehe unten).
4a. **Wenn Re-Iteration:**
    - Optional: Zwischen-State nach `grading-data/_tmp/<hash>--iteration-<n>.json` (gitignored).
    - Re-invoke `about-selection-start-grade` mit `iteration + 1`, `previousGradingPath`, `personaSlug` unveraendert.
    - Skill endet.
4b. **Wenn Finalisieren:**
    - Berechne `<schemaHash>` (8-Zeichen sha256-Truncate, Spec 08 §5).
    - Berechne `<ISO-ts>` (`2026-MM-DDTHH-MM-SSZ`).
    - Berechne Zielpfad: `grading-data/selection/<selectionId>/gradings/<schemaHash>--<ISO-ts>--<personaSlug>.json`.
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

**Default `maxIterations = 3`** (Kap 12 Empfehlung).

**Re-Invocation:** Hand-off an `about-selection-start-grade` mit:

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

**Pfad-Template (Kap 13 Persona-Slug-Konvention):**

```
grading-data/selection/<selectionId>/gradings/<schemaHash>--<ISO-ts>--<personaSlug>.json
```

Mit `<personaSlug> = <basePersona>--<lens>` (Bereich 6 Persona-Pflicht, Kap 7.4 + Kap 13).

**Beispiel:**

```
grading-data/selection/crypto-mini/gradings/f9e8d7c6--2026-05-30T16-02-44Z--decision-maker--crypto-trader.json
```
