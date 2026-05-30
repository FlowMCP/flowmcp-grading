---
id: Q-namespace-skills-06
area: namespace-skills
dimension: domainAlignment
question: "Does the namespace skill stay within its own namespace?"
scoreType: boolean
weight: 0.33
determinism: non-deterministic
tier: S4
filesToRead:
  - "{{skillPath}}"
  - "{{namespacePath}}"
preInstructionRef: pre-instructions/namespace-skills.md
evaluatorTask: "Check whether the skill calls no tools from other namespaces."
outputSchemaRef: output-schemas/namespace-skills.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

Cross-namespace skills belong at the selection level (L3), not in namespace skills.

## Persona Application

Drawing the persona workflow boundary is an architectural requirement.
