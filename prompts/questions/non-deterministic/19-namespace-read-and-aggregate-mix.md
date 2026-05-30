---
id: Q-tools-aggregate-namespace-04
area: tools-aggregate-namespace
dimension: domainCoverage
question: "Do the tools contain both read cases and aggregate cases?"
scoreType: scale-1-5
weight: 0.2
determinism: non-deterministic
tier: P4
filesToRead:
  - "{{namespacePath}}"
preInstructionRef: pre-instructions/tools-aggregate-namespace.md
evaluatorTask: "Check whether there is a healthy mix of single-item reads and aggregations."
outputSchemaRef: output-schemas/tools-aggregate-namespace.schema.json
personaRequired: false
version: 1.0.0
---

## Rationale

A namespace with only `get-X-by-id` is limited. Aggregations (`list`, `top-N`)
are often the endpoints more relevant to the user.
