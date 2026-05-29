---
policyId: no-hidden-defaults
version: 1.0.0
enforced: true
appliesTo: all
---

## Regel

Templates, Pre-Instructions und Persona-Blocks DUERFEN keine stillen Defaults
enthalten (`x || "default"`, leere Placeholder-Fallbacks). Alle Parameter
MUESSEN explizit gefuellt sein oder ein Build-Fehler ausgeloest werden.

## Begruendung

FlowMCP-Memory `feedback_no_hidden_defaults` + `feedback_no_silent_defaults`
(Verweis aus CLAUDE.md). Stille Defaults verzerren Eval-Ergebnisse und sind
nicht reproduzierbar. Die Persona-Optional-Logik (Memo 082 Kap 7.4) ist
eine explizit deklarierte Variation, kein stiller Default.

## Durchsetzung im PromptBuilder

PromptBuilder wirft Fehler bei nicht-fuellbaren `{{...}}`-Placeholdern.
Kein automatischer Leerstring-Ersatz. Persona-Block bei
`personaRequired: false` wird durch eine **explizit deklarierte**
Leerstring-Logik ersetzt (siehe Memo 082 Kap 7.4 Konsequenz-Absatz). Error-Code:
`PB-104: placeholder unfilled — no silent default permitted`.

## Verletzungs-Beispiele

- `PromptBuilder` enthaelt `template.replace("{{X}}", value || "")` — still
- Frontmatter `personaRequired: false` ohne explizite Leer-Block-Markierung
  im Template-Body
- Files-to-Read-Liste enthaelt optionalen Pfad ohne
  `{{IF_PRESENT}}`-Marker
