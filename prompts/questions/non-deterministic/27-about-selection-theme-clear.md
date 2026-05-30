---
id: Q-about-selection-02
area: about-selection
dimension: personaReference
question: "Is the selection theme clearly recognizable?"
scoreType: scale-1-5
weight: 0.33
determinism: non-deterministic
tier: P6
filesToRead:
  - "{{aboutPath}}"
  - "{{personaPath}}"
preInstructionRef: pre-instructions/about-selection.md
evaluatorTask: "Assess whether the selection theme becomes clear from the About text."
outputSchemaRef: output-schemas/about-selection.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

A selection without a clear theme is a random collection of tools.

## Persona Application

The theme must fit the persona — a mismatch is a hard fail.
