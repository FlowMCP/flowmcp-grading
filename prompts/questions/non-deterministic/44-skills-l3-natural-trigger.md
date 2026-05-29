---
id: Q-selection-skills-L3-03
area: selection-skills-L3
dimension: skillAdequacy
question: "Ist der L3-Trigger natuerlich in der Persona-Sprache formuliert?"
scoreType: scale-1-5
weight: 0.33
determinism: non-deterministic
tier: S3
filesToRead:
  - "{{skillPath}}"
  - "{{personaPath}}"
preInstructionRef: pre-instructions/selection-skills-L3.md
evaluatorTask: "Pruefe ob der L3-Trigger einer natuerlichen Persona-Anfrage entspricht."
outputSchemaRef: output-schemas/selection-skills-L3.schema.json
personaRequired: true
version: 1.0.0
---

## Begruendung

Trigger wie "morning-portfolio-update" sind natuerlich; "exec_l3_skill_42" sind es nicht.

## Persona-Anwendung

Trigger-Sprache muss zur Persona-Lens passen.
