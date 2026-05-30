---
id: Q-selection-skills-L1-03
area: selection-skills-L1
dimension: personaFit
question: "Is the L1 input schema minimal (only required parameters)?"
scoreType: scale-1-5
weight: 0.5
determinism: non-deterministic
tier: S2
filesToRead:
  - "{{skillPath}}"
preInstructionRef: pre-instructions/selection-skills-L1.md
evaluatorTask: "Check whether the L1 input schema shows only the parameters that are truly needed."
outputSchemaRef: output-schemas/selection-skills-L1.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

Overloaded input schemas (all 30 API parameters visible) are not suitable for the persona.

## Persona Application

A trader lens has a higher expectation of minimalism than an engineer lens.
