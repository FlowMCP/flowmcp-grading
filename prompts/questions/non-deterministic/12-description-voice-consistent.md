---
id: Q-tools-aggregate-schema-06
area: tools-aggregate-schema
dimension: descriptionVoice
question: "Is the description voice consistent across all routes (third person vs. imperative)?"
scoreType: scale-1-5
weight: 0.5
determinism: non-deterministic
tier: P5
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/tools-aggregate-schema.md
evaluatorTask: "Check the description voice across all routes. The specification mandates third person."
outputSchemaRef: output-schemas/tools-aggregate-schema.schema.json
personaRequired: false
version: 1.0.0
---

## Rationale

Mixed styles (some routes "Returns ...", others "Get the ...") look inconsistent
and unprofessional.
