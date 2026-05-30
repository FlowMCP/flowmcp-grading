---
id: Q-namespace-skills-05
area: namespace-skills
dimension: domainAlignment
question: "Is the reference to the domain knowledge document clear?"
scoreType: scale-1-5
weight: 0.33
determinism: non-deterministic
tier: S4
filesToRead:
  - "{{skillPath}}"
  - "{{domainKnowledgePath}}"
preInstructionRef: pre-instructions/namespace-skills.md
evaluatorTask: "Check whether the skill references the domain knowledge document."
outputSchemaRef: output-schemas/namespace-skills.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

The domain knowledge document is the source of truth — a skill without a reference is detached.

## Persona Application

The persona workflow justifies the domain reference.
