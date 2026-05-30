---
id: Q-namespace-skills-02
area: namespace-skills
dimension: skillAdequacy
question: "Does the namespace skill represent a persona workflow?"
scoreType: scale-1-5
weight: 0.33
determinism: non-deterministic
tier: S3
filesToRead:
  - "{{skillPath}}"
  - "{{personaPath}}"
preInstructionRef: pre-instructions/namespace-skills.md
evaluatorTask: "Check whether the namespace skill covers a typical persona workflow within the namespace."
outputSchemaRef: output-schemas/namespace-skills.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

The namespace skill is the namespace's persona application example.

## Persona Application

The persona workflow serves as the basis for assessment.
