---
name: selection-skills-L2-start-grade
description: Startet eine Grading-Iteration fuer Bereich 7b (selection-skills-L2) — Persona-basierte Bewertung der L2-Skills einer Selection (Spec 13 §4.2). Laedt L2-Template, Pre-Instructions, gefilterte Fragen (area=selection-skills, tier=L2), das Output-Schema und die Persona (Pflicht). Ruft PromptBuilder.build auf, spawnt einen frischen Sub-Agent (Read-only, leerer Kontext, Strict-JSON) und validiert die Response gegen prompts/output-schemas/selection-skills-L2.schema.json. Initialisiert den Iterations-Counter und uebergibt an selection-skills-L2-apply-improvement (PRD-16). User-Caveat REV-04 — Bei Selection-Skills auf Komplexitaet achten (Mini-Praxis-Test P6 verifiziert Token-Budget).
allowed-tools: Read, Bash, Grep
model: inherit
---

## Input

Parameter (vom Aufrufer per Tool-Call uebergeben):

| Parameter | Pflicht | Format | Beispiel |
|-----------|---------|--------|----------|
| `selectionPath` | ja | Absoluter Pfad zur Selection (mit Selection-Lock + L2-Skill-Datei) | `/.../grading-data/selection/crypto-mini/` |
| `personaSlug` | **ja (Pflicht, Spec 13 §4.2)** | `<basePersona>--<lens>` | `decision-maker--crypto-trader` |
| `iteration` | nein (Default 1) | Integer 1..N | `1` |
| `previousGradingPath` | nur ab Iteration 2 | Absoluter Pfad | `/.../grading-data/selection/.../gradings/abc--ts--decision-maker--crypto-trader.json` |

**Persona-Anwendung (Kap 7.4):** `personaRequired: true` — Pflicht laut Spec 13 §4.2.

## Ablauf

1. **Validate Inputs** — `selectionPath` existiert. `personaSlug` ist gesetzt. Bei Fehler: `{ "blocker": "personaSlug", "reason": "missing — personaRequired: true (Spec 13 §4.2)" }`.
2. **Load Template** — Read `prompts/templates/selection-skills-L2.md`.
3. **Load Pre-Instructions** — Read `prompts/pre-instructions/selection-skills-L2.md` (Files-to-Read = Selection-Lock + Domain-Knowledge-Doc + Base-Persona).
4. **Load Output-Schema** — Read `prompts/output-schemas/selection-skills-L2.schema.json`.
5. **Filter Questions** — Read `prompts/generated/questions.json`, filtere `area == "selection-skills" && tier == "L2"`.
6. **Load Persona (Pflicht)** — Splitte `personaSlug` in `<basePersona>--<lens>`. Read Base-Persona aus `repos/flowmcp-spec/personas/<basePersona>.md`. Read Lens-Helper aus `flowmcp-grading/grading-data/personas/<lens>-<YYYY>.md`.
7. **Load previous Grading (optional)** — Wenn `iteration > 1`: Lies `previousGradingPath`, extrahiere `improvementHints[]`.
8. **Build Prompt** — Rufe `PromptBuilder.build({ template, preInstructions, outputSchema, questions, persona: { base, lens }, previousHints, selectionPath, iteration, tier: "L2" })` auf (PRD-04/P2d).
9. **Spawn Sub-Agent** — Per Bash: `claude --print --model inherit --max-turns 1 --output-format json --append-system-prompt "Sub-Agent: Strict-JSON only. No prose." -- <prompt>`. Read-only Tools. Frischer leerer Kontext.
10. **Validate Response** — Parse JSON. Validiere gegen `selection-skills-L2.schema.json`. Bei Schema-Fail: `{ "blocker": "schema-validation", "reason": "<details>" }`.
11. **Hand-off** — Rufe `selection-skills-L2-apply-improvement` (PRD-16) mit JSON + `iteration` + `selectionPath` + `personaSlug` auf.

## Output

Strict-JSON gemaess `prompts/output-schemas/selection-skills-L2.schema.json` mit Pflichtfeldern:

- `area: "selection-skills"` (literal-match) + `tier: "L2"`
- `iteration`: Integer
- `personaSlug`: `<basePersona>--<lens>` (Kap 13)
- `gradings[]`: Persona-spezifische L2-Skill-Bewertungen
- `improvementHints[]`: Hinweise fuer die naechste Iteration

Bei Blocker:

```json
{ "blocker": "<dateipfad-oder-stufe>", "reason": "<klartext>" }
```

## Recursive-Loop-Hand-off

Nach erfolgreicher Validierung Hand-off an `selection-skills-L2-apply-improvement` (PRD-16) mit:

