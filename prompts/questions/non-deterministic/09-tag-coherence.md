---
id: Q-tools-aggregate-schema-03
area: tools-aggregate-schema
dimension: tagCoherence
question: "Sind die Tags ueber die Routes kohaerent und sinnvoll vergeben?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P4
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/tools-aggregate-schema.md
evaluatorTask: "Bewerte die Tag-Vergabe: konsistent ueber Routes, kein Tag-Chaos."
outputSchemaRef: output-schemas/tools-aggregate-schema.schema.json
personaRequired: false
version: 1.0.0
---

## Begruendung

Tags strukturieren die Tool-Gruppierung im MCP-Client. Inkonsistente Tags
fragmentieren die Sicht.
