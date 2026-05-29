---
id: Q-about-selection-05
area: about-selection
dimension: useCaseClarity
question: "Wird die Skill-Komposition (L1/L2/L3) auf der About-Page erklaert?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P7
filesToRead:
  - "{{aboutPath}}"
preInstructionRef: pre-instructions/about-selection.md
evaluatorTask: "Pruefe ob die About-Page die Skill-Levels und ihren Zusammenhang erklaert."
outputSchemaRef: output-schemas/about-selection.schema.json
personaRequired: true
version: 1.0.0
---

## Begruendung

Skills sind das User-Faceing Konzept. Ohne Erklaerung versteht die Persona die
Selection-Power nicht.

## Persona-Anwendung

AI-Engineer braucht die L1-L3-Hierarchie; Decision-Maker reicht ein Skill-Summary.
