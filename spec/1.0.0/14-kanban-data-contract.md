# 14 — Kanban Data Contract (minimal)

| Field | Value |
|-------|-------|
| Status | Draft (minimal data contract — no implementation) |
| Version | `gradingSpec/1.0.0` |
| Depends on | [`00-overview.md`](./00-overview.md), [`08-grading-model.md`](./08-grading-model.md) |
| Related | [`04-phases-single.md`](./04-phases-single.md), [`05-phases-selection.md`](./05-phases-selection.md), [`09-security-and-development.md`](./09-security-and-development.md) |
| Annex | [`14-kanban-data-contract.schema.json`](./14-kanban-data-contract.schema.json) — JSON-Schema 2020-12 for the phase-status response |
| Follow-up Memo | **Kanban v2** — implementation (GitHub Projects v2 binding, columns, workflow) lives there. |

> Conformance language (MUST/SHOULD/MAY) follows BCP 14 [RFC2119]/[RFC8174] as defined in [`00-overview.md`](./00-overview.md). This chapter defines the **data contract only**. Implementation is out of scope.

---

## 1. Scope-Abgrenzung (verbindlich)

Memo 076 enthaelt **KEIN** Kanban-Implementations-Versprechen. Was 076 sicherstellt, ist nur die **Datenseite**: ein eindeutiger Card-ID-Kandidat, ein abfragbarer Phasen-Status, ein Trigger fuer die Veto-Spalte, ein Filter fuer den Tier. Spalten-Layouts, GitHub-Projects-v2-Anbindung, Veto-Workflow, UI-Hinweise und Sync-Strategien sind **nicht** Teil dieses Kapitels.

Die Implementation der Kanban-Anbindung — inklusive GitHub-Projects-v2-API-Anbindung, Spalten je Phase, Card-Bewegungen, UI-Hinweise und Sync-Strategie — gehoert verbindlich in das **Folge-Memo „Kanban v2"** (siehe [Sektion 10](#10-folge-memo-kanban-v2)). Dieses Kapitel beschreibt ausschliesslich, **was an Daten zur Verfuegung steht**, gegen die ein spaeterer Kanban-Konsument arbeiten kann.

Implementation-Versprechen sind in 076 explizit **ausgeschlossen** (Memo 076 Kap 15.2). Mehrfach: Implementation = Folge-Memo. Implementation = nicht hier.

---

## 2. Card-ID

| Property | Value |
|----------|-------|
| Quelle | Top-Level-Feld `schemaId` aus [`08-grading-model.md`](./08-grading-model.md) |
| Format | `<provider>/<route-or-schema-name>` (z.B. `brightsky/bright-sky`) |
| Eindeutigkeit | Eindeutig ueber alle Gradings hinweg |

Jeder Grading-Eintrag MUSS eine eindeutige `schemaId` tragen. Diese `schemaId` dient als **Kanban-Card-ID-Kandidat**. Konsumenten DUERFEN auf dieser ID Karten gruppieren und Re-Gradings ueber mehrere Eintraege zu einer Card zusammenfassen.

Die Card-ID ist **stabil** ueber Re-Gradings hinweg. Ein Re-Grading-Eintrag (mit `regradingTrigger.previousGradingId`) MUSS dieselbe `schemaId` (= Card-ID) wie der referenzierte Vor-Eintrag tragen.

---

## 3. Phasen-Status-Vertrag

Jede Phase (`P1`–`P7`, `S1`–`S4`) MUSS einen abfragbaren Status liefern. Das Enum ist abgeschlossen:

| Status | Bedingung |
|--------|-----------|
| `passed` | Alle Pflicht-Dimensionen der Phase haben `score=pass` ODER einen numerischen Score `>=` der phasenspezifischen Schwelle. |
| `failed` | Mindestens eine Pflicht-Dimension hat `score=fail` ODER einen numerischen Score `<` der phasenspezifischen Schwelle. |
| `pending` | Phase wurde noch nicht ausgefuehrt. Alle Pflicht-Dimensionen haben `score=n/a`. |
| `stale` | Mindestens eine Pflicht-Dimension hat `score=stale` (Aging-Threshold ueberschritten; siehe [`08-grading-model.md` Zeitachsen-Regel](./08-grading-model.md)). |

Konsumenten MUESSEN die Statuswerte exakt so interpretieren. `pending` ist **nicht** dasselbe wie `failed`. `stale` ist **nicht** dasselbe wie `failed` (Aging fuehrt zu `stale`, nicht zu `fail`).

