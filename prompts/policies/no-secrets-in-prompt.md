---
policyId: no-secrets-in-prompt
version: 1.0.0
enforced: true
appliesTo: all
---

## Rule

No prompt artifact MAY contain API keys, secrets, tokens, passwords, or
`.env` contents. No dummy/mock credentials either, which could end up in the
prompt stream as an "example".

## Rationale

Open-source standard (FlowMCP GitHub upload rules). Prompts are potentially
logged, stored, and shared. Even mock credentials send the wrong message
(repo-quality standard). A prior incident exposed seven keys through direct
file operations on env files — never read env files with values.

## Enforcement in the PromptBuilder

PromptBuilder scans the final prompt string with the regex
`(API_KEY|SECRET|TOKEN|PASSWORD)\s*[:=]` and patterns for common key prefixes
(`sk-`, `pk_`, `eth_`). On a match: build error
`PB-101: secret pattern detected — refuse to emit`.

## Violation Examples

- Template contains a placeholder that would be filled directly with a real
  key (instead of a boolean presence flag such as
  `{{<PROVIDER>_KEY_PRESENT}}`)
- Files-to-read path points to `~/.flowmcp/.env`
- Persona lens file contains embedded example keys
