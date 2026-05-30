---
id: Q-selection-skills-L2-05
area: selection-skills-L2
dimension: skillAdequacy
question: "Does the L2 use case represent a genuine persona workflow?"
scoreType: scale-1-5
weight: 0.33
determinism: non-deterministic
tier: S3
filesToRead:
  - "{{skillPath}}"
  - "{{personaPath}}"
  - "{{lensPath}}"
preInstructionRef: pre-instructions/selection-skills-L2.md
evaluatorTask: "Check whether the L2 use case corresponds to a typical persona workflow."
outputSchemaRef: output-schemas/selection-skills-L2.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

The connection to a workflow is the actual added value of L2.

## Persona Application

The lens-specific workflow list serves as ground truth.
