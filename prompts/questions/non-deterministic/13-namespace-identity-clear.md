---
id: Q-namespace-description-01
area: namespace-description
dimension: namespaceDescriptionClarity
question: "Is the namespace identity stated clearly in one or two sentences?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P4
filesToRead:
  - "{{namespacePath}}"
preInstructionRef: pre-instructions/namespace-description.md
evaluatorTask: "Assess the clarity of the namespace identity in the header text."
outputSchemaRef: output-schemas/namespace-description.schema.json
personaRequired: false
version: 1.0.0
---

## Rationale

If the namespace header does not explain "What is this?", the user has to read the
entire tools catalog.
