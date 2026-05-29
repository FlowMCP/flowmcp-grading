---
id: Q-about-namespace-05
area: about-namespace
dimension: useCaseClarity
question: "Ist die About-Page frei von Marketing-Sprache?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P7
filesToRead:
  - "{{aboutPath}}"
preInstructionRef: pre-instructions/about-namespace.md
evaluatorTask: "Bewerte die Sprache der About-Page: deskriptiv vs. werblich."
outputSchemaRef: output-schemas/about-namespace.schema.json
personaRequired: true
version: 1.0.0
---

## Begruendung

Marketing-Sprache verschleiert die echte Faehigkeit des Namespace und mindert
das Vertrauen technischer Personas.

## Persona-Anwendung

Decision-Maker und AI-Engineer haben unterschiedliche Toleranz fuer Marketing —
Lens-Kontext entscheidet ueber Hard/Soft-Fail.
