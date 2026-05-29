# Fragen-Katalog — Eintrags-Schema (v1.0.0)

> Quelle: Memo 082 Kap 5.1 (Eintrags-Schema), Kap 5.2 (Datei-Layout), Kap 6 (Deterministisch vs. Nicht-Deterministisch), Kap 7.1 (Acht Bereiche), Kap 7.4 (Persona-Anwendungs-Tabelle).
>
> Liefer-PRD: PRD-10 (Memo 082 Phase 2c).

---

## 1. Zweck

Dieses Dokument definiert das verbindliche Eintrags-Schema und Datei-Layout fuer
den Fragen-Katalog des Grading-Moduls. Alle Fragen werden als Markdown-Dateien mit
YAML-Frontmatter abgelegt; das Build-Skript `scripts/build-questions.mjs` (PRD-12)
aggregiert sie zu `prompts/generated/questions.json` und validiert sie gegen dieses
Schema.

Der Fragen-Katalog ist Bestandteil des Generator-Evaluator-Recursive-Feedback-Loops
(Memo 082 Kap 4). Er enthaelt 60-80 Fragen verteilt ueber 10 Bereiche (acht
Bereiche, davon Bereich 7 in L1/L2/L3 aufgesplittet).

---

## 2. Pflichtfelder (14)

Jede Frage hat genau 14 Pflichtfelder im YAML-Frontmatter:

| Feld | Typ | Format | Beispiel | Definition |
|------|-----|--------|----------|------------|
| `id` | string | `Q-<area>-<NN>` | `Q-single-test-01` | Eindeutige Frage-ID. Regex `^Q-[a-zA-Z0-9-]+-\d{2}$` (Uppercase erlaubt fuer `selection-skills-L1/L2/L3`). |
| `area` | enum | siehe 3. | `single-test` | Bereich-Slug aus der 10er-Liste. |
| `dimension` | enum | siehe 4. | `descriptionClarity` | Dimension aus P1-P7 / S1-S4 oder Memo-082-Erweiterung. |
| `question` | string | freier Text, max 500 Zeichen | `Ist die Tool-Description ohne Marketing-Begriffe?` | Die eigentliche Eval-Frage in Klartext. |
| `scoreType` | enum | `boolean`, `scale-1-5`, `percent` | `boolean` | Skalentyp der Antwort. |
| `weight` | number | 0.0 - 1.0 | `0.15` | Gewichtung innerhalb des `(area, tier)`-Buckets. |
| `determinism` | enum | `deterministic`, `non-deterministic`, `mixed` | `non-deterministic` | Klassifikation Kap 6 — bestimmt LLM-Pflicht. |
| `tier` | enum | siehe 4. | `P3` | P1-P7 (Single) oder S1-S4 (Selection). |
| `filesToRead` | array<string> | Pfad-Templates mit Platzhaltern | `["{{schemaPath}}", "{{aboutPath}}"]` | Pre-Instruction-Files (Kap 8). Mindestens 1 Eintrag. |
| `preInstructionRef` | string | relativer Pfad | `pre-instructions/single-test.md` | Verweis auf Pflicht-Block. |
| `evaluatorTask` | string | Imperativ, max 200 Zeichen | `Bewerte die Description auf Marketing-Sprache.` | Anweisung an Sub-Agent. |
| `outputSchemaRef` | string | relativer Pfad | `output-schemas/single-test.schema.json` | JSON-Schema fuer Antwort. |
| `personaRequired` | boolean | `true`/`false` | `false` | Persona-Anwendung; muss zu Kap 7.4 Mapping passen. |
| `version` | string | semver | `1.0.0` | Frage-Version fuer Aenderungs-Tracking. |

---

## 3. area-Enum (10 Werte)

Aus Memo 082 Kap 7.1 (8 Bereiche, Bereich 7 in L1/L2/L3 aufgesplittet):

| area-Slug | Sub-Template? | personaRequired (Default) |
|-----------|---------------|----------------------------|
| `single-test` | nein | false |
| `tools-aggregate-schema` | nein | false |
| `namespace-description` | nein | false |
| `tools-aggregate-namespace` | nein | false |
| `about-namespace` | nein | true |
| `about-selection` | nein | true |
| `selection-skills-L1` | ja (`selection-skills`) | true |
| `selection-skills-L2` | ja (`selection-skills`) | true |
| `selection-skills-L3` | ja (`selection-skills`) | true |
| `namespace-skills` | nein | true |

Persona-Anwendungs-Mapping aus Memo 082 Kap 7.4:

- Bereiche 1-4 = **Neutral** (`personaRequired: false`)
- Bereiche 5-8 = **MIT Persona** (`personaRequired: true`)

---

## 4. dimension-Enum + Tier-Mapping

Tier-Liste aus Memo 080 PRD-01 §5.1:

- **P1-P7** — Single-Dimensionen (tool-zentriert)
- **S1-S4** — Selection-Dimensionen (Coverage, Persona-Fit, Skill-Adequacy, Domain-Document-Alignment)

Memo 082 Kap 14.2 erweitert (in Phase 2c verbindlich):

- `namespaceDescriptionClarity` (Bereich 3, P-Bucket)
- `domainCoverage` (Bereich 4, P-Bucket)

Tier-Mapping pro area:

