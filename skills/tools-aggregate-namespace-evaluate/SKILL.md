---
name: tools-aggregate-namespace-evaluate
description: Evaluator-Skill fuer Bereich tools-aggregate-namespace (Area 4, Memo 082 Kap 7.1). Empfaengt das vom Generator-Skill tools-aggregate-namespace-start-grade erzeugte Prompt-Artefakt und orchestriert einen frischen LLM-Sub-Agent in leerem Kontext. Erzwingt Strict-JSON-Output gemaess prompts/output-schemas/tools-aggregate-namespace.schema.json. Persona-Anwendung gemaess Kap 7.4 — Bereich 4 ist NEUTRAL (personaRequired: false).
allowed-tools: Read, Grep, Glob
model: inherit
---

# tools-aggregate-namespace-evaluate

## Zweck

Dieser Skill wird vom Generator-Skill `tools-aggregate-namespace-start-grade` aufgerufen. Er empfaengt das vom `PromptBuilder.build(...)` erzeugte Prompt-Artefakt per Tool-Result und orchestriert einen **frischen Sub-Agent** zur Bewertung.

## Input

Vom Aufrufer (`tools-aggregate-namespace-start-grade`) wird ein einziger String uebergeben:

| Parameter | Pflicht | Format | Quelle |
|-----------|---------|--------|--------|
| `promptArtifact` | ja | String | `PromptBuilder.build(...)` aus PRD-04 (Phase 2d) |

Quelle der Pflicht-Block-Logik: `prompts/pre-instructions/tools-aggregate-namespace.md` (PRD-09/10, Phase 2d).

## Architektur-Rolle (Memo 082 Kap 4.2/4.3)

- Generator-Skill `tools-aggregate-namespace-start-grade` kennt das Optimierungsziel und treibt den Loop.
- Dieser Evaluator-Skill darf das Optimierungsziel **NICHT** in den Sub-Agent-Kontext einspeisen.
- Der Sub-Agent sieht ausschliesslich:
  1. Den Files-to-Read-Block aus dem Prompt-Artefakt
  2. Die Eval-Fragen des Bereichs `tools-aggregate-namespace`
  3. Das Output-Schema `prompts/output-schemas/tools-aggregate-namespace.schema.json`
  4. Den Persona-Block (nur wenn `personaRequired: true`; bei `tools-aggregate-namespace` LEER)

## Sub-Agent-Konfiguration (Memo 082 Kap 11)

- **Kontext:** LEER. Keine Vor-Session-Memory.
- **Tools:** NUR `Read`, `Grep`, `Glob`. Kein `Write`, kein `Bash`, kein `Edit`.
- **Output:** Strict-JSON gemaess `prompts/output-schemas/tools-aggregate-namespace.schema.json`.
- **Persona-Anwendung (Kap 7.4):** `personaRequired: false`. Bereich wird **neutral** bewertet. `persona`-Feld im Output ist `null`.

## Ablauf

1. **Empfangen** — Generator uebergibt das Prompt-Artefakt (String).
2. **Pre-Check Files-to-Read** — Bei Fehler **AUSSCHLIESSLICH**:

   ```json
   { "blocker": "<pfad>", "reason": "<grund>" }
   ```

   und abbrechen (Kap 8).
3. **Sub-Agent starten** — Frischer Sub-Agent mit leerem Kontext.
4. **Files lesen** — In **strikter Reihenfolge**.
5. **Fragen beantworten** — Eval-Fragen des Bereichs `tools-aggregate-namespace`.
6. **HTTP-Status-Auswertung** — Falls relevant: 4xx = **NIEMALS** PASS (Memory `feedback_http_400_is_not_pass`).
7. **Strict-JSON validieren** — Bei Verletzung: `{ "blocker": "schema-validation", "reason": "<details>" }`.
8. **Rueckgabe** — Per Tool-Result an `tools-aggregate-namespace-apply-improvement` (PRD-16).

## Output-Format

Strict-JSON gemaess `prompts/output-schemas/tools-aggregate-namespace.schema.json`. Pflichtfelder:

| Feld | Typ | Wert / Constraint |
|------|-----|--------------------|
| `gradingId` | string | `<schemaHash>--<ISO timestamp>` |
| `schemaHash` | string | 8-hex sha256 prefix |
| `area` | const | `"tools-aggregate-namespace"` |
| `iteration` | integer | 1..5 |
| `timestamp` | string | ISO-8601 |
| `persona` | null | `null` (NEUTRAL) |
| `answers` | array | 5 Eintraege (Q-tools-aggregate-namespace-01..05) |
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

- **Aufrufer:** `tools-aggregate-namespace-start-grade` (PRD-15, Phase 2f)
- **Konsument:** `tools-aggregate-namespace-apply-improvement` (PRD-16)
- **Spec-Bezug:** Spec 1.1.0 §3, §19
