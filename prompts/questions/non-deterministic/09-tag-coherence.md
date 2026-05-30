---
id: Q-tools-aggregate-schema-03
area: tools-aggregate-schema
dimension: tagCoherence
question: "Are the tags assigned coherently and meaningfully across the routes?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P4
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/tools-aggregate-schema.md
evaluatorTask: "Assess the tag assignment: consistent across routes, no tag chaos."
outputSchemaRef: output-schemas/tools-aggregate-schema.schema.json
personaRequired: false
version: 1.0.0
---

## Rationale

Tags structure the tool grouping in the MCP client. Inconsistent tags fragment
the view.
