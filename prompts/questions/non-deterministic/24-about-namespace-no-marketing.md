---
id: Q-about-namespace-05
area: about-namespace
dimension: useCaseClarity
question: "Is the About page free of marketing language?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P7
filesToRead:
  - "{{aboutPath}}"
preInstructionRef: pre-instructions/about-namespace.md
evaluatorTask: "Assess the language of the About page: descriptive vs. promotional."
outputSchemaRef: output-schemas/about-namespace.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

Marketing language obscures the namespace's real capability and reduces the trust
of technical personas.

## Persona Application

Decision-makers and AI engineers have different tolerance for marketing — the lens
context decides between a hard and a soft fail.
