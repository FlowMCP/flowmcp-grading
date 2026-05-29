---
name: tools-aggregate-schema-evaluate
description: Evaluator-Skill fuer Bereich tools-aggregate-schema (Area 2, Memo 082 Kap 7.1). Empfaengt das vom Generator-Skill tools-aggregate-schema-start-grade erzeugte Prompt-Artefakt und orchestriert einen frischen LLM-Sub-Agent in leerem Kontext. Erzwingt Strict-JSON-Output gemaess prompts/output-schemas/tools-aggregate-schema.schema.json. Persona-Anwendung gemaess Kap 7.4 — Bereich 2 ist NEUTRAL (personaRequired: false).
allowed-tools: Read, Grep, Glob
model: inherit
---

# tools-aggregate-schema-evaluate

## Zweck

Dieser Skill wird vom Generator-Skill `tools-aggregate-schema-start-grade` aufgerufen. Er empfaengt das vom `PromptBuilder.build(...)` erzeugte Prompt-Artefakt per Tool-Result und orchestriert einen **frischen Sub-Agent** zur Bewertung.

## Input

Vom Aufrufer (`tools-aggregate-schema-start-grade`) wird ein einziger String uebergeben:

| Parameter | Pflicht | Format | Quelle |
|-----------|---------|--------|--------|
| `promptArtifact` | ja | String (Markdown + Files-to-Read-Block + Fragen + Output-Schema) | `PromptBuilder.build(...)` aus PRD-04 (Phase 2d) |

Quelle der Pflicht-Block-Logik: `prompts/pre-instructions/tools-aggregate-schema.md` (PRD-09/10, Phase 2d).

## Architektur-Rolle (Memo 082 Kap 4.2/4.3)

- Generator-Skill `tools-aggregate-schema-start-grade` kennt das Optimierungsziel und treibt den Loop.
- Dieser Evaluator-Skill darf das Optimierungsziel **NICHT** in den Sub-Agent-Kontext einspeisen.
- Der Sub-Agent sieht ausschliesslich:
  1. Den Files-to-Read-Block aus dem Prompt-Artefakt
  2. Die Eval-Fragen des Bereichs `tools-aggregate-schema`
  3. Das Output-Schema `prompts/output-schemas/tools-aggregate-schema.schema.json`
  4. Den Persona-Block (nur wenn `personaRequired: true`; bei `tools-aggregate-schema` LEER)

## Sub-Agent-Konfiguration (Memo 082 Kap 11)

- **Kontext:** LEER. Keine Vor-Session-Memory, keine globale `CLAUDE.md`, keine laufende Optimierungs-History.
- **Tools:** NUR `Read`, `Grep`, `Glob` (siehe `allowed-tools` Frontmatter). Kein `Write`, kein `Bash`, kein `Edit`.
- **Output:** Strict-JSON gemaess `prompts/output-schemas/tools-aggregate-schema.schema.json`.
- **Persona-Anwendung (Kap 7.4):** `personaRequired: false`. Bereich `tools-aggregate-schema` wird **neutral** bewertet. `persona`-Feld im Output ist `null`.

## Ablauf

1. **Empfangen** — Generator uebergibt das Prompt-Artefakt (String) per Tool-Result.
2. **Pre-Check Files-to-Read** — Pruefe, ob alle gelisteten Pfade existieren und lesbar sind. Bei Fehler **AUSSCHLIESSLICH**:

   ```json
   { "blocker": "<pfad>", "reason": "<grund>" }
   ```

   und abbrechen (Kap 8).
3. **Sub-Agent starten** — Frischer Sub-Agent mit leerem Kontext.
4. **Files lesen** — Sub-Agent liest die Files-to-Read in **strikter Reihenfolge** (Tool: `Read`).
5. **Fragen beantworten** — Sub-Agent beantwortet jede Eval-Frage des Bereichs `tools-aggregate-schema` entlang des Output-Schemas.
6. **HTTP-Status-Auswertung** — Falls der `evaluatorTask` einen HTTP-Status interpretiert: 4xx ist **NIEMALS** PASS (Memory `feedback_http_400_is_not_pass`). PASS = HTTP 200.
7. **Strict-JSON validieren** — Antwort wird gegen das Output-Schema validiert. Bei Verletzung: `{ "blocker": "schema-validation", "reason": "<details>" }`.
8. **Rueckgabe** — Per Tool-Result an `tools-aggregate-schema-apply-improvement` (PRD-16).

## Output-Format

Strict-JSON gemaess `prompts/output-schemas/tools-aggregate-schema.schema.json`. Pflichtfelder:

| Feld | Typ | Wert / Constraint |
|------|-----|--------------------|
| `gradingId` | string | `<schemaHash>--<ISO timestamp>` |
| `schemaHash` | string | 8-hex sha256 prefix |
| `area` | const | `"tools-aggregate-schema"` |
| `iteration` | integer | 1..5 |
| `timestamp` | string | ISO-8601 |
| `persona` | null | `null` (NEUTRAL) |
| `answers` | array | 6 Eintraege (Q-tools-aggregate-schema-01..06) |
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

- **Aufrufer:** `tools-aggregate-schema-start-grade` (PRD-15, Phase 2f)
- **Konsument:** `tools-aggregate-schema-apply-improvement` (PRD-16, Phase 2f → Recursive-Loop in Phase 2h)
- **Spec-Bezug:** Spec 1.1.0 §3, §19
