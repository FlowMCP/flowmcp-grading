---
id: Q-about-selection-06
area: about-selection
dimension: useCaseClarity
question: "Is the About page free of marketing language?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P7
filesToRead:
  - "{{aboutPath}}"
preInstructionRef: pre-instructions/about-selection.md
evaluatorTask: "Assess the language of the selection About: descriptive vs. promotional."
outputSchemaRef: output-schemas/about-selection.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

Marketing language obscures the substance of the selection.

## Persona Application

Persona-specific tolerance for marketing (see the namespace About marketing question, Q-about-namespace-05).
