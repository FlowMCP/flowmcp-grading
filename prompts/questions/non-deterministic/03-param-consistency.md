---
id: Q-single-test-06
area: single-test
dimension: paramConsistency
question: "Are the parameter names consistent (snake_case vs. camelCase)?"
scoreType: scale-1-5
weight: 0.33
determinism: non-deterministic
tier: P2
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/single-test.md
evaluatorTask: "Check the naming consistency of all parameters within a route."
outputSchemaRef: output-schemas/single-test.schema.json
personaRequired: false
version: 1.0.0
---

## Rationale

Mixed styles (e.g. `user_id` alongside `tokenAddress`) confuse the user and break
with the tool convention.
