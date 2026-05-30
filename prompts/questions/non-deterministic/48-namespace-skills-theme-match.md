---
id: Q-namespace-skills-01
area: namespace-skills
dimension: skillAdequacy
question: "Does the namespace skill match the namespace theme?"
scoreType: scale-1-5
weight: 0.34
determinism: non-deterministic
tier: S3
filesToRead:
  - "{{skillPath}}"
  - "{{namespacePath}}"
preInstructionRef: pre-instructions/namespace-skills.md
evaluatorTask: "Assess whether the namespace skill fits the namespace thematically."
outputSchemaRef: output-schemas/namespace-skills.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

A crypto namespace skill that performs a patent lookup is off-topic.

## Persona Application

The persona default applies to namespace skills.
