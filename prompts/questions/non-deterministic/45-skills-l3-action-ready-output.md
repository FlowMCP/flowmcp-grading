---
id: Q-selection-skills-L3-04
area: selection-skills-L3
dimension: domainAlignment
question: "Is the L3 output action-ready for the persona?"
scoreType: scale-1-5
weight: 0.34
determinism: non-deterministic
tier: S4
filesToRead:
  - "{{skillPath}}"
  - "{{personaPath}}"
  - "{{lensPath}}"
preInstructionRef: pre-instructions/selection-skills-L3.md
evaluatorTask: "Assess whether the persona can act directly on the L3 output."
outputSchemaRef: output-schemas/selection-skills-L3.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

Action-ready means the output contains recommendations plus rationale, not just raw data.

## Persona Application

The definition of action varies: a trader acts on the market, a decision-maker makes a decision.
