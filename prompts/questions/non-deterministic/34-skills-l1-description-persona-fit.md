---
id: Q-selection-skills-L1-02
area: selection-skills-L1
dimension: coverage
question: "Does the L1 description fit the persona linguistically?"
scoreType: scale-1-5
weight: 0.5
determinism: non-deterministic
tier: S1
filesToRead:
  - "{{skillPath}}"
  - "{{personaPath}}"
preInstructionRef: pre-instructions/selection-skills-L1.md
evaluatorTask: "Assess whether the L1 description is phrased in the persona's language."
outputSchemaRef: output-schemas/selection-skills-L1.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

The L1 description is the first contact with the persona — its wording determines
understanding.

## Persona Application

A trader speaks differently from an engineer; the description should fit the persona lens.
