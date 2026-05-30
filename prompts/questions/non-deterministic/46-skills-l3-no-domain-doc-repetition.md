---
id: Q-selection-skills-L3-05
area: selection-skills-L3
dimension: domainAlignment
question: "Does L3 avoid repeating the domain documentation?"
scoreType: scale-1-5
weight: 0.33
determinism: non-deterministic
tier: S4
filesToRead:
  - "{{skillPath}}"
  - "{{domainKnowledgePath}}"
preInstructionRef: pre-instructions/selection-skills-L3.md
evaluatorTask: "Check whether L3 complements the domain documentation rather than repeating it one-to-one."
outputSchemaRef: output-schemas/selection-skills-L3.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

Domain documentation belongs in `domain-knowledge/`; L3 focuses on the persona workflow.

## Persona Application

The persona workflow serves as the line of differentiation.
