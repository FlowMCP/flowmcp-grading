# Output-Schema to gradings[] — Field Mapping

| Field | Value |
|-------|-------|
| Status | Implementation-Reference |
| Source | PRD-09 (Memo 082 Phase 2e) |
| Targets | `prompts/output-schemas/_master.schema.json`, `flowmcp-spec/grading/1.1.0/08-grading-model.md` |

This document maps every field of the Evaluator-Response Master Envelope (and
of the per-area schemas) onto the durable grading entry defined in Spec 08.
Implementers of the Generator-Skills (`*-apply-improvement`) and the
Recursive-Loop-Engine (Memo 082 Phase 2h) MUST consult this document when
translating an Evaluator response into a Spec-08-conformant grading entry.

---

## Master-Envelope Mapping

The Master envelope (`prompts/output-schemas/_master.schema.json#/$defs/envelope`)
carries every metadata field that the loop generator needs to address an
evaluator response. The table below maps each envelope field to its
destination in a Spec-08-conformant `<gradingId>.json` file or to a sidecar
location.

| Output-Schema-Feld | Typ | Mapping auf Spec 08 | Notiz |
|--------------------|-----|---------------------|-------|
| `gradingId` | `string` (`<hash>--<ts>`) | Top-Level `gradingId` (Spec 08 §3.X) | 1:1 Pass-Through. Pattern aus Spec 19 §17. |
| `schemaHash` | `string` (8-hex) | Top-Level `schemaHash` (Spec 08 §3.X) | 1:1 Pass-Through. 8-Hex-Prefix des sha256 ueber kanonisches Schema-JSON. |
| `area` | enum (10 Bereiche) | **Intentionally unmapped** auf Top-Level | Wirkt nur als Routing-Schluessel im Generator; pro-`gradings[i]` wirken die area-spezifischen `dimension`-Werte. Siehe §4.6 (area → dimension). |
| `iteration` | `integer` 1–5 | **Sidecar** (`gradings/<gradingId>.loop.json`) | Spec 08 hat heute kein `iteration`-Feld; vorgesehen in Memo 082 Kap 14.2 (Spec-Erweiterungs-Vorschlaege, out-of-scope). |
| `timestamp` | `string` ISO-8601 | Top-Level `gradings[i].timestamp` (Spec 08 §4) | Pass-Through pro Antwort-Element. |
| `persona` | `null` ODER `{ basePersonaId, lensId }` | `gradings[i].selectionContext.personaIds[]` + Sidecar-Lens | Split: basePersona → personaIds (Spec 08 §4.X), lensId → Sidecar (Spec 12 §4 Lens noch nicht in §4 abgebildet). Siehe §4.4. |
| `answers[]` | Array of `answer` | `gradings[]` Array (Spec 08 §4) | 1:N Expansion (siehe §4.3). |
| `improvementHints[]` | Array of `improvementHint` | **Sidecar** (`gradings/<gradingId>.loop.json`) | Spec 08 hat kein Hint-Feld; ausschliesslich loop-intern. Persistiert nur fuer Generator-Diagnose. |

---

## `answer`-Element Mapping

Each element of `answers[]` (Master `$defs.answer`) becomes one element of
`gradings[]` (Spec 08 §4). The five answer-level fields map as follows:

| Output-Schema-Feld | Typ | Mapping auf Spec 08 `gradings[i]` | Notiz |
|--------------------|-----|------------------------------------|-------|
| `questionId` | `string` (`Q-<area>-NN`) | **Intentionally unmapped** — Question-ID wird in `dimension` aufgeloest | Generator uebersetzt Question-ID → `dimension`-Enum-Wert via `prompts/generated/questions.json` Lookup. Die Question-ID selbst persistiert nicht. |
| `score` | `number` 1.0–5.0 ODER enum | `gradings[i].score` | 1:1 Pass-Through, Spec 08 §5.2 Enum-Set identisch (`pass`/`fail`/`stale`/`n/a`). |
| `reasoning` | `string` | `gradings[i].reasoning` | 1:1 Pass-Through. |
| `evidence` | `string` \| `object` | `gradings[i].evidence` | 1:1 Pass-Through. Optional — beide Schemas erlauben das Feld als optional. |
| `naReason` | enum (6 Werte) | `gradings[i].naReason` | 1:1 Pass-Through, geschlossene Menge identisch (Spec 08 §5.3). Pflicht wenn `score = "n/a"` — durch Master-Schema `if/then` enforced. |

