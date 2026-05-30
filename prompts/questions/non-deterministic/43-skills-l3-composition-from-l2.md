---
id: Q-selection-skills-L3-02
area: selection-skills-L3
dimension: skillAdequacy
question: "Is the L3 composition built logically from L2 skills?"
scoreType: scale-1-5
weight: 0.33
determinism: non-deterministic
tier: S3
filesToRead:
  - "{{skillPath}}"
  - "{{l2SkillsPath}}"
preInstructionRef: pre-instructions/selection-skills-L3.md
evaluatorTask: "Check whether L3 builds sensibly on L2 skills (not directly on L1)."
outputSchemaRef: output-schemas/selection-skills-L3.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

The hierarchy is an architectural principle; L3 skips L2 only in exceptional cases.

## Persona Application

The persona workflow serves as the architectural justification.