- `responseJson` — validierte JSON aus Schritt 10
- `iteration` — aktuelle Iteration (Default Start = 1)
- `selectionPath` — unveraendert
- `personaSlug` — unveraendert (`<basePersona>--<lens>`)

`apply-improvement` entscheidet, ob eine naechste Iteration laeuft (`iteration < maxIterations`, Default 3, Kap 12) oder ob die finale Grading-Datei geschrieben wird. **User-Caveat REV-04:** Selection-Skills sind komplexer — Mini-Praxis-Test (Phase 6) verifiziert Token-/Zeit-Verbrauch.

## Recursive-Feedback-Loop (Mikro-Loop, Kap 12)

Nach dem ersten Evaluator-Call laeuft die Schleife:

1. **Parse JSON-Response** des Evaluator-Skills strikt gegen
   `prompts/output-schemas/selection-skills-L2.schema.json`. Bei Parse-Fehler ODER
   gesetztem `blocker`-Feld: Loop sofort beenden, finale Antwort
   speichern (PRD-20), `iteration` auf Wert des letzten Calls setzen.
2. **Abbruch-Check** (vor jeder neuen Iteration):
   - `improvementHints` leer? -> Loop fertig.
   - `iteration >= N`? -> Loop fertig.
   - sonst: weiter mit Schritt 3.
3. **Re-Invoke** `evaluate` mit Zusatz-Kontext:
   - Vorherige Evaluator-Antwort wird in einem `## Previous Response`-Block
     in den Prompt eingefuegt (Volltext, nicht zusammengefasst).
   - `improvementHints[]` werden in einem `## Improvement Hints`-Block
     vorangestellt mit der expliziten Aufforderung „adressiere jeden Hint
     und verbessere die Antwort entsprechend".
   - Fragen-Set, Files-to-Read, Persona-Block (falls vorhanden),
     Output-Schema bleiben **unveraendert** — Partial-Konsistenz
     (Kap 12.6): pro Call IMMER alle Fragen des Bereichs/Sub-Bereichs.
4. **Iteration erhoehen** (`iteration += 1`), zurueck zu Schritt 1.

### Iterations-Default

`N = 3` (Default). Begruendung: Kap 12 (Recommended 2-3x). Real-World-
Kosten (Token/Zeit) werden in Phase 6 (Mini-Praxis-Test) verifiziert —
**Caveat F15** (Kap 4.4). Override moeglich via Aufruf-Parameter
`maxIterations` (falls vom Caller gesetzt, sonst Default greift).

### Abbruch-Bedingungen

| Bedingung | Aktion |
|-----------|--------|
| `improvementHints[]` leer | Save finale Antwort, Loop fertig |
| `iteration >= N` | Save aktuelle Antwort, Loop fertig |
| `blocker`-Feld gesetzt | Save Blocker-Antwort, Loop fertig |
| Parse-Fehler | Save Roh-Antwort, Loop fertig |

## Partial vs. Full (Kap 12.6)

Pro Sub-Agent-Call werden IMMER alle Fragen eines Bereichs (oder bei
Bereich 7 alle Fragen eines Sub-Bereichs L1/L2/L3) beantwortet. Partial-
Grading ist eine Teilmenge der **Bereiche** auf Aufruf-Ebene, niemals
eine Teilmenge der Fragen innerhalb eines Bereichs. Der Loop aendert
diese Invariante nicht — jede Iteration beantwortet erneut alle Fragen
des Bereichs.

## Save (Hinweis auf PRD-20 + PRD-21)

Die finale Antwort wird via `src/Grading.mjs#createEntry({...})` persistiert. Pflichtfelder fuer Phase-2h-Eintraege:

- `iteration` (integer, 0-basiert beim ersten Call, erhoeht pro Loop-Durchgang)
- `improvementHints` (string[], aus der letzten Evaluator-Antwort)
- `persona` (string, `<basePersona>--<lens>` oder `'neutral'`)

Filename folgt der Konvention aus PRD-21:
`<schemaHash>--<timestamp>--<persona-slug>.json` — gebildet via
`Grading.formatGradingFilename({ hash, ts, persona })`, NIE per
String-Concat.

Speicherort (gitignored, Kap 4.6):
`grading-data/selection/<sel>/gradings/...`

## Cross-Refs

- **PRD-14** — Generator-Skill-Familie (Basis-Struktur)
- **PRD-15** — Evaluator-Skill (`selection-skills-L2-evaluate`), wird hier orchestriert
- **PRD-20** — `gradings/*.json` Eintrags-Schema (`iteration`, `improvementHints`, `persona`)
- **PRD-21** — Persona-Slug-Filename-Konvention (`Grading.formatGradingFilename`)
- **Caveat F15** — Token/Zeit-Verbrauch wird in Phase 6 (Mini-Praxis-Test) verifiziert
