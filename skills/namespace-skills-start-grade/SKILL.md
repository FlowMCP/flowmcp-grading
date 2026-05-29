---
name: namespace-skills-start-grade
description: Startet eine Grading-Iteration fuer Bereich 8 (namespace-skills) — Persona-basierte Bewertung des Namespace-Skills eines Namespaces (Spec 13 §3). Laedt Template, Pre-Instructions, gefilterte Fragen (area=namespace-skills), das Output-Schema und die Persona (Default Recommended). Ruft PromptBuilder.build auf, spawnt einen frischen Sub-Agent (Read-only, leerer Kontext, Strict-JSON) und validiert die Response gegen prompts/output-schemas/namespace-skills.schema.json. Initialisiert den Iterations-Counter und uebergibt an namespace-skills-apply-improvement (PRD-16). Persona-Anwendung gemaess Memo 082 Kap 7.4 — Bereich 8 ist MIT Persona (personaRequired: true, Default per Spec 13 §3.1 Recommendation).
allowed-tools: Read, Bash, Grep
model: inherit
---

## Input

Parameter (vom Aufrufer per Tool-Call uebergeben):

| Parameter | Pflicht | Format | Beispiel |
|-----------|---------|--------|----------|
| `namespacePath` | ja | Absoluter Pfad zum Namespace-Ordner | `/.../schemas-private/v3/etherscan/` |
| `personaSlug` | **ja (Default Recommended, Spec 13 §3.1)** | `<basePersona>--<lens>` | `decision-maker--crypto-trader` |
| `iteration` | nein (Default 1) | Integer 1..N | `1` |
| `previousGradingPath` | nur ab Iteration 2 | Absoluter Pfad | `/.../grading-data/namespace/.../gradings/abc--ts--decision-maker--crypto-trader.json` |

**Persona-Anwendung (Kap 7.4):** `personaRequired: true` — Default Recommended per Spec 13 §3.1.

## Ablauf

1. **Validate Inputs** — `namespacePath` existiert. `personaSlug` ist gesetzt. Bei Fehler: `{ "blocker": "personaSlug", "reason": "missing — personaRequired: true (Default Recommended)" }`.
2. **Load Template** — Read `prompts/templates/namespace-skills.md`.
3. **Load Pre-Instructions** — Read `prompts/pre-instructions/namespace-skills.md` (Files-to-Read = Namespace-Schemas + Domain-Knowledge-Doc + Base-Persona).
4. **Load Output-Schema** — Read `prompts/output-schemas/namespace-skills.schema.json`.
5. **Filter Questions** — Read `prompts/generated/questions.json`, filtere `area == "namespace-skills"`.
6. **Load Persona (Pflicht-Default)** — Splitte `personaSlug` in `<basePersona>--<lens>`. Read Base-Persona aus `repos/flowmcp-spec/personas/<basePersona>.md`. Read Lens-Helper aus `flowmcp-grading/grading-data/personas/<lens>-<YYYY>.md`.
7. **Load previous Grading (optional)** — Wenn `iteration > 1`: Lies `previousGradingPath`, extrahiere `improvementHints[]`.
8. **Build Prompt** — Rufe `PromptBuilder.build({ template, preInstructions, outputSchema, questions, persona: { base, lens }, previousHints, namespacePath, iteration })` auf (PRD-04/P2d).
9. **Spawn Sub-Agent** — Per Bash: `claude --print --model inherit --max-turns 1 --output-format json --append-system-prompt "Sub-Agent: Strict-JSON only. No prose." -- <prompt>`. Read-only Tools. Frischer leerer Kontext.
10. **Validate Response** — Parse JSON. Validiere gegen `namespace-skills.schema.json`. Bei Schema-Fail: `{ "blocker": "schema-validation", "reason": "<details>" }`.
11. **Hand-off** — Rufe `namespace-skills-apply-improvement` (PRD-16) mit JSON + `iteration` + `namespacePath` + `personaSlug` auf.

## Output

Strict-JSON gemaess `prompts/output-schemas/namespace-skills.schema.json` mit Pflichtfeldern:

- `area: "namespace-skills"` (literal-match)
- `iteration`: Integer
- `personaSlug`: `<basePersona>--<lens>` (Kap 13)
- `gradings[]`: Persona-spezifische Namespace-Skill-Bewertungen
- `improvementHints[]`: Hinweise fuer die naechste Iteration

Bei Blocker:

```json
{ "blocker": "<dateipfad-oder-stufe>", "reason": "<klartext>" }
```

## Recursive-Loop-Hand-off

Nach erfolgreicher Validierung Hand-off an `namespace-skills-apply-improvement` (PRD-16) mit:

- `responseJson` — validierte JSON aus Schritt 10
- `iteration` — aktuelle Iteration (Default Start = 1)
- `namespacePath` — unveraendert
- `personaSlug` — unveraendert (`<basePersona>--<lens>`)

`apply-improvement` entscheidet, ob eine naechste Iteration laeuft (`iteration < maxIterations`, Default 3, Kap 12) oder ob die finale Grading-Datei geschrieben wird.
