---
name: about-namespace-evaluate
description: Evaluator-Skill fuer Bereich about-namespace (Area 5, Memo 082 Kap 7.1). Empfaengt das vom Generator-Skill about-namespace-start-grade erzeugte Prompt-Artefakt und orchestriert einen frischen LLM-Sub-Agent in leerem Kontext. Erzwingt Strict-JSON-Output gemaess prompts/output-schemas/about-namespace.schema.json. Persona-Anwendung gemaess Kap 7.4 — Bereich 5 ist MIT Persona (personaRequired: true, Spec 11 §4).
allowed-tools: Read, Grep, Glob
model: inherit
---

# about-namespace-evaluate

## Zweck

Dieser Skill wird vom Generator-Skill `about-namespace-start-grade` aufgerufen. Er empfaengt das vom `PromptBuilder.build(...)` erzeugte Prompt-Artefakt per Tool-Result und orchestriert einen **frischen Sub-Agent** zur Bewertung.

## Input

Vom Aufrufer (`about-namespace-start-grade`) wird ein einziger String uebergeben:

| Parameter | Pflicht | Format | Quelle |
|-----------|---------|--------|--------|
| `promptArtifact` | ja | String (inkl. Persona-Block, Pflicht) | `PromptBuilder.build(...)` aus PRD-04 (Phase 2d) |

Quelle der Pflicht-Block-Logik: `prompts/pre-instructions/about-namespace.md` (PRD-09/10, Phase 2d).

## Architektur-Rolle (Memo 082 Kap 4.2/4.3)

- Generator-Skill `about-namespace-start-grade` kennt das Optimierungsziel und treibt den Loop.
- Dieser Evaluator-Skill darf das Optimierungsziel **NICHT** in den Sub-Agent-Kontext einspeisen.
- Der Sub-Agent sieht ausschliesslich:
  1. Den Files-to-Read-Block aus dem Prompt-Artefakt
  2. Die Eval-Fragen des Bereichs `about-namespace`
  3. Das Output-Schema `prompts/output-schemas/about-namespace.schema.json`
  4. Den **Persona-Block** (Pflicht, Kap 7.4 + Spec 11 §4)

## Sub-Agent-Konfiguration (Memo 082 Kap 11)

- **Kontext:** LEER. Keine Vor-Session-Memory, keine globale `CLAUDE.md`, keine laufende Optimierungs-History.
- **Tools:** NUR `Read`, `Grep`, `Glob`. Kein `Write`, kein `Bash`, kein `Edit`.
- **Output:** Strict-JSON gemaess `prompts/output-schemas/about-namespace.schema.json`.
- **Persona-Anwendung (Kap 7.4):** `personaRequired: true`. Persona-Slug-Format `<basePersona>--<lens>` (z.B. `decision-maker--crypto-trader`). Quelle: Base-Persona aus `repos/flowmcp-spec/personas/<basePersona>.md` (Spec 12 §1) + Lens-Helper aus `flowmcp-grading/grading-data/personas/<lens>-<YYYY>.md` (Memo Kap 5.4).

## Ablauf

1. **Empfangen** — Generator uebergibt das Prompt-Artefakt (String, inkl. Persona-Block).
2. **Pre-Check Files-to-Read** — Bei Fehler **AUSSCHLIESSLICH**:

   ```json
   { "blocker": "<pfad>", "reason": "<grund>" }
   ```

   und abbrechen (Kap 8). Fehlende Persona-Datei wird ebenfalls als Blocker behandelt.
3. **Sub-Agent starten** — Frischer Sub-Agent mit leerem Kontext.
4. **Files lesen** — In **strikter Reihenfolge** (About-Page-File, Persona, Lens-Helper, Domain-Knowledge).
5. **Fragen beantworten** — Eval-Fragen des Bereichs `about-namespace` aus Persona-Sicht.
6. **HTTP-Status-Auswertung** — Falls relevant: 4xx = **NIEMALS** PASS (Memory `feedback_http_400_is_not_pass`).
7. **Strict-JSON validieren** — Bei Verletzung: `{ "blocker": "schema-validation", "reason": "<details>" }`.
8. **Rueckgabe** — Per Tool-Result an `about-namespace-apply-improvement` (PRD-16).

## Output-Format

Strict-JSON gemaess `prompts/output-schemas/about-namespace.schema.json`. Pflichtfelder:

| Feld | Typ | Wert / Constraint |
|------|-----|--------------------|
| `gradingId` | string | `<schemaHash>--<ISO timestamp>` |
| `schemaHash` | string | 8-hex sha256 prefix |
| `area` | const | `"about-namespace"` |
| `iteration` | integer | 1..5 |
| `timestamp` | string | ISO-8601 |
| `persona` | object | `{ basePersonaId, lensId }` (Pflicht) |
| `answers` | array | 7 Eintraege (Q-about-namespace-01..07) |
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

- **Aufrufer:** `about-namespace-start-grade` (PRD-15, Phase 2f)
- **Konsument:** `about-namespace-apply-improvement` (PRD-16)
- **Spec-Bezug:**
  - Spec 1.1.0 §3 (Validity Rules — Empty-Context-Konvention)
  - Spec 1.1.0 §11 (About-Convention — Persona-Reference Pflicht)
  - Spec 1.1.0 §12 (Personas-Contract — Base-Personas)
  - Spec 1.1.0 §19 (Folder-Layout)
