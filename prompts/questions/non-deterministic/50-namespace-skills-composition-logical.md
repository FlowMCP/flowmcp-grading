---
id: Q-namespace-skills-03
area: namespace-skills
dimension: skillAdequacy
question: "Is the composition of namespace tools logical?"
scoreType: scale-1-5
weight: 0.33
determinism: non-deterministic
tier: S3
filesToRead:
  - "{{skillPath}}"
  - "{{namespacePath}}"
preInstructionRef: pre-instructions/namespace-skills.md
evaluatorTask: "Assess the tool composition of the namespace skill for logic and ordering."
outputSchemaRef: output-schemas/namespace-skills.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

A logical order (e.g. lookup first, then aggregation) makes the skill traceable.

## Persona Application

The logic of the persona workflow serves as the yardstick.