### Derived Fields (Generator-Added)

Die folgenden Spec-08-Felder werden vom Generator deterministisch aus dem
Question-Katalog (PRD-06) bzw. der Sub-Agent-Konfiguration ergaenzt, **nicht**
vom Evaluator geliefert:

| Feld | Quelle | Wert |
|------|--------|------|
| `gradings[i].dimension` | Question-ID-Lookup | aus `prompts/generated/questions.json` (Feld `dimension`) |
| `gradings[i].weight` | Question-Katalog | aus `prompts/generated/questions.json` (Feld `weight`, Default 1.0) |
| `gradings[i].determinism` | Question-Katalog | `non-deterministic` (Evaluator ist immer LLM) — alternativ Wert aus questions.json |
| `gradings[i].graderIdentity` | Generator | `{ kind: "llm", name: "<modelName>", version: "<version>" }` |
| `gradings[i].llmModel` | Generator | `<modelName>` (aus Sub-Agent-Konfiguration) |
| `gradings[i].selectionContext` | Output-Schema `persona` | `{ groupId: <area>, personaIds: [basePersonaId], domainDocId: <domainDoc-aus-PRD-07> }` |

---

## `persona`-Feld — Split + Sidecar

Spec 12 §4 definiert das Lens-Konzept (Domain-spezifische Verschaerfung einer
Base-Persona). Spec 08 §4 `selectionContext.personaIds[]` traegt aber nur
**Base-Persona-IDs** — keine Lens-Information.

Loesung — Split:

| Sub-Feld | Mapping |
|----------|---------|
| `persona.basePersonaId` | → `gradings[i].selectionContext.personaIds[0]` |
| `persona.lensId` | → Sidecar `gradings/<gradingId>.loop.json` Feld `persona.lensId` |

Datei-Naming-Konvention (Memo 082 Kap 13): `<basePersonaId>--<lensId>` oder
`neutral` — der Filename ist die kompakte Repraesentation, die Sidecar-JSON die
vollstaendige.

---

## Sidecar-Datei: `<gradingId>.loop.json`

Loop-Provenance-Felder, die Spec 08 (heute) nicht abbildet, leben in einer
**Sidecar-Datei** neben dem Grading-Artefakt:

```
grading-data/single/<ns>--<tool>/gradings/
+- <gradingId>.json          (Spec-08-konform)
+- <gradingId>.loop.json     (Sidecar, Loop-Provenance)
```

**Sidecar-Inhalt:**

```json
{
    "gradingId": "a1b2c3d4--2026-05-29T15-34Z",
    "iteration": 2,
    "improvementHints": [
        {
            "targetField": "schema.description",
            "suggestion": "Add concrete trigger sentence for the balance-lookup use case.",
            "priority": "high"
        }
    ],
    "persona": {
        "basePersonaId": "decision-maker",
        "lensId": "crypto-trader"
    },
    "loopHistory": [
        { "iteration": 1, "completedAt": "2026-05-29T15-30Z" },
        { "iteration": 2, "completedAt": "2026-05-29T15-34Z" }
    ]
}
```

Die Sidecar-Datei ist **gitignored** wie der Rest von `grading-data/`
(Memo 082 Kap 4.6 — gitignored Arbeits-Folder).

Begruendung Sidecar statt Spec-08-Erweiterung **heute**: Memo 082 Kap 14.2 hat
den Iterations-Counter explizit als **out-of-scope** Spec-Erweiterung markiert
(Folge-Memo). Bis dahin lebt die Information in der Sidecar — die Spec-08-Datei
bleibt strikt konform.

---

## area → dimension-Auswahl (Bereich-spezifisch)

Spec 08 §5.1.1 listet 17 Single-Dimensionen + §5.1.2 listet 4
Selection-Dimensionen. Pro Output-Schema-Bereich beschraenkt sich der
Generator auf eine **Teilmenge** dieser Dimensionen:

