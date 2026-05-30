---
id: Q-namespace-description-03
area: namespace-description
dimension: namespaceDescriptionClarity
question: "Is the boundary to other namespaces named explicitly?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P4
filesToRead:
  - "{{namespacePath}}"
preInstructionRef: pre-instructions/namespace-description.md
evaluatorTask: "Check whether the namespace explains its boundaries (what is included, what is not)."
outputSchemaRef: output-schemas/namespace-description.schema.json
personaRequired: false
version: 1.0.0
---

## Rationale

Clear boundaries help with tool selection. Without them, the user will look for
tools in the wrong namespace.
