---
id: Q-about-selection-01
area: about-selection
dimension: aboutRouteExists
question: "Does an About route exist for the selection?"
scoreType: boolean
weight: 0.34
determinism: deterministic
tier: P6
filesToRead:
  - "{{aboutPath}}"
preInstructionRef: pre-instructions/about-selection.md
evaluatorTask: "Check for the presence of an About page for the selection."
outputSchemaRef: output-schemas/about-selection.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

The specification requires an About page per selection — if it is missing, the
persona cannot relate to the selection.

## Persona Application

Persona-driven for the entire area. Existence is deterministic, but the content
is evaluated persona-specifically in the non-deterministic questions.
