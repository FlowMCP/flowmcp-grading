---
id: Q-selection-skills-L1-04
area: selection-skills-L1
dimension: personaFit
question: "Is the L1 use case relevant to the persona?"
scoreType: scale-1-5
weight: 0.5
determinism: non-deterministic
tier: S2
filesToRead:
  - "{{skillPath}}"
  - "{{personaPath}}"
  - "{{lensPath}}"
preInstructionRef: pre-instructions/selection-skills-L1.md
evaluatorTask: "Check the persona relevance of the L1 use case."
outputSchemaRef: output-schemas/selection-skills-L1.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

An L1 skill that the persona never needs is dead weight.

## Persona Application

The lens-specific use-case list serves as ground truth.
