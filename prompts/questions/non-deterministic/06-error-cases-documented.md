---
id: Q-single-test-09
area: single-test
dimension: errorCasesDocumented
question: "Are the error cases (4xx/5xx) documented in the schema?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P3
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/single-test.md
evaluatorTask: "Check whether known API errors (rate limit, auth failure, not found) are documented."
outputSchemaRef: output-schemas/single-test.schema.json
personaRequired: false
version: 1.0.0
---

## Rationale

Undocumented errors lead to trial-and-error debugging for the user.
