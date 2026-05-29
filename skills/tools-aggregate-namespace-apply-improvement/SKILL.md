---
name: tools-aggregate-namespace-apply-improvement
description: Konsumiert die JSON-Response von tools-aggregate-namespace-start-grade. Liest improvementHints[], entscheidet ob ein naechster Iterations-Lauf startet (Default maxIterations=3) oder ob die finale Grading-Datei nach grading-data/namespace/<ns>/gradings/<hash>--<ts>--neutral.json (gitignored, Kap 4.6) geschrieben wird. Erzeugt bei Re-Iteration den Re-Invocation-Aufruf von tools-aggregate-namespace-start-grade mit iteration+1 + previousGradingPath. Decision-Matrix gemaess Memo 082 Kap 12. Persona-Anwendung Bereich 4 = neutral (Kap 7.4).
allowed-tools: Read, Write, Bash
model: inherit
---

## Input

Parameter (vom `tools-aggregate-namespace-start-grade`-Skill via Hand-off uebergeben):

| Parameter | Pflicht | Format | Beispiel |
|-----------|---------|--------|----------|
| `responseJson` | ja | Strict-JSON gemaess `tools-aggregate-namespace.schema.json` | `{ area: "tools-aggregate-namespace", iteration: 1, gradings: [...], improvementHints: [...] }` |
| `iteration` | ja | Integer 1..N | `1` |
| `namespacePath` | ja | Absoluter Pfad zum Namespace-Ordner | `/.../etherscan/` |
| `personaSlug` | ja | `"neutral"` (Bereich 4 ist neutral, Kap 7.4) | `neutral` |
| `maxIterations` | nein (Default 3, Kap 12) | Integer 1..N | `3` |

## Ablauf

1. **Validate Input** — `responseJson` ist valid. `iteration >= 1`. `namespacePath` existiert.
2. **Extract improvementHints** — `responseJson.improvementHints[]`. Bei leer: Finalisieren.
3. **Decide next iteration** — Decision-Matrix (siehe unten).
4a. **Wenn Re-Iteration:**
    - Optional: Zwischen-State nach `grading-data/_tmp/<hash>--iteration-<n>.json` (gitignored).
    - Re-invoke `tools-aggregate-namespace-start-grade` mit `iteration + 1`, `previousGradingPath`, `personaSlug="neutral"`.
    - Skill endet.
4b. **Wenn Finalisieren:**
    - Berechne `<schemaHash>` (8-Zeichen sha256-Truncate, Spec 08 §5).
    - Berechne `<ISO-ts>` (`2026-MM-DDTHH-MM-SSZ`).
    - Berechne Zielpfad: `grading-data/namespace/<namespace>/gradings/<schemaHash>--<ISO-ts>--neutral.json`.
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

**Re-Invocation:** Hand-off an `tools-aggregate-namespace-start-grade` mit:

```json
{
  "namespacePath": "<unveraendert>",
  "personaSlug": "neutral",
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

**Pfad-Template:**

```
grading-data/namespace/<namespace>/gradings/<schemaHash>--<ISO-ts>--<personaSlug>.json
```

Mit `<personaSlug> = neutral` (Bereich 4, Kap 7.4).

**Beispiel:**

```
grading-data/namespace/etherscan/gradings/a1b2c3d4--2026-05-30T15-34-12Z--neutral.json
```
