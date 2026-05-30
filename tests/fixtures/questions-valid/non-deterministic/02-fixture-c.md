---
id: Q-about-namespace-01
area: about-namespace
dimension: personaReference
question: "Is a persona reference present?"
scoreType: scale-1-5
weight: 1.0
determinism: non-deterministic
tier: P6
filesToRead:
  - "{{aboutPath}}"
  - "{{personaPath}}"
preInstructionRef: pre-instructions/about-namespace.md
evaluatorTask: "Check the persona reference."
outputSchemaRef: output-schemas/about-namespace.schema.json
personaRequired: true
version: 1.0.0
---

## Body
Test fixture C (with persona).
