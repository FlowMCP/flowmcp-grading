---
name: single-test-evaluate
description: Evaluator-Skill fuer Bereich single-test (Area 1, Memo 082 Kap 7.1). Empfaengt das vom Generator-Skill single-test-start-grade erzeugte Prompt-Artefakt und orchestriert einen frischen LLM-Sub-Agent in leerem Kontext. Erzwingt Strict-JSON-Output gemaess prompts/output-schemas/single-test.schema.json. Persona-Anwendung gemaess Kap 7.4 — Bereich 1 ist NEUTRAL (personaRequired: false).
allowed-tools: Read, Grep, Glob
model: inherit
---

# single-test-evaluate

## Zweck

Dieser Skill wird vom Generator-Skill `single-test-start-grade` aufgerufen. Er empfaengt das vom `PromptBuilder.build(...)` erzeugte Prompt-Artefakt per Tool-Result und orchestriert einen **frischen Sub-Agent** zur Bewertung.

## Input

Vom Aufrufer (`single-test-start-grade`) wird ein einziger String uebergeben:

| Parameter | Pflicht | Format | Quelle |
|-----------|---------|--------|--------|
| `promptArtifact` | ja | String (Markdown + Files-to-Read-Block + Fragen + Output-Schema) | `PromptBuilder.build(...)` aus PRD-04 (Phase 2d) |

Der Pfad zum Prompt-Artefakt im Filesystem ist optional — Inhalte werden ueblicherweise per Tool-Result inline uebergeben (Architektur-Pflicht, siehe Memo 082 Kap 4.3).

Quelle der Pflicht-Block-Logik: `prompts/pre-instructions/single-test.md` (PRD-09/10, Phase 2d).

## Architektur-Rolle (Memo 082 Kap 4.2/4.3)

- Generator-Skill `single-test-start-grade` kennt das Optimierungsziel und treibt den Loop.
- Dieser Evaluator-Skill darf das Optimierungsziel **NICHT** in den Sub-Agent-Kontext einspeisen.
- Der Sub-Agent sieht ausschliesslich:
  1. Den Files-to-Read-Block aus dem Prompt-Artefakt
  2. Die Eval-Fragen des Bereichs `single-test`
  3. Das Output-Schema `prompts/output-schemas/single-test.schema.json`
  4. Den Persona-Block (nur wenn `personaRequired: true`; bei `single-test` LEER)

## Sub-Agent-Konfiguration (Memo 082 Kap 11)

- **Kontext:** LEER. Keine Vor-Session-Memory, keine globale `CLAUDE.md`, keine laufende Optimierungs-History. Konvention via Spec 1.1.0 §3 + Pre-Instruction.
- **Tools:** NUR `Read`, `Grep`, `Glob` (siehe `allowed-tools` Frontmatter). Kein `Write`, kein `Bash`, kein `Edit`.
- **Output:** Strict-JSON gemaess `prompts/output-schemas/single-test.schema.json`.
- **Persona-Anwendung (Kap 7.4):** `personaRequired: false`. Bereich `single-test` wird **neutral** bewertet. `persona`-Feld im Output ist `null`.

## Ablauf

1. **Empfangen** — Generator uebergibt das Prompt-Artefakt (String) per Tool-Result.
2. **Pre-Check Files-to-Read** — Pruefe, ob alle im Files-to-Read-Block gelisteten Pfade existieren und lesbar sind. Wenn ein Pfad nicht existiert oder nicht lesbar ist, sende **AUSSCHLIESSLICH**:

   ```json
   { "blocker": "<pfad>", "reason": "<grund>" }
   ```

   und brich ab (Kap 8). Keine Teilantworten, keine Fallback-Defaults.
3. **Sub-Agent starten** — Frischer Sub-Agent mit leerem Kontext (Konvention via Pre-Instruction-Praeambel, kein technischer Reset).
4. **Files lesen** — Sub-Agent liest die Files-to-Read in **strikter Reihenfolge** (Tool: `Read`).
5. **Fragen beantworten** — Sub-Agent beantwortet jede Eval-Frage des Bereichs `single-test` entlang des Output-Schemas. Pro Frage: `questionId`, `score` (numerisch 1.0–5.0 oder `pass`/`fail`/`stale`/`n/a`), `reasoning`, optional `evidence`, bei `n/a` Pflichtfeld `naReason`.
6. **HTTP-Status-Auswertung** — Falls der `evaluatorTask` einen HTTP-Status interpretiert: 4xx ist **NIEMALS** PASS (Memory `feedback_http_400_is_not_pass`). PASS = HTTP 200, alles andere `fail` oder numerisch <= 2.0.
7. **Strict-JSON validieren** — Antwort wird gegen das Output-Schema validiert. Bei Schema-Verletzung: `{ "blocker": "schema-validation", "reason": "<details>" }`.
8. **Rueckgabe** — Antwort wird per Tool-Result an den Generator-Skill (`single-test-apply-improvement`, PRD-16) zurueckgegeben.

## Output-Format

Strict-JSON gemaess `prompts/output-schemas/single-test.schema.json` (PRD-08, Phase 2e). Pflichtfelder:

| Feld | Typ | Wert / Constraint |
|------|-----|--------------------|
| `gradingId` | string | `<schemaHash>--<ISO timestamp>` |
| `schemaHash` | string | 8-hex sha256 prefix |
| `area` | const | `"single-test"` |
| `iteration` | integer | 1..5 |
| `timestamp` | string | ISO-8601 |
| `persona` | null | `null` (NEUTRAL) |
| `answers` | array | 10 Eintraege (Q-single-test-01..10) |
| `improvementHints` | array | Optional, fuer Recursive-Loop |

Bei Blocker:

```json
{ "blocker": "<dateipfad-oder-stufe>", "reason": "<klartext>" }
```

## Sicherheits-Assertions

1. Der Sub-Agent KENNT das Optimierungsziel NICHT.
2. Keine stillen Defaults — fehlende Felder werden als `missing` markiert.
3. HTTP 4xx = FAIL/DEFECT, niemals PASS.

## Verschaltung

- **Aufrufer:** `single-test-start-grade` (PRD-15, Phase 2f)
- **Konsument:** `single-test-apply-improvement` (PRD-16, Phase 2f → Recursive-Loop in Phase 2h)
- **Spec-Bezug:**
  - Spec 1.1.0 §3 (Validity Rules — Empty-Context-Konvention)
  - Spec 1.1.0 §19 (Folder-Layout, Output-Pfad gitignored `grading-data/`)
