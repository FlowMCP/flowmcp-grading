---
name: single-test-start-grade
description: Startet eine Grading-Iteration fuer Bereich 1 (single-test) — neutrale Bewertung der Schema-Beschreibung eines einzelnen Tools. Laedt Template, Pre-Instructions, gefilterte Fragen (area=single-test) und das Output-Schema. Ruft PromptBuilder.build auf, spawnt einen frischen Sub-Agent (Read-only, leerer Kontext, Strict-JSON) und validiert die Response gegen prompts/output-schemas/single-test.schema.json. Initialisiert den Iterations-Counter und uebergibt an single-test-apply-improvement (PRD-16). Persona-Anwendung gemaess Memo 082 Kap 7.4 — Bereich 1 ist neutral (personaRequired: false).
allowed-tools: Read, Bash, Grep
model: inherit
---

## Input

Parameter (vom Aufrufer per Tool-Call uebergeben):

| Parameter | Pflicht | Format | Beispiel |
|-----------|---------|--------|----------|
| `schemaPath` | ja | Absoluter Pfad zum Tool-Schema | `/.../schemas-private/v3/etherscan/getContractEthereum.mjs` |
| `personaSlug` | nein (Bereich 1 ist neutral, Kap 7.4) | `"neutral"` (literal) | `neutral` |
| `iteration` | nein (Default 1) | Integer 1..N | `1` |
| `previousGradingPath` | nur ab Iteration 2 | Absoluter Pfad zur Vorgaenger-JSON | `/.../grading-data/single/.../gradings/abc--ts--neutral.json` |

**Persona-Anwendung (Kap 7.4):** `personaRequired: false`. Bereich 1 wird neutral bewertet. Persona-Block bleibt leer.

## Ablauf

1. **Validate Inputs** — `schemaPath` existiert (`ls`-Check). Bei Fehler: `{ "blocker": "schemaPath", "reason": "not found" }`.
2. **Load Template** — Read `prompts/templates/single-test.md` (Pflicht-Block aus Kap 8).
3. **Load Pre-Instructions** — Read `prompts/pre-instructions/single-test.md` (Files-to-Read in strikter Reihenfolge).
4. **Load Output-Schema** — Read `prompts/output-schemas/single-test.schema.json` (Strict-JSON-Vertrag, Kap 9).
5. **Filter Questions** — Read `prompts/generated/questions.json`, filtere Eintraege mit `area == "single-test"`.
6. **Load Persona (optional)** — `personaRequired: false` — Persona-Block bleibt leer.
7. **Load previous Grading (optional)** — Wenn `iteration > 1`: Lies `previousGradingPath` und extrahiere `improvementHints[]` fuer die naechste Iteration.
8. **Build Prompt** — Rufe `PromptBuilder.build({ template, preInstructions, outputSchema, questions, persona: null, previousHints, schemaPath, iteration })` auf (PRD-04/P2d). Erhaelt `{ prompt: string }`.
9. **Spawn Sub-Agent** — Per Bash: `claude --print --model inherit --max-turns 1 --output-format json --append-system-prompt "Sub-Agent: Strict-JSON only. No prose." -- <prompt>`. Read-only Tools. Frischer leerer Kontext.
10. **Validate Response** — Parse JSON. Validiere gegen `single-test.schema.json`. Bei Schema-Fail: `{ "blocker": "schema-validation", "reason": "<details>" }`.
11. **Hand-off** — Rufe `single-test-apply-improvement` (PRD-16) mit dem validierten JSON + `iteration` + `schemaPath` + `personaSlug="neutral"` auf.

## Output

Strict-JSON gemaess `prompts/output-schemas/single-test.schema.json` mit Pflichtfeldern:

- `area: "single-test"` (literal-match)
- `iteration`: Integer
- `personaSlug: "neutral"`
- `gradings[]`: Array von Frage-Antworten pro Dimension (Mapping auf Spec 08 §4)
- `improvementHints[]`: Hinweise fuer den naechsten Generator-Loop

Bei Blocker:

```json
{ "blocker": "<dateipfad-oder-stufe>", "reason": "<klartext>" }
```

## Recursive-Loop-Hand-off

Nach erfolgreicher Validierung Hand-off an `single-test-apply-improvement` (PRD-16) mit:

- `responseJson` — validierte JSON aus Schritt 10
- `iteration` — aktuelle Iteration (1..N, Default Start = 1)
- `schemaPath` — unveraendert
- `personaSlug` — `"neutral"` (Bereich 1 ist neutral, Kap 7.4)

`apply-improvement` entscheidet, ob eine naechste Iteration laeuft (`iteration < maxIterations`, Default 3, Kap 12) oder ob die finale Grading-Datei geschrieben wird.
