---
id: Q-single-test-03
area: single-test
dimension: apiKeyDomainMatch
question: "Does the API key domain match the provider domain in the schema?"
scoreType: boolean
weight: 0.33
determinism: deterministic
tier: P1
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/single-test.md
evaluatorTask: "Compare the requiredServerParams key names with the base URL domain in the schema."
outputSchemaRef: output-schemas/single-test.schema.json
personaRequired: false
version: 1.0.0
---

## Rationale

If a schema references, for example, `ETHERSCAN_API_KEY` but the base URL points to
`api.coingecko.com`, the identity is broken — the user's key would be sent to the
wrong provider.

## Duplication Check

Not covered by `flowmcp-core`, so this question remains.
