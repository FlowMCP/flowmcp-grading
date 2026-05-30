---
id: Q-tools-aggregate-schema-05
area: tools-aggregate-schema
dimension: routesCoherence
question: "Do the tools cover the most important API endpoints of the provider?"
scoreType: scale-1-5
weight: 0.5
determinism: non-deterministic
tier: P5
filesToRead:
  - "{{schemaPath}}"
  - "{{providerDocsPath}}"
preInstructionRef: pre-instructions/tools-aggregate-schema.md
evaluatorTask: "Compare the schema routes with the provider API: are the critical endpoints covered?"
outputSchemaRef: output-schemas/tools-aggregate-schema.schema.json
personaRequired: false
version: 1.0.0
---

## Rationale

A schema that covers only 3 of 30 API endpoints has a coverage problem.
The assessment requires domain knowledge.
