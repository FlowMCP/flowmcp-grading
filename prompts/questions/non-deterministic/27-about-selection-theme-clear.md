---
id: Q-about-selection-02
area: about-selection
dimension: personaReference
question: "Ist das Selection-Theme klar erkennbar?"
scoreType: scale-1-5
weight: 0.33
determinism: non-deterministic
tier: P6
filesToRead:
  - "{{aboutPath}}"
  - "{{personaPath}}"
preInstructionRef: pre-instructions/about-selection.md
evaluatorTask: "Bewerte ob das Selection-Theme aus dem About-Text klar wird."
outputSchemaRef: output-schemas/about-selection.schema.json
personaRequired: true
version: 1.0.0
---

## Begruendung

Eine Selection ohne klares Theme ist eine zufaellige Tool-Sammlung.

## Persona-Anwendung

Das Theme muss zur Persona passen — Mismatch ist Hard-Fail.
