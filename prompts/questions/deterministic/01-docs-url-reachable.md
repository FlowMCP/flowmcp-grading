---
id: Q-single-test-01
area: single-test
dimension: docsUrlReachable
question: "Is the tool's docs URL reachable with an HTTP 200 status?"
scoreType: boolean
weight: 0.34
determinism: deterministic
tier: P1
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/single-test.md
evaluatorTask: "Read the docs URL from schema.routes[0].docs and verify it via an HTTP HEAD request."
outputSchemaRef: output-schemas/single-test.schema.json
personaRequired: false
version: 1.0.0
---

## Rationale

An unreachable docs URL makes the tool non-traceable for users.
The check is purely technical: HTTP status code 200.

## Duplication Check

`flowmcp-core` performs no HTTP reachability check, so this question remains in the eval catalog.
