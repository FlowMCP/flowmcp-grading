---
id: Q-selection-skills-L2-05
area: selection-skills-L2
dimension: skillAdequacy
question: "Bildet der L2-Use-Case einen echten Persona-Workflow ab?"
scoreType: scale-1-5
weight: 0.33
determinism: non-deterministic
tier: S3
filesToRead:
  - "{{skillPath}}"
  - "{{personaPath}}"
  - "{{lensPath}}"
preInstructionRef: pre-instructions/selection-skills-L2.md
evaluatorTask: "Pruefe ob der L2-Use-Case einem typischen Persona-Workflow entspricht."
outputSchemaRef: output-schemas/selection-skills-L2.schema.json
personaRequired: true
version: 1.0.0
---

## Begruendung

Workflow-Bezug ist der eigentliche L2-Mehrwert.

## Persona-Anwendung

Lens-spezifische Workflow-Liste als Ground-Truth.