Wenn keine Pflicht-Dimensionen fuer eine Phase ableitbar sind (z.B. fuer Phasen, die rein strukturell ueber eine `flowmcp validate`-Pipeline laufen), MUSS die Phase im Phasen-Status `passed`/`failed` ueber das Pipeline-Ergebnis abgebildet werden — siehe Phasen-Tabelle in [Sektion 4](#4-phasen-status-tabelle-phase--dimensionen).

---

## 4. Phasen-Status-Tabelle (Phase → Dimensionen)

Verbindliche Zuordnung von Phasen zu den Dimensionen, die fuer die Status-Ableitung herangezogen werden. Dimensions-Namen folgen dem Enum aus [`08-grading-model.schema.json`](./08-grading-model.schema.json).

| Phase | Quelle | Pflicht-Dimensionen |
|-------|--------|---------------------|
| `P1` | [`03-tos.md`](./03-tos.md), [`04-phases-single.md`](./04-phases-single.md) | `tosMatch`, `legalAssessment` |
| `P2` | [`02-eligibility.md`](./02-eligibility.md) | `apiAvailability` (Eligibility-Klassifikation) |
| `P3` | [`04-phases-single.md`](./04-phases-single.md) | Strukturelle Validierung (deterministisches Pipeline-Ergebnis; kein Grading-Modell-Feld) |
| `P4` | [`04-phases-single.md`](./04-phases-single.md) | `apiAvailability`, `outputSchemaConformance` |
| `P5` | [`04-phases-single.md`](./04-phases-single.md) | `whenToUse`, `parameters`, `descriptionNeutrality`, `completeness` |
| `P6` | [`04-phases-single.md`](./04-phases-single.md), [`11-about-convention.md`](./11-about-convention.md) | `aboutConventionCompliance`, `namespaceSkillValidity` |
| `P7` | [`04-phases-single.md`](./04-phases-single.md) | `outputSchemaConformance` (jq-Pipe als Sub-Dimension) |
| `S1` | [`05-phases-selection.md`](./05-phases-selection.md) | `domainConformance` (Selection-Definition) |
| `S2` | [`05-phases-selection.md`](./05-phases-selection.md), [`10-domain-knowledge.md`](./10-domain-knowledge.md) | `domainConformance`, `aboutConventionCompliance` |
| `S3` | [`05-phases-selection.md`](./05-phases-selection.md), [`13-skills.md`](./13-skills.md) | `selectionSkillL1`, `selectionSkillL2`, `selectionSkillL3` |
| `S4` | [`05-phases-selection.md`](./05-phases-selection.md), [`12-personas-contract.md`](./12-personas-contract.md) | `personaUseCaseFit` |

Die Tabelle ist der verbindliche Mapping-Vertrag fuer den Phasen-Status-Resolver. Konsumenten MUESSEN diese Zuordnung respektieren.

---

## 5. Spalten-Trigger (Datenseite-Sicht)

Welche Daten-Bedingung erlaubt welche Spalte? Die folgende Tabelle ist **rein datenseitig** und enthaelt **keine** UI-Festlegungen.

| Spalten-ID | Bedingung (datenseitig) |
|------------|--------------------------|
| `Rejected` | `categoricalVeto != null` |
| `Group-Bound` | `gradingTier == "group-bound"` |
| `Autonomous` | `gradingTier == "autonomous"` (Default-Tier) |
| Phasen-spezifische Spalten je `P1`–`P7`, `S1`–`S4` | Phasen-Status gemaess [Sektion 4](#4-phasen-status-tabelle-phase--dimensionen) |

Spaltennamen, Reihenfolge, Farben, Sichtbarkeit, Sortierreihenfolge und Konflikt-Aufloesung sind **nicht** Teil dieses Kapitels — siehe [Sektion 10](#10-folge-memo-kanban-v2). Ein Konsument MUSS aus den oben definierten Trigger-Bedingungen ableiten koennen, in welche Datenklasse eine Card faellt.

---

## 6. Veto-Spalte (Pflicht)

`categoricalVeto != null` MUSS eine eigene Spalte „Rejected" erlauben. Die Trigger-Liste ist **abgeschlossen** und identisch zu [`08-grading-model.md`](./08-grading-model.md) bzw. [`09-security-and-development.md`](./09-security-and-development.md):

| Trigger | Quelle |
|---------|--------|
| `malicious-module` | [`09-security-and-development.md`](./09-security-and-development.md) |
| `api-key-domain-mismatch` | [`09-security-and-development.md`](./09-security-and-development.md) |
| `illegal-content` | [`03-tos.md`](./03-tos.md), [`09-security-and-development.md`](./09-security-and-development.md) |
| `ai-security-veto` | [`09-security-and-development.md`](./09-security-and-development.md) |

Datenmodell-seitig MUSS gelten: Eine Card in der „Rejected"-Spalte kann **NICHT** zurueck in andere Spalten gezogen werden. Die Datenseite stellt das sicher, indem Veto-Eintraege niemals editiert oder geloescht werden. Eine Re-Bewertung erzeugt einen **neuen** Grading-Eintrag mit derselben `schemaId` (= Card-ID). Konsumenten MUESSEN beim Anzeigen einer Card stets den juengsten Eintrag heranziehen (siehe [Sektion 8](#8-re-grading-vertrag)).

---

## 7. Tier-Filter (Pflicht)

`gradingTier=group-bound` SOLL als abfragbarer Filter ueber das Abfrage-Interface (siehe [Sektion 9](#9-abfrage-interface-data-contract)) exportiert werden. Konsumenten KOENNEN so Selection-Ebene-Cards getrennt von autonomen Single-Schema-Cards anzeigen.

Der Default-Tier eines neuen Grading-Eintrags ist `autonomous`. `group-bound`-Eintraege MUESSEN zusaetzlich eine `selectionId` tragen (siehe [`08-grading-model.md` Sektion 3](./08-grading-model.md)).

---

## 8. Re-Grading-Vertrag

Ein neuer Grading-Eintrag mit `regradingTrigger.previousGradingId` MUSS dieselbe `schemaId` (= Card-ID) tragen wie der referenzierte Vor-Eintrag. Konsumenten sehen damit pro Card potentiell **mehrere** Eintraege.

| Regel | Bedeutung |
|-------|-----------|
| Card-ID stabil | `schemaId` ist identisch ueber alle Re-Gradings einer Card. |
| Juengster Eintrag = aktueller Status | Konsumenten MUESSEN den Eintrag mit dem groessten `timestamp` als „aktuell" interpretieren. |
| Alter Eintrag NICHT loeschen | Der referenzierte `previousGradingId`-Eintrag bleibt im Datenbestand. Audit-Spur. |
| Veto-Eintraege sind ebenfalls re-gradbar | Ein neuer Eintrag KANN das Veto aufheben, aber nur durch eine vollstaendig neue Bewertung — nicht durch Editieren des alten Eintrags. |

---

## 9. Abfrage-Interface (Data-Contract)

Die folgende minimale, persistenz-unabhaengige Abfrage-Oberflaeche beschreibt, gegen **welche** Operationen ein spaeterer Kanban-Konsument arbeiten KANN. Dieser Vertrag ist **rein deskriptiv**. Memo 076 implementiert ihn **NICHT**. PRD-25 (Pilot-Gradings) nutzt ihn fuer Smoke-Tests gegen das Datenformat.

| Operation | Signatur (verbal) | Rueckgabe |
|-----------|-------------------|-----------|
| `listGradings` | `({ tier?, vetoOnly?, phase?, since? })` | Array aller Grading-Eintraege, gefiltert nach Tier, Veto-Status, Phase, Mindest-Timestamp. |
| `getCard` | `(schemaId)` | Array aller Eintraege fuer eine Card, sortiert nach `timestamp` (juengster zuerst). |
| `getPhaseStatus` | `(schemaId, phaseId)` | Objekt mit `{ phaseId, status, dimensionsConsidered[], stalestDimensionAge? }`. Konform zu [`14-kanban-data-contract.schema.json`](./14-kanban-data-contract.schema.json). |

Dieser Vertrag ist die **einzige** Schnittstelle, die Memo 076 fuer Kanban-Konsumenten exportiert. Persistenz-Format (Files / DB / GraphQL / REST), Transport (lokal / remote), Authentifizierung und Synchronisation sind aussen vor.

---

## 10. Folge-Memo: Kanban v2

Die folgende Tabelle ist verbatim aus Memo 076 Kap 15.2 uebernommen und bindet die Implementation an ein eigenes Memo.

| Folge-Memo | Inhalt | Begruendung Verschiebung |
|------------|--------|--------------------------|
| **Kanban v2** | GitHub-Projects-v2-Anbindung mit Spalten je Phase, Veto-Spalte, Tier-Filter | „sehr optimistisch fuer 076-Scope" (User). Bestehender Kanban (Memo 039) ist alt, Migration und Neu-Aufbau braucht ein eigenes Memo. |

Das Folge-Memo wird durch Memo 076 PRD-26 eroeffnet. Inhalte des Folge-Memos (verbindlich, nicht in 076):

- GitHub-Projects-v2-API-Anbindung
- Spalten-Layout je Phase und Tier
- Veto-Spalten-Workflow (Wiedervorlage, Eskalation)
- Tier-Filter-Implementierung
- Sync-Strategie zwischen Grading-Datenmodell und Project-Items
- Migration des Bestand-Kanban aus Memo 039 (Entscheidung gehoert in das Folge-Memo selbst)

---

## Memo-Anker

- Quelle: `/Users/andreasbanholzer/WORKBENCH/ressources/projects/flowmcp/.memo/076-schema-quality-grading-spec/revisions/REV-05.md`
- Kap 15.3 „Kanban-Vertrag in 076 (minimal)", Zeilen 660–676
- Kap 15.2 „Folge-Memos benannt (NICHT in 076)", Zeilen 653–658
- Quer-Verweis Grading-Modell: [`08-grading-model.md`](./08-grading-model.md) (Top-Level-Felder `schemaId`, `categoricalVeto`, `gradingTier`, `regradingTrigger`)
- Quer-Verweis Phasen-Modell: [`04-phases-single.md`](./04-phases-single.md) (P1–P7), [`05-phases-selection.md`](./05-phases-selection.md) (S1–S4)
