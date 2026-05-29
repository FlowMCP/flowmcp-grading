---
name: selection-skills-L1-evaluate
description: Evaluator-Skill fuer Bereich selection-skills-L1 (Area 7a, Memo 082 Kap 7.1). Empfaengt das vom Generator-Skill selection-skills-L1-start-grade erzeugte Prompt-Artefakt und orchestriert einen frischen LLM-Sub-Agent in leerem Kontext. Erzwingt Strict-JSON-Output gemaess prompts/output-schemas/selection-skills-L1.schema.json. Persona-Anwendung gemaess Kap 7.4 — Bereich 7a ist MIT Persona (personaRequired: true, Spec 13 §4.2 MUST).
allowed-tools: Read, Grep, Glob
model: inherit
---

# selection-skills-L1-evaluate

## Zweck

Dieser Skill wird vom Generator-Skill `selection-skills-L1-start-grade` aufgerufen. Er empfaengt das vom `PromptBuilder.build(...)` erzeugte Prompt-Artefakt per Tool-Result und orchestriert einen **frischen Sub-Agent** zur Bewertung.

## Input

Vom Aufrufer (`selection-skills-L1-start-grade`) wird ein einziger String uebergeben:

| Parameter | Pflicht | Format | Quelle |
|-----------|---------|--------|--------|
| `promptArtifact` | ja | String (inkl. Persona-Block, Pflicht) | `PromptBuilder.build(...)` aus PRD-04 (Phase 2d) |

Quelle der Pflicht-Block-Logik: `prompts/pre-instructions/selection-skills-L1.md` (PRD-09/10, Phase 2d).

## Architektur-Rolle (Memo 082 Kap 4.2/4.3)

- Generator-Skill `selection-skills-L1-start-grade` kennt das Optimierungsziel und treibt den Loop.
- Dieser Evaluator-Skill darf das Optimierungsziel **NICHT** in den Sub-Agent-Kontext einspeisen.
- Der Sub-Agent sieht ausschliesslich:
  1. Den Files-to-Read-Block aus dem Prompt-Artefakt
  2. Die Eval-Fragen des Bereichs `selection-skills-L1`
  3. Das Output-Schema `prompts/output-schemas/selection-skills-L1.schema.json`
  4. Den **Persona-Block** (Pflicht, Kap 7.4 + Spec 13 §4.2)

## Sub-Agent-Konfiguration (Memo 082 Kap 11)

- **Kontext:** LEER.
- **Tools:** NUR `Read`, `Grep`, `Glob`. Kein `Write`, kein `Bash`, kein `Edit`.
- **Output:** Strict-JSON gemaess `prompts/output-schemas/selection-skills-L1.schema.json`.
- **Persona-Anwendung (Kap 7.4):** `personaRequired: true` (MUST per Spec 13 §4.2). Persona-Slug-Format `<basePersona>--<lens>`.

## Ablauf

1. **Empfangen** — Generator uebergibt das Prompt-Artefakt (String, inkl. Persona-Block).
2. **Pre-Check Files-to-Read** — Bei Fehler **AUSSCHLIESSLICH**:

   ```json
   { "blocker": "<pfad>", "reason": "<grund>" }
   ```

   und abbrechen (Kap 8).
3. **Sub-Agent starten** — Frischer Sub-Agent mit leerem Kontext.
4. **Files lesen** — In **strikter Reihenfolge** (L1-Skill-Files, Persona, Lens-Helper).
5. **Fragen beantworten** — Eval-Fragen des Bereichs `selection-skills-L1` aus Persona-Sicht (L1 = Entry-Skills).
6. **HTTP-Status-Auswertung** — Falls relevant: 4xx = **NIEMALS** PASS (Memory `feedback_http_400_is_not_pass`).
7. **Strict-JSON validieren** — Bei Verletzung: `{ "blocker": "schema-validation", "reason": "<details>" }`.
8. **Rueckgabe** — Per Tool-Result an `selection-skills-L1-apply-improvement` (PRD-16).

## Output-Format

Strict-JSON gemaess `prompts/output-schemas/selection-skills-L1.schema.json`. Pflichtfelder:

| Feld | Typ | Wert / Constraint |
|------|-----|--------------------|
| `gradingId` | string | `<schemaHash>--<ISO timestamp>` |
| `schemaHash` | string | 8-hex sha256 prefix |
| `area` | const | `"selection-skills-L1"` |
| `iteration` | integer | 1..5 |
| `timestamp` | string | ISO-8601 |
| `persona` | object | `{ basePersonaId, lensId }` (Pflicht) |
| `answers` | array | 4 Eintraege (Q-selection-skills-L1-01..04) |
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

- **Aufrufer:** `selection-skills-L1-start-grade` (PRD-15, Phase 2f)
- **Konsument:** `selection-skills-L1-apply-improvement` (PRD-16)
- **Spec-Bezug:**
  - Spec 1.1.0 §3 (Validity Rules)
  - Spec 1.1.0 §13 (Skills — Persona-Focus L1/L2/L3 MUST)
  - Spec 1.1.0 §19 (Folder-Layout)
