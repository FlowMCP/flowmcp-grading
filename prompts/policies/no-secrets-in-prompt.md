---
policyId: no-secrets-in-prompt
version: 1.0.0
enforced: true
appliesTo: all
---

## Regel

Kein Prompt-Artefakt DARF API-Keys, Secrets, Tokens, Passwoerter oder
`.env`-Inhalte enthalten. Auch keine Dummy-/Mock-Credentials, die im
Prompt-Stream als „Beispiel" landen koennten.

## Begruendung

Open-Source-Standard (FlowMCP CLAUDE.md GitHub Upload-Regeln). Prompts werden
potentiell geloggt, gespeichert, geteilt. Selbst Mock-Credentials senden
eine falsche Botschaft (CLAUDE.md repo-quality). FlowMCP-Memory
`feedback_never_read_env_files_with_values` — Incident 2026-05-15 mit 7
exponierten Keys durch direkte Datei-Operationen.

## Durchsetzung im PromptBuilder

PromptBuilder scannt den finalen Prompt-String mit Regex
`(API_KEY|SECRET|TOKEN|PASSWORD)\s*[:=]` und Pattern fuer haeufige
Key-Praefixe (`sk-`, `pk_`, `eth_`). Bei Treffer: Build-Fehler
`PB-101: secret pattern detected — refuse to emit`.

## Verletzungs-Beispiele

- Template enthaelt einen Placeholder, der direkt mit einem echten Key
  gefuellt wuerde (statt mit einem Boolean-Praesenz-Flag wie
  `{{<PROVIDER>_KEY_PRESENT}}`)
- Files-to-Read-Pfad zeigt auf `~/.flowmcp/.env`
- Persona-Lens-File enthaelt eingebettete Beispiel-Schluessel
