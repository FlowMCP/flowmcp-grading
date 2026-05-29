---
id: Q-selection-skills-L1-02
area: selection-skills-L1
dimension: coverage
question: "Passt die L1-Description sprachlich zur Persona?"
scoreType: scale-1-5
weight: 0.5
determinism: non-deterministic
tier: S1
filesToRead:
  - "{{skillPath}}"
  - "{{personaPath}}"
preInstructionRef: pre-instructions/selection-skills-L1.md
evaluatorTask: "Bewerte ob die L1-Description in der Sprache der Persona formuliert ist."
outputSchemaRef: output-schemas/selection-skills-L1.schema.json
personaRequired: true
version: 1.0.0
---

## Begruendung

Die L1-Description ist der erste Persona-Kontakt — Sprache entscheidet ueber
Verstaendnis.

## Persona-Anwendung

Trader spricht anders als Engineer; Description sollte zur Persona-Lens passen.
