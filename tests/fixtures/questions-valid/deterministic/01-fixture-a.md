---
id: Q-single-test-01
area: single-test
dimension: docsUrlReachable
question: "Is the tool's docs URL reachable via HTTP 200?"
scoreType: boolean
weight: 0.5
determinism: deterministic
tier: P1
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/single-test.md
evaluatorTask: "Read the docs URL from schema.routes[0].docs and check it via an HTTP HEAD request."
outputSchemaRef: output-schemas/single-test.schema.json
personaRequired: false
version: 1.0.0
---

## Body
Test fixture A.
