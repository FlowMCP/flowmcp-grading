---
id: Q-tools-aggregate-schema-01
area: tools-aggregate-schema
dimension: routesUniqueNames
question: "Are all route names within the schema unique?"
scoreType: boolean
weight: 0.25
determinism: deterministic
tier: P4
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/tools-aggregate-schema.md
evaluatorTask: "Collect all route.name values and check for duplicates."
outputSchemaRef: output-schemas/tools-aggregate-schema.schema.json
personaRequired: false
version: 1.0.0
---

## Rationale

Duplicates cause tool-call conflicts in the MCP client. The check is deterministic
via a set comparison.

## Duplication Check

`flowmcp-core` validates the route schema, but a duplicate check at the aggregate level is missing, so this question remains.
