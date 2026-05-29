# Sorgfalts-Policies fuer den PromptBuilder

| # | Policy | Status | appliesTo |
|---|--------|--------|-----------|
| 1 | [no-secrets-in-prompt](no-secrets-in-prompt.md) | enforced | all |
| 2 | [evaluator-neutrality](evaluator-neutrality.md) | enforced | all |
| 3 | [http-400-not-pass](http-400-not-pass.md) | enforced | areas with tool-executable/response-status |
| 4 | [no-hidden-defaults](no-hidden-defaults.md) | enforced | all |
| 5 | [persona-only-where-required](persona-only-where-required.md) | enforced | all (frontmatter-driven) |
| 6 | [file-output-rules](file-output-rules.md) | enforced | all |

Policies werden vom `PromptBuilder.mjs` (PRD-04, Phase 2d) maschinell durchgesetzt.
Jede Policy-Datei ist atomar, versioniert (semver) und referenziert ihre Quelle
(Memo / Memory / Spec).

## Error-Code-Praefix

Alle Policy-Verletzungen werfen Error-Codes mit Praefix `PB-NNN`
(PromptBuilder). Zuordnung:

| Code | Policy | Bedeutung |
|------|--------|-----------|
| `PB-101` | no-secrets-in-prompt | Secret-Pattern im Prompt erkannt |
| `PB-102` | evaluator-neutrality | Generator-Hinweis im Evaluator-Prompt |
| `PB-103` | http-400-not-pass | HTTP 4xx als PASS klassifiziert |
| `PB-104` | no-hidden-defaults | Placeholder unfilled, kein silent default |
| `PB-201` | persona-only-where-required | personaRequired=true, Persona fehlt |
| `PB-202` | persona-only-where-required | Persona uebergeben bei neutralem Bereich |
| `PB-301` | file-output-rules | Pfad ausserhalb erlaubter Folder-Typen |
