---
id: Q-single-test-01
area: single-test
dimension: docsUrlReachable
question: "Ist die docs-URL des Tools per HTTP 200 erreichbar?"
scoreType: boolean
weight: 0.5
determinism: deterministic
tier: P1
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/single-test.md
evaluatorTask: "Lies docs-URL aus schema.routes[0].docs und pruefe per HTTP-HEAD-Request."
outputSchemaRef: output-schemas/single-test.schema.json
personaRequired: false
version: 1.0.0
---

## Body
Test fixture A.
