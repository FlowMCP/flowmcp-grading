---
id: Q-tools-aggregate-schema-02
area: tools-aggregate-schema
dimension: namingConsistency
question: "Is the route naming consistent across all routes in the schema?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P4
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/tools-aggregate-schema.md
evaluatorTask: "Check whether all route names follow the same naming pattern (prefix, casing, word choice)."
outputSchemaRef: output-schemas/tools-aggregate-schema.schema.json
personaRequired: false
version: 1.0.0
---

## Rationale

Inconsistent naming (`getUser`, `list_accounts`, `searchTx`) forces the user to
memorize. A uniform pattern makes the schema predictable.
