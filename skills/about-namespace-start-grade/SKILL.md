---
name: about-namespace-start-grade
description: Startet eine Grading-Iteration fuer Bereich 5 (about-namespace) — Persona-basierte Bewertung der About-Page eines Namespaces. Laedt Template, Pre-Instructions, gefilterte Fragen (area=about-namespace), das Output-Schema und die Persona (Pflicht). Ruft PromptBuilder.build auf, spawnt einen frischen Sub-Agent (Read-only, leerer Kontext, Strict-JSON) und validiert die Response gegen prompts/output-schemas/about-namespace.schema.json. Initialisiert den Iterations-Counter und uebergibt an about-namespace-apply-improvement (PRD-16). Persona-Anwendung gemaess Memo 082 Kap 7.4 — Bereich 5 ist MIT Persona (personaRequired: true), Spec 11 §4 verlangt Persona-Reference im About-Content.
allowed-tools: Read, Bash, Grep
model: inherit
---

## Input

Parameter (vom Aufrufer per Tool-Call uebergeben):

| Parameter | Pflicht | Format | Beispiel |
|-----------|---------|--------|----------|
| `namespacePath` | ja | Absoluter Pfad zum Namespace-Ordner | `/.../schemas-private/v3/etherscan/` |
| `personaSlug` | **ja** (Bereich 5 mit Persona, Kap 7.4) | `<basePersona>--<lens>` | `decision-maker--crypto-trader` |
| `iteration` | nein (Default 1) | Integer 1..N | `1` |
| `previousGradingPath` | nur ab Iteration 2 | Absoluter Pfad | `/.../grading-data/namespace/.../gradings/abc--ts--decision-maker--crypto-trader.json` |

**Persona-Anwendung (Kap 7.4):** `personaRequired: true` — Bereich 5 MUSS mit Persona laufen. F18 = A bestaetigt REV-05.

## Ablauf

1. **Validate Inputs** — `namespacePath` existiert. `personaSlug` ist gesetzt (Pflicht). Bei Fehler: `{ "blocker": "personaSlug", "reason": "missing — personaRequired: true" }`.
2. **Load Template** — Read `prompts/templates/about-namespace.md`.
3. **Load Pre-Instructions** — Read `prompts/pre-instructions/about-namespace.md` (Files-to-Read = About-Page-File + Domain-Knowledge-Doc).
4. **Load Output-Schema** — Read `prompts/output-schemas/about-namespace.schema.json`.
5. **Filter Questions** — Read `prompts/generated/questions.json`, filtere `area == "about-namespace"`.
6. **Load Persona (Pflicht)** — Splitte `personaSlug` in `<basePersona>--<lens>`. Read Base-Persona aus `repos/flowmcp-spec/personas/<basePersona>.md` (Spec 12 §1). Read Lens-Helper aus `flowmcp-grading/grading-data/personas/<lens>-<YYYY>.md` (Kap 5.4).
7. **Load previous Grading (optional)** — Wenn `iteration > 1`: Lies `previousGradingPath`, extrahiere `improvementHints[]`.
8. **Build Prompt** — Rufe `PromptBuilder.build({ template, preInstructions, outputSchema, questions, persona: { base, lens }, previousHints, namespacePath, iteration })` auf (PRD-04/P2d).
9. **Spawn Sub-Agent** — Per Bash: `claude --print --model inherit --max-turns 1 --output-format json --append-system-prompt "Sub-Agent: Strict-JSON only. No prose." -- <prompt>`. Read-only Tools. Frischer leerer Kontext.
10. **Validate Response** — Parse JSON. Validiere gegen `about-namespace.schema.json`. Bei Schema-Fail: `{ "blocker": "schema-validation", "reason": "<details>" }`.
11. **Hand-off** — Rufe `about-namespace-apply-improvement` (PRD-16) mit JSON + `iteration` + `namespacePath` + `personaSlug` auf.

## Output

Strict-JSON gemaess `prompts/output-schemas/about-namespace.schema.json` mit Pflichtfeldern:

- `area: "about-namespace"` (literal-match)
- `iteration`: Integer
- `personaSlug`: `<basePersona>--<lens>` (Kap 13)
- `gradings[]`: Persona-spezifische Frage-Antworten zur About-Page
- `improvementHints[]`: Hinweise fuer die naechste Iteration

Bei Blocker:

```json
{ "blocker": "<dateipfad-oder-stufe>", "reason": "<klartext>" }
```

## Recursive-Loop-Hand-off

Nach erfolgreicher Validierung Hand-off an `about-namespace-apply-improvement` (PRD-16) mit:

- `responseJson` — validierte JSON aus Schritt 10
- `iteration` — aktuelle Iteration (Default Start = 1)
- `namespacePath` — unveraendert
- `personaSlug` — unveraendert (`<basePersona>--<lens>`)

`apply-improvement` entscheidet, ob eine naechste Iteration laeuft (`iteration < maxIterations`, Default 3, Kap 12) oder ob die finale Grading-Datei geschrieben wird.
