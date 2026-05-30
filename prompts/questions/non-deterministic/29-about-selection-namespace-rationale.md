---
id: Q-about-selection-04
area: about-selection
dimension: useCaseClarity
question: "Does the About page explain why each namespace is included?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P7
filesToRead:
  - "{{aboutPath}}"
preInstructionRef: pre-instructions/about-selection.md
evaluatorTask: "Check whether the About page justifies the choice of namespaces."
outputSchemaRef: output-schemas/about-selection.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

Justifying the namespace choice makes the selection traceable.

## Persona Application

A persona-relevant justification ("indispensable for traders") counts more than a
generic one ("popular").