| Bereich (Output-Schema) | Erlaubte Spec-08-Dimensionen (`gradings[i].dimension`) | Tier |
|--------------------------|---------------------------------------------------------|------|
| `single-test` | `docsUrlReachable`, `outputSchemaMatch`, `apiKeyDomainMatch`, `whenToUse`, `parameters`, `outputSchemaConformance`, `descriptionNeutrality`, `completeness`, `formattingCompliance`, `apiAvailability` | `autonomous` |
| `tools-aggregate-schema` | `routesUniqueNames`, `outputSchemaConformance`, `completeness`, `descriptionNeutrality` | `autonomous` |
| `namespace-description` | `descriptionNeutrality`, `completeness`, `personaUseCaseFit` (Ersatz fuer geplante `namespaceDescriptionClarity` — Memo 14.2 out-of-scope) | `autonomous` |
| `tools-aggregate-namespace` | `domainCoverage`, `domainConformance`, `completeness` | `autonomous` |
| `about-namespace` | `aboutConventionCompliance`, `personaUseCaseFit` | `autonomous` |
| `about-selection` | `aboutConventionCompliance`, `personaUseCaseFit` | `group-bound` |
| `selection-skills-L1` | `selectionSkillL1` | `group-bound` |
| `selection-skills-L2` | `selectionSkillL2` | `group-bound` |
| `selection-skills-L3` | `selectionSkillL3` | `group-bound` |
| `namespace-skills` | `namespaceSkillValidity` | `autonomous` |

**Konsequenz:** Der Generator setzt `gradingTier` und `maxAttainableGrade`
(Spec 08 §8) deterministisch aus dem Output-Schema-`area`-Feld:

| `area` | `gradingTier` | `maxAttainableGrade` |
|--------|---------------|----------------------|
| `single-test` | `autonomous` | `B` |
| `tools-aggregate-schema` | `autonomous` | `B` |
| `namespace-description` | `autonomous` | `B` |
| `tools-aggregate-namespace` | `autonomous` | `B` |
| `about-namespace` | `autonomous` | `B` |
| `namespace-skills` | `autonomous` | `B` |
| `about-selection` | `group-bound` | `A` |
| `selection-skills-L1` | `group-bound` | `A` |
| `selection-skills-L2` | `group-bound` | `A` |
| `selection-skills-L3` | `group-bound` | `A` |

---

## Beispiel-Transformation

### Sub-Agent-Antwort (Output-Schema konform)

```json
{
    "gradingId": "a1b2c3d4--2026-05-29T15-34Z",
    "schemaHash": "a1b2c3d4",
    "area": "single-test",
    "iteration": 2,
    "timestamp": "2026-05-29T15:34:00Z",
    "persona": null,
    "answers": [
        {
            "questionId": "Q-single-test-04",
            "score": 4.0,
            "reasoning": "whenToUse-Beschreibung enthaelt klaren Trigger-Satz."
        }
    ],
    "improvementHints": [
        {
            "targetField": "schema.description",
            "suggestion": "Add reference to crypto-trader persona use case.",
            "priority": "medium"
        }
    ]
}
```

### Generator-Output — Spec-08-Datei `<gradingId>.json`

```json
{
    "gradingId": "a1b2c3d4--2026-05-29T15-34Z",
    "schemaId": "etherscan.getBalance",
    "schemaHash": "a1b2c3d4",
    "schemaVersion": "1.0.0",
    "version": "4.0.0",
    "gradingMode": "partial",
    "aboutHash": "ef56gh78",
    "gradingTier": "autonomous",
    "scoringSystem": "scoringSystem/1.0.0",
    "gradingSystem": "gradingSystem/1.0.0",
    "gradings": [
        {
            "dimension": "whenToUse",
            "score": 4.0,
            "weight": 1.0,
            "determinism": "non-deterministic",
            "graderIdentity": {
                "kind": "llm",
                "name": "claude-opus-4-7",
                "version": "1m"
            },
            "llmModel": "claude-opus-4-7",
            "selectionContext": {
                "groupId": "single-test",
                "personaIds": [],
                "domainDocId": "n/a"
            },
            "timestamp": "2026-05-29T15:34:00Z",
            "reasoning": "whenToUse-Beschreibung enthaelt klaren Trigger-Satz."
        }
    ],
    "categoricalVeto": null,
    "aggregateGrade": "B",
    "maxAttainableGrade": "B"
}
```

