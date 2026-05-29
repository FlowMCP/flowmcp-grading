---
name: selection-skills-L3-start-grade
description: Startet eine Grading-Iteration fuer Bereich 7c (selection-skills-L3) — Persona-basierte Bewertung der L3-Skills einer Selection (Spec 13 §4.2). Laedt L3-Template, Pre-Instructions, gefilterte Fragen (area=selection-skills, tier=L3), das Output-Schema und die Persona (Pflicht). Ruft PromptBuilder.build auf, spawnt einen frischen Sub-Agent (Read-only, leerer Kontext, Strict-JSON) und validiert die Response gegen prompts/output-schemas/selection-skills-L3.schema.json. Initialisiert den Iterations-Counter und uebergibt an selection-skills-L3-apply-improvement (PRD-16). User-Caveat REV-04 — Bei Selection-Skills auf Komplexitaet achten (Mini-Praxis-Test P6 verifiziert Token-Budget).
allowed-tools: Read, Bash, Grep
model: inherit
---

## Input

Parameter (vom Aufrufer per Tool-Call uebergeben):

| Parameter | Pflicht | Format | Beispiel |
|-----------|---------|--------|----------|
| `selectionPath` | ja | Absoluter Pfad zur Selection (mit Selection-Lock + L3-Skill-Datei) | `/.../grading-data/selection/crypto-mini/` |
| `personaSlug` | **ja (Pflicht, Spec 13 §4.2)** | `<basePersona>--<lens>` | `decision-maker--crypto-trader` |
| `iteration` | nein (Default 1) | Integer 1..N | `1` |
| `previousGradingPath` | nur ab Iteration 2 | Absoluter Pfad | `/.../grading-data/selection/.../gradings/abc--ts--decision-maker--crypto-trader.json` |

**Persona-Anwendung (Kap 7.4):** `personaRequired: true` — Pflicht laut Spec 13 §4.2.

## Ablauf

1. **Validate Inputs** — `selectionPath` existiert. `personaSlug` ist gesetzt. Bei Fehler: `{ "blocker": "personaSlug", "reason": "missing — personaRequired: true (Spec 13 §4.2)" }`.
2. **Load Template** — Read `prompts/templates/selection-skills-L3.md`.
3. **Load Pre-Instructions** — Read `prompts/pre-instructions/selection-skills-L3.md` (Files-to-Read = Selection-Lock + Domain-Knowledge-Doc + Base-Persona).
4. **Load Output-Schema** — Read `prompts/output-schemas/selection-skills-L3.schema.json`.
5. **Filter Questions** — Read `prompts/generated/questions.json`, filtere `area == "selection-skills" && tier == "L3"`.
6. **Load Persona (Pflicht)** — Splitte `personaSlug` in `<basePersona>--<lens>`. Read Base-Persona aus `repos/flowmcp-spec/personas/<basePersona>.md`. Read Lens-Helper aus `flowmcp-grading/grading-data/personas/<lens>-<YYYY>.md`.
7. **Load previous Grading (optional)** — Wenn `iteration > 1`: Lies `previousGradingPath`, extrahiere `improvementHints[]`.
8. **Build Prompt** — Rufe `PromptBuilder.build({ template, preInstructions, outputSchema, questions, persona: { base, lens }, previousHints, selectionPath, iteration, tier: "L3" })` auf (PRD-04/P2d).
9. **Spawn Sub-Agent** — Per Bash: `claude --print --model inherit --max-turns 1 --output-format json --append-system-prompt "Sub-Agent: Strict-JSON only. No prose." -- <prompt>`. Read-only Tools. Frischer leerer Kontext.
10. **Validate Response** — Parse JSON. Validiere gegen `selection-skills-L3.schema.json`. Bei Schema-Fail: `{ "blocker": "schema-validation", "reason": "<details>" }`.
11. **Hand-off** — Rufe `selection-skills-L3-apply-improvement` (PRD-16) mit JSON + `iteration` + `selectionPath` + `personaSlug` auf.

## Output

Strict-JSON gemaess `prompts/output-schemas/selection-skills-L3.schema.json` mit Pflichtfeldern:

- `area: "selection-skills"` (literal-match) + `tier: "L3"`
- `iteration`: Integer
- `personaSlug`: `<basePersona>--<lens>` (Kap 13)
- `gradings[]`: Persona-spezifische L3-Skill-Bewertungen
- `improvementHints[]`: Hinweise fuer die naechste Iteration

Bei Blocker:

```json
{ "blocker": "<dateipfad-oder-stufe>", "reason": "<klartext>" }
```

## Recursive-Loop-Hand-off

Nach erfolgreicher Validierung Hand-off an `selection-skills-L3-apply-improvement` (PRD-16) mit:

- `responseJson` — validierte JSON aus Schritt 10
- `iteration` — aktuelle Iteration (Default Start = 1)
- `selectionPath` — unveraendert
- `personaSlug` — unveraendert (`<basePersona>--<lens>`)

`apply-improvement` entscheidet, ob eine naechste Iteration laeuft (`iteration < maxIterations`, Default 3, Kap 12) oder ob die finale Grading-Datei geschrieben wird. **User-Caveat REV-04:** Selection-Skills sind komplexer — Mini-Praxis-Test (Phase 6) verifiziert Token-/Zeit-Verbrauch.
