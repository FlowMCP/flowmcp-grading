---
id: Q-tools-aggregate-schema-06
area: tools-aggregate-schema
dimension: descriptionVoice
question: "Ist die Description-Voice ueber alle Routes konsistent (3rd-Person vs. Imperativ)?"
scoreType: scale-1-5
weight: 0.5
determinism: non-deterministic
tier: P5
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/tools-aggregate-schema.md
evaluatorTask: "Pruefe die Description-Voice ueber alle Routes. Spec 06 §4 gibt 3rd-Person vor."
outputSchemaRef: output-schemas/tools-aggregate-schema.schema.json
personaRequired: false
version: 1.0.0
---

## Begruendung

Mischformen (manche Routes "Returns ...", andere "Get the ...") wirken
inkonsistent und unprofessionell.