### Generator-Output — Sidecar `<gradingId>.loop.json`

```json
{
    "gradingId": "a1b2c3d4--2026-05-29T15-34Z",
    "iteration": 2,
    "improvementHints": [
        {
            "targetField": "schema.description",
            "suggestion": "Add reference to crypto-trader persona use case.",
            "priority": "medium"
        }
    ],
    "persona": null
}
```

---

## Intentionally-Unmapped Fields

Felder des Output-Schemas, die **bewusst** nicht direkt auf Spec 08 gehen:

| Feld | Grund |
|------|-------|
| `area` (Top-Level) | Routing-Schluessel; im persistierten Artefakt sind die `dimension`-Werte der `gradings[i]` ausreichend. |
| `questionId` | Compose-Time-Identifier; nach Aufloesung in `dimension` semantisch redundant. |
| `iteration` | Spec 08 hat heute kein Iterations-Feld (Memo 082 Kap 14.2 out-of-scope) — lebt in Sidecar. |
| `improvementHints[]` | Loop-intern, nicht durable — lebt in Sidecar. |
| `persona.lensId` | Spec 12 §4 Lens-Konzept noch nicht in Spec 08 §4 abgebildet — lebt in Sidecar + Filename. |

---

## `categoricalVeto`-Mapping (Spec 08 §6)

Das Master-Schema (PRD-08) modelliert **heute** keinen Veto-Branch im `oneOf`.
Begruendung: Der Evaluator-Sub-Agent ist nicht autorisiert, einen Categorical
Veto auszusprechen — das ist eine deterministische Pruefung
(api-key-domain-mismatch, malicious-module, illegal-content) oder eine
spezielle `ai-security-veto`-Operation der Engine-Schicht, nicht des
per-Bereich-Evaluators.

Konsequenz fuer das Mapping: `categoricalVeto = null` ist der **Default** im
Generator-Output, ueberschrieben nur von Engine-Code (nicht von
Sub-Agent-Antworten). Diese Trennung ist normativ — der Evaluator hat keine
Veto-Befugnis.

---

## `regradingTrigger`-Mapping (Spec 08 §11)

Der Recursive-Loop (Memo 082 Kap 12) ist **kein** `regradingTrigger` im
Spec-08-Sinne — er passiert *innerhalb* eines Grading-Laufs, nicht zwischen
zwei abgeschlossenen Grading-Artefakten. `regradingTrigger` wird nur gesetzt,
wenn:

- ein User per CLI/Issue ein bestehendes `<gradingId>.json` neu bewerten laesst (`user-report`)
- ein scheduled Re-Run laeuft (`scheduled`)
- ein `scoringSystem`-Bump bzw. `gradingSystem`-Bump alle Artefakte invalidiert

→ **Intentionally-unmapped** auf der Loop-Ebene. Der Generator setzt
`regradingTrigger` nur in den drei Spec-08-§11-Faellen, nicht als
Loop-Iteration-Marker.

---

## Spec-Erweiterungs-Verweis (Memo 082 Kap 14.2)

Die folgenden Output-Schema-Felder sind **bewusst** als Sidecar persistiert
und sollten in einem **Folge-Memo** in die Spec eingearbeitet werden — diese
Erweiterungen sind explizit als **out-of-scope** fuer Memo 082 markiert
(Kap 14.2 Spec-Erweiterungs-Vorschlaege):

- `iteration` — Loop-Iterations-Counter (Top-Level oder `gradings[i].context`)
- `improvementHints[]` — Generator-Feedback-Loop-Persistenz
- `persona.lensId` — Lens-Konzept in `selectionContext` (heute nur Base-Persona-ID)

Bis ein solches Folge-Memo die Spec erweitert, gilt die Sidecar-Konvention aus
§4.5 verbindlich. Implementierer der Loop-Engine (Memo 082 P2h) MUST schreiben
beide Dateien — die Spec-08-Datei UND die `.loop.json`-Sidecar — im selben
Transaktions-Block.

---

## Referenzen

