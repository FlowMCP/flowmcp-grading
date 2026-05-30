---
id: Q-selection-skills-L3-03
area: selection-skills-L3
dimension: skillAdequacy
question: "Is the L3 trigger phrased naturally in the persona's language?"
scoreType: scale-1-5
weight: 0.33
determinism: non-deterministic
tier: S3
filesToRead:
  - "{{skillPath}}"
  - "{{personaPath}}"
preInstructionRef: pre-instructions/selection-skills-L3.md
evaluatorTask: "Check whether the L3 trigger corresponds to a natural persona request."
outputSchemaRef: output-schemas/selection-skills-L3.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

Triggers like "morning-portfolio-update" are natural; "exec_l3_skill_42" is not.

## Persona Application

The trigger language must fit the persona lens.
