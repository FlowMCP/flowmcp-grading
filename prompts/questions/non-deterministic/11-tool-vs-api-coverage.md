---
id: Q-tools-aggregate-schema-05
area: tools-aggregate-schema
dimension: routesCoherence
question: "Decken die Tools die wichtigsten API-Endpunkte des Providers ab?"
scoreType: scale-1-5
weight: 0.5
determinism: non-deterministic
tier: P5
filesToRead:
  - "{{schemaPath}}"
  - "{{providerDocsPath}}"
preInstructionRef: pre-instructions/tools-aggregate-schema.md
evaluatorTask: "Vergleiche Schema-Routes mit Provider-API: Sind kritische Endpunkte abgedeckt?"
outputSchemaRef: output-schemas/tools-aggregate-schema.schema.json
personaRequired: false
version: 1.0.0
---

## Begruendung

Ein Schema, das nur 3 von 30 API-Endpunkten abdeckt, hat ein Coverage-Problem.
Die Bewertung benoetigt Domain-Kenntnis.
