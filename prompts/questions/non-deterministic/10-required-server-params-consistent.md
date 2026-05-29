---
id: Q-tools-aggregate-schema-04
area: tools-aggregate-schema
dimension: requiredServerParamsConsistent
question: "Sind die requiredServerParams ueber alle Routes konsistent identisch?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P4
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/tools-aggregate-schema.md
evaluatorTask: "Pruefe ob alle Routes denselben Satz requiredServerParams nutzen."
outputSchemaRef: output-schemas/tools-aggregate-schema.schema.json
personaRequired: false
version: 1.0.0
---

## Begruendung

Wenn `route-A` `API_KEY` braucht, `route-B` aber `SECRET_KEY`, ist das ein
Architektur-Indiz, dass die Routes nicht in dasselbe Schema gehoeren.
