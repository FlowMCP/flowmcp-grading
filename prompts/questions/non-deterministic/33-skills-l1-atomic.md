---
id: Q-selection-skills-L1-01
area: selection-skills-L1
dimension: coverage
question: "Is the L1 skill atomic (exactly one tool call)?"
scoreType: boolean
weight: 0.5
determinism: non-deterministic
tier: S1
filesToRead:
  - "{{skillPath}}"
preInstructionRef: pre-instructions/selection-skills-L1.md
evaluatorTask: "Check whether the L1 skill calls exactly one tool (atomic-skill definition)."
outputSchemaRef: output-schemas/selection-skills-L1.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

The specification defines L1 as atomic. Multi-tool L1 skills break the composition.

## Persona Application

Persona is mandatory per the specification — it applies at all three levels.
