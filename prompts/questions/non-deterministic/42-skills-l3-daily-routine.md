---
id: Q-selection-skills-L3-01
area: selection-skills-L3
dimension: skillAdequacy
question: "Bildet der L3-Skill eine Daily-Use-Routine fuer die Persona ab?"
scoreType: scale-1-5
weight: 0.34
determinism: non-deterministic
tier: S3
filesToRead:
  - "{{skillPath}}"
  - "{{personaPath}}"
preInstructionRef: pre-instructions/selection-skills-L3.md
evaluatorTask: "Bewerte ob der L3-Skill einer tatsaechlichen Daily-Routine entspricht."
outputSchemaRef: output-schemas/selection-skills-L3.schema.json
personaRequired: true
version: 1.0.0
---

## Begruendung

L3 ist der hoechste Komposition-Level — soll Persona-Daily-Workflows direkt
bedienen.

## Persona-Anwendung

Daily-Routine ist persona-spezifisch (Trader: Portfolio-Check; Decision-Maker: Health-Dashboard).
