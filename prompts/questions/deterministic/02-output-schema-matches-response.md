---
id: Q-single-test-02
area: single-test
dimension: outputSchemaMatch
question: "Does the output schema match the tool's real test response?"
scoreType: boolean
weight: 0.33
determinism: deterministic
tier: P1
filesToRead:
  - "{{schemaPath}}"
  - "{{responseFixturePath}}"
preInstructionRef: pre-instructions/single-test.md
evaluatorTask: "Validate schema.routes[0].response against a real live response from the endpoint."
outputSchemaRef: output-schemas/single-test.schema.json
personaRequired: false
version: 1.0.0
---

## Rationale

If the output schema does not match the real response, it causes parser errors.
The check is deterministic via JSON schema validation.

## Duplication Check

`flowmcp-core` validates schema structure but not the match against live responses, so this question remains.
