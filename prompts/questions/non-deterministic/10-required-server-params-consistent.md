---
id: Q-tools-aggregate-schema-04
area: tools-aggregate-schema
dimension: requiredServerParamsConsistent
question: "Are the requiredServerParams consistently identical across all routes?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P4
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/tools-aggregate-schema.md
evaluatorTask: "Check whether all routes use the same set of requiredServerParams."
outputSchemaRef: output-schemas/tools-aggregate-schema.schema.json
personaRequired: false
version: 1.0.0
---

## Rationale

If `route-A` needs `API_KEY` but `route-B` needs `SECRET_KEY`, that is an
architectural sign that the routes do not belong in the same schema.
