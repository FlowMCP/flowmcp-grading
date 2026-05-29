---
name: about-selection-evaluate
description: Evaluator-Skill fuer Bereich about-selection (Area 6, Memo 082 Kap 7.1). Empfaengt das vom Generator-Skill about-selection-start-grade erzeugte Prompt-Artefakt und orchestriert einen frischen LLM-Sub-Agent in leerem Kontext. Erzwingt Strict-JSON-Output gemaess prompts/output-schemas/about-selection.schema.json. Persona-Anwendung gemaess Kap 7.4 — Bereich 6 ist MIT Persona (personaRequired: true, Spec 11 §4).
allowed-tools: Read, Grep, Glob
model: inherit
---

# about-selection-evaluate

## Zweck

Dieser Skill wird vom Generator-Skill `about-selection-start-grade` aufgerufen. Er empfaengt das vom `PromptBuilder.build(...)` erzeugte Prompt-Artefakt per Tool-Result und orchestriert einen **frischen Sub-Agent** zur Bewertung.

## Input

Vom Aufrufer (`about-selection-start-grade`) wird ein einziger String uebergeben:

| Parameter | Pflicht | Format | Quelle |
|-----------|---------|--------|--------|
| `promptArtifact` | ja | String (inkl. Persona-Block, Pflicht) | `PromptBuilder.build(...)` aus PRD-04 (Phase 2d) |

Quelle der Pflicht-Block-Logik: `prompts/pre-instructions/about-selection.md` (PRD-09/10, Phase 2d).

## Architektur-Rolle (Memo 082 Kap 4.2/4.3)

- Generator-Skill `about-selection-start-grade` kennt das Optimierungsziel und treibt den Loop.
- Dieser Evaluator-Skill darf das Optimierungsziel **NICHT** in den Sub-Agent-Kontext einspeisen.
- Der Sub-Agent sieht ausschliesslich:
  1. Den Files-to-Read-Block aus dem Prompt-Artefakt
  2. Die Eval-Fragen des Bereichs `about-selection`
  3. Das Output-Schema `prompts/output-schemas/about-selection.schema.json`
  4. Den **Persona-Block** (Pflicht, Kap 7.4 + Spec 11 §4)

## Sub-Agent-Konfiguration (Memo 082 Kap 11)

- **Kontext:** LEER. Keine Vor-Session-Memory.
- **Tools:** NUR `Read`, `Grep`, `Glob`. Kein `Write`, kein `Bash`, kein `Edit`.
- **Output:** Strict-JSON gemaess `prompts/output-schemas/about-selection.schema.json`.
- **Persona-Anwendung (Kap 7.4):** `personaRequired: true`. Persona-Slug-Format `<basePersona>--<lens>`. Quelle: Base-Persona + Lens-Helper.

## Ablauf

1. **Empfangen** — Generator uebergibt das Prompt-Artefakt (String, inkl. Persona-Block).
2. **Pre-Check Files-to-Read** — Bei Fehler **AUSSCHLIESSLICH**:

   ```json
   { "blocker": "<pfad>", "reason": "<grund>" }
   ```

   und abbrechen (Kap 8).
3. **Sub-Agent starten** — Frischer Sub-Agent mit leerem Kontext.
4. **Files lesen** — In **strikter Reihenfolge** (About-Selection-File, Persona, Lens-Helper).
5. **Fragen beantworten** — Eval-Fragen des Bereichs `about-selection` aus Persona-Sicht.
6. **HTTP-Status-Auswertung** — Falls relevant: 4xx = **NIEMALS** PASS (Memory `feedback_http_400_is_not_pass`).
7. **Strict-JSON validieren** — Bei Verletzung: `{ "blocker": "schema-validation", "reason": "<details>" }`.
8. **Rueckgabe** — Per Tool-Result an `about-selection-apply-improvement` (PRD-16).

## Output-Format

Strict-JSON gemaess `prompts/output-schemas/about-selection.schema.json`. Pflichtfelder:

| Feld | Typ | Wert / Constraint |
|------|-----|--------------------|
| `gradingId` | string | `<schemaHash>--<ISO timestamp>` |
| `schemaHash` | string | 8-hex sha256 prefix |
| `area` | const | `"about-selection"` |
| `iteration` | integer | 1..5 |
| `timestamp` | string | ISO-8601 |
| `persona` | object | `{ basePersonaId, lensId }` (Pflicht) |
| `answers` | array | 7 Eintraege (Q-about-selection-01..07) |
| `improvementHints` | array | Optional |

Bei Blocker:

```json
{ "blocker": "<dateipfad-oder-stufe>", "reason": "<klartext>" }
```

## Sicherheits-Assertions

1. Der Sub-Agent KENNT das Optimierungsziel NICHT.
2. Keine stillen Defaults — fehlende Felder werden als `missing` markiert.
3. HTTP 4xx = FAIL/DEFECT, niemals PASS.

## Verschaltung

- **Aufrufer:** `about-selection-start-grade` (PRD-15, Phase 2f)
- **Konsument:** `about-selection-apply-improvement` (PRD-16)
- **Spec-Bezug:**
  - Spec 1.1.0 §3 (Validity Rules)
  - Spec 1.1.0 §11 (About-Convention)
  - Spec 1.1.0 §12 (Personas-Contract)
  - Spec 1.1.0 §19 (Folder-Layout)
