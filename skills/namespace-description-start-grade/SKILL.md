---
name: namespace-description-start-grade
description: Startet eine Grading-Iteration fuer Bereich 3 (namespace-description) — neutrale Bewertung der Klarheit der Namespace-Identitaet. Laedt Template, Pre-Instructions, gefilterte Fragen (area=namespace-description) und das Output-Schema. Ruft PromptBuilder.build auf, spawnt einen frischen Sub-Agent (Read-only, leerer Kontext, Strict-JSON) und validiert die Response gegen prompts/output-schemas/namespace-description.schema.json. Initialisiert den Iterations-Counter und uebergibt an namespace-description-apply-improvement (PRD-16). Persona-Anwendung gemaess Memo 082 Kap 7.4 — Bereich 3 ist neutral (personaRequired: false).
allowed-tools: Read, Bash, Grep
model: inherit
---

## Input

Parameter (vom Aufrufer per Tool-Call uebergeben):

| Parameter | Pflicht | Format | Beispiel |
|-----------|---------|--------|----------|
| `namespacePath` | ja | Absoluter Pfad zum Namespace (`schemaPath` semantisch = Namespace-Ordner) | `/.../schemas-private/v3/etherscan/` |
| `personaSlug` | nein (Bereich 3 ist neutral, Kap 7.4) | `"neutral"` (literal) | `neutral` |
| `iteration` | nein (Default 1) | Integer 1..N | `1` |
| `previousGradingPath` | nur ab Iteration 2 | Absoluter Pfad | `/.../grading-data/namespace/.../gradings/abc--ts--neutral.json` |

**Persona-Anwendung (Kap 7.4):** `personaRequired: false`. Klarheit der Namespace-Identitaet ist objektiv.

## Ablauf

1. **Validate Inputs** — `namespacePath` existiert. Bei Fehler: `{ "blocker": "namespacePath", "reason": "not found" }`.
2. **Load Template** — Read `prompts/templates/namespace-description.md`.
3. **Load Pre-Instructions** — Read `prompts/pre-instructions/namespace-description.md` (Files-to-Read = Namespace-Metadata + Domain-Knowledge-Doc).
4. **Load Output-Schema** — Read `prompts/output-schemas/namespace-description.schema.json`.
5. **Filter Questions** — Read `prompts/generated/questions.json`, filtere `area == "namespace-description"`.
6. **Load Persona (optional)** — `personaRequired: false` — Persona-Block bleibt leer.
7. **Load previous Grading (optional)** — Wenn `iteration > 1`: Lies `previousGradingPath`, extrahiere `improvementHints[]`.
8. **Build Prompt** — Rufe `PromptBuilder.build({ template, preInstructions, outputSchema, questions, persona: null, previousHints, namespacePath, iteration })` auf (PRD-04/P2d).
9. **Spawn Sub-Agent** — Per Bash: `claude --print --model inherit --max-turns 1 --output-format json --append-system-prompt "Sub-Agent: Strict-JSON only. No prose." -- <prompt>`. Read-only Tools. Frischer leerer Kontext.
10. **Validate Response** — Parse JSON. Validiere gegen `namespace-description.schema.json`. Bei Schema-Fail: `{ "blocker": "schema-validation", "reason": "<details>" }`.
11. **Hand-off** — Rufe `namespace-description-apply-improvement` (PRD-16) mit JSON + `iteration` + `namespacePath` + `personaSlug="neutral"` auf.

## Output

Strict-JSON gemaess `prompts/output-schemas/namespace-description.schema.json` mit Pflichtfeldern:

- `area: "namespace-description"` (literal-match)
- `iteration`: Integer
- `personaSlug: "neutral"`
- `gradings[]`: Frage-Antworten zur Namespace-Klarheit
- `improvementHints[]`: Hinweise fuer die naechste Iteration

Bei Blocker:

```json
{ "blocker": "<dateipfad-oder-stufe>", "reason": "<klartext>" }
```

## Recursive-Loop-Hand-off

Nach erfolgreicher Validierung Hand-off an `namespace-description-apply-improvement` (PRD-16) mit:

- `responseJson` — validierte JSON aus Schritt 10
- `iteration` — aktuelle Iteration (Default Start = 1)
- `namespacePath` — unveraendert
- `personaSlug` — `"neutral"` (Bereich 3 ist neutral, Kap 7.4)

`apply-improvement` entscheidet, ob eine naechste Iteration laeuft (`iteration < maxIterations`, Default 3, Kap 12) oder ob die finale Grading-Datei geschrieben wird.
