# Diligence Policies for the PromptBuilder

| # | Policy | Status | appliesTo |
|---|--------|--------|-----------|
| 1 | [no-secrets-in-prompt](no-secrets-in-prompt.md) | enforced | all |
| 2 | [evaluator-neutrality](evaluator-neutrality.md) | enforced | all |
| 3 | [http-400-not-pass](http-400-not-pass.md) | enforced | areas with tool-executable/response-status |
| 4 | [no-hidden-defaults](no-hidden-defaults.md) | enforced | all |
| 5 | [persona-only-where-required](persona-only-where-required.md) | enforced | all (frontmatter-driven) |
| 6 | [file-output-rules](file-output-rules.md) | enforced | all |

Policies are enforced mechanically by `PromptBuilder.mjs`.
Each policy file is atomic, versioned (semver), and references its source
(grading spec).

## Error-Code Prefix

All policy violations throw error codes with the prefix `PB-NNN`
(PromptBuilder). Mapping:

| Code | Policy | Meaning |
|------|--------|---------|
| `PB-101` | no-secrets-in-prompt | Secret pattern detected in prompt |
| `PB-102` | evaluator-neutrality | Generator hint in evaluator prompt |
| `PB-103` | http-400-not-pass | HTTP 4xx classified as PASS |
| `PB-104` | no-hidden-defaults | Placeholder unfilled, no silent default |
| `PB-201` | persona-only-where-required | personaRequired=true, persona missing |
| `PB-202` | persona-only-where-required | Persona supplied for a neutral area |
| `PB-301` | file-output-rules | Path outside the allowed folder types |
