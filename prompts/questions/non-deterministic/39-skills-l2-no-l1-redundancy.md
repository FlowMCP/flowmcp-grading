---
id: Q-selection-skills-L2-03
area: selection-skills-L2
dimension: skillAdequacy
question: "Does L2 avoid redundancy with L1 skills?"
scoreType: scale-1-5
weight: 0.34
determinism: non-deterministic
tier: S3
filesToRead:
  - "{{skillPath}}"
  - "{{l1SkillsPath}}"
preInstructionRef: pre-instructions/selection-skills-L2.md
evaluatorTask: "Check whether L2 does not repeat an L1 skill one-to-one."
outputSchemaRef: output-schemas/selection-skills-L2.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

Redundant L2 skills confuse the user; each level must provide its own composition.

## Persona Application

The persona workflow assessment serves as the basis.