| area | tier-Bucket | Beispiel-Dimensionen |
|------|-------------|----------------------|
| `single-test` | P1, P2, P3 | descriptionClarity, paramConsistency, exampleQuality |
| `tools-aggregate-schema` | P4, P5 | routesCoherence, namingConsistency |
| `namespace-description` | P-bucket (Memo 082 Erweiterung) | namespaceDescriptionClarity |
| `tools-aggregate-namespace` | P-bucket | domainCoverage |
| `about-namespace` | P6, P7 | personaReference, valueProposition |
| `about-selection` | P6, P7 | personaReference, useCaseClarity |
| `selection-skills-L1` | S1, S2 | coverage, personaFit |
| `selection-skills-L2` | S2, S3 | personaFit, skillAdequacy |
| `selection-skills-L3` | S3, S4 | skillAdequacy, domainAlignment |
| `namespace-skills` | S3, S4 | skillAdequacy, domainAlignment |

Die exakten Dimensionen werden in PRD-11 pro Frage gesetzt (Kalibrierungs-Spielraum).

---

## 5. Datei-Layout-Konvention

```
prompts/questions/
├── deterministic/
│   ├── 01-docs-url-reachable.md
│   ├── 02-tool-executable.md
│   └── ...
├── non-deterministic/
│   ├── 01-description-clarity.md
│   ├── 02-persona-fit-about-namespace.md
│   └── ...
└── mixed/
    └── 01-output-schema-vs-response.md
```

Konvention:

- Pfad-Schablone: `prompts/questions/<dimension>/<NN>-<slug>.md`
- `<dimension>` = `deterministic` | `non-deterministic` | `mixed` (passend zum Feld `determinism`)
- `<NN>` = 01..99, lokal pro Unterordner aufsteigend, mit fuehrender Null
- `<slug>` = lowercase-kebab-case, max 50 Zeichen, keine Umlaute (`ae` statt `ä`)
- Filename matched Regex `^\d{2}-[a-z0-9-]+\.md$`

Begruendung: Sortierung nach `dimension` macht den Build-Output gruppierbar und
erlaubt dem Build-Test-Katalog (PRD-12), deterministische Fragen direkt mit
`flowmcp-core`-Tests zu mappen.

---

## 6. Frontmatter-Konvention

Jede Frage-Datei hat einen YAML-Frontmatter-Block am Dateianfang (zwischen
`---`-Markern) mit allen 14 Pflichtfeldern. Der Body danach ist OPTIONAL und
dient nur als Mensch-lesbare Erlaeuterung — das Build-Skript uebernimmt ihn
nicht in `questions.json`.

```yaml
---
id: Q-single-test-01
area: single-test
dimension: descriptionClarity
question: "Ist die Tool-Description ohne Marketing-Begriffe?"
scoreType: boolean
weight: 0.15
determinism: non-deterministic
tier: P3
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/single-test.md
evaluatorTask: "Bewerte die Description auf Marketing-Sprache (Buzzwords, Adjektive ohne Substanz)."
outputSchemaRef: output-schemas/single-test.schema.json
personaRequired: false
version: 1.0.0
---

## Begruendung

Marketing-Sprache verzerrt die User-Erwartung an das Tool. Eine Description sollte
deskriptiv sein ("Returns contract metadata"), nicht werblich ("Powerful contract API").

## Anti-Pattern

- "Powerful", "Advanced", "Easy-to-use" — keine technische Information
- Superlative ohne Beleg
```

---

## 7. Vollstaendige Beispiel-Frage

Die obenstehende Frage `Q-single-test-01` ist die vollstaendige Vorlage fuer alle
weiteren Fragen. Sie liegt physisch in `prompts/questions/non-deterministic/`
(siehe PRD-11).

---

## 8. Validierungs-Regeln (Vorgriff auf build-questions.mjs)

Das Build-Skript `scripts/build-questions.mjs` prueft pro Frage:

1. Alle 14 Pflichtfelder vorhanden (sonst `MISSING-FIELD`)
2. `id` matched Regex `^Q-[a-zA-Z0-9-]+-\d{2}$`
3. `area` in der 10er-Enum-Liste (Sektion 3)
4. `filesToRead` ist ein nicht-leeres Array
5. `personaRequired` muss zu Kap 7.4 Mapping passen (Bereiche 1-4 = false, 5-8 = true)
6. Die Summe der `weight`-Werte pro `(area, tier)`-Bucket liegt zwischen 0.95 und 1.05
   (Toleranz fuer Rundungs-Fehler)

Schlaegt eine Pruefung fehl, bricht das Build-Skript mit Exit-Code != 0 ab und
nennt den Frage-Pfad in der Fehler-Message.

---

## 9. Versionierung

- Schema-Version: `1.0.0` (dieses Dokument)
- Pro Frage: `version`-Feld im Frontmatter (semver)
- Schema-Breaking-Changes (z.B. neue Pflichtfelder) erhoehen die Schema-Major-Version
  und ziehen ein Sammel-Update aller Frage-`version`-Felder nach sich

---

## 10. Cross-Refs

- Eintrags-Schema-Quelle: Memo 082 Kap 5.1
- Datei-Layout-Quelle: Memo 082 Kap 5.2
- Determinism-Klassifikation: Memo 082 Kap 6
- Tier-Liste: Memo 080 PRD-01 §5.1
- Persona-Anwendung: Memo 082 Kap 7.4
- Fragen-Content (60-80 Fragen): PRD-11
- Build-Skript: PRD-12 (`scripts/build-questions.mjs`)
- Test-Catalog-Skript: PRD-12 (`scripts/build-test-catalog.mjs`)
