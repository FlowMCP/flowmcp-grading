---
id: Q-selection-skills-L2-01
area: selection-skills-L2
dimension: personaFit
question: "Is the L2 composition from L1 skills logical?"
scoreType: scale-1-5
weight: 0.5
determinism: non-deterministic
tier: S2
filesToRead:
  - "{{skillPath}}"
  - "{{l1SkillsPath}}"
preInstructionRef: pre-instructions/selection-skills-L2.md
evaluatorTask: "Check whether the L2 composition of L1 skills is assembled sensibly for the persona."
outputSchemaRef: output-schemas/selection-skills-L2.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

L2 is the first composition — an illogical combination (e.g. price + ToS lookup)
breaks the persona workflow.

## Persona Application

The persona workflow serves as ground truth.