- Memo 082 REV-05 Kap 4.6 (Folder-Typen — `docs/` = Public Repo), Kap 9 (Output-Schema F16), Kap 12 (Recursive Loop), Kap 13 (Persona-Slug in Filename), Kap 14.2 (Spec-Erweiterungs-Vorschlaege out-of-scope)
- Spec `08-grading-model.md` §3 (Top-Level-Felder), §3.X (5 Pflichtfelder ab 1.1.0), §4 (gradings[]-Element), §5.1.1 (17 Single-Dimensionen), §5.1.2 (4 Selection-Dimensionen), §5.3 (n/a-naReason), §6 (categoricalVeto), §8 (Tier-Trim + maxAttainableGrade), §11 (regradingTrigger)
- Spec `12-personas-contract.md` §1 (4 Base-Personas), §4 (Lens-Konzept)
- Spec `13-skills.md` §3 (namespaceSkillValidity), §4 (selectionSkillL1/L2/L3)
- Spec `19-folder-layout.md` §17 (Naming-Konvention `<gradingId>.json`)
- PRD-08 (Phase 2e, Schema-Layout) — Vorbedingung

---

## Annex: Modul-spezifische Felder (Memo 082, Phase 2h, PRD-20)

Folgende Felder sind **NICHT** in `gradingSpec/1.1.0` definiert, sondern auf
Modul-Ebene (Memo 082, Phase 2h) pflichtig fuer alle Eintraege ab Phase 2h.
Sie werden vom Generator (`src/Grading.mjs#createEntry`) entgegengenommen,
validiert und in die persistierte JSON aufgenommen.

| Feld | Typ | Quelle | Pflicht ab | Validation-Code |
|------|-----|--------|------------|-----------------|
| `iteration` | integer (`0..10`) | Memo 082 Kap 12 (Recursive Feedback Loop) | Phase 2h | `GRD-030` |
| `improvementHints` | string[] | Memo 082 Kap 12 (Loop-Mechanik) | Phase 2h | `GRD-031` |
| `persona` | string (`'neutral'` ODER `<base>--<lens>`) | Memo 082 Kap 13 (Parallele Personas) | Phase 2h | `GRD-032` |

### Spec-Erweiterung — out-of-scope

Spec-Erweiterungs-Vorschlag fuer Iterations-Counter ist explizit
out-of-scope dieses Memos (Kap 14.2). Wenn Spec `1.2.0` diese Felder
aufnimmt, wird das Mapping hier auf „Spec-konform ab 1.2.0" aktualisiert.

### Backward-Compat (Read-Pfad)

Legacy-Eintraege (Pilot-Files aus Memo 076/080) ohne diese Felder werden mit
Defaults gelesen — `Grading.readEntry({ json })`:

| Feld | Default beim Read |
|------|-------------------|
| `iteration` | `0` |
| `improvementHints` | `[]` |
| `persona` | `'neutral'` |

**Wichtig:** Diese Defaults gelten **ausschliesslich** beim Lesen von
Legacy-Files. `createEntry()` weist fehlende Felder als undefined zurueck
(keine Silent Defaults) — wer das Feld setzen will, MUSS es explizit
uebergeben.

### Filename-Konvention (Cross-Ref PRD-21)

Das `persona`-Feld im JSON-Body ist konsistent mit dem `persona`-Segment im
Dateinamen (siehe `docs/grading-filename-convention.md`). Filename-Bildung
darf nur via `Grading.formatGradingFilename({ hash, ts, persona })` laufen.

### Beispiel-Eintrag (neu, Phase 2h)

```json
{
    "gradingId": "a1b2c3d4--2026-05-30T10-15Z",
    "schemaId": "etherscan.getContractEthereum",
    "schemaHash": "a1b2c3d4",
    "gradingTier": "autonomous",
    "iteration": 2,
    "improvementHints": [],
    "persona": "decision-maker--crypto-trader",
    "gradings": [],
    "categoricalVeto": null,
    "aggregateGrade": "B",
    "maxAttainableGrade": "B"
}
```

### Cross-References

- PRD-19 — Recursive-Loop-Logik in `*-start-grade`-Skills (Skill-Bodies)
- PRD-20 — Dieses Annex (Modul-Eintrags-Schema)
- PRD-21 — Persona-Slug-Filename-Konvention (`docs/grading-filename-convention.md`)
