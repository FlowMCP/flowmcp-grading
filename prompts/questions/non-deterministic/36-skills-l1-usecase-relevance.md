---
id: Q-selection-skills-L1-04
area: selection-skills-L1
dimension: personaFit
question: "Ist der L1-Use-Case fuer die Persona relevant?"
scoreType: scale-1-5
weight: 0.5
determinism: non-deterministic
tier: S2
filesToRead:
  - "{{skillPath}}"
  - "{{personaPath}}"
  - "{{lensPath}}"
preInstructionRef: pre-instructions/selection-skills-L1.md
evaluatorTask: "Pruefe Persona-Relevanz des L1-Use-Cases."
outputSchemaRef: output-schemas/selection-skills-L1.schema.json
personaRequired: true
version: 1.0.0
---

## Begruendung

Ein L1-Skill, den die Persona nie braucht, ist Ballast.

## Persona-Anwendung

Lens-spezifische Use-Case-Liste als Ground-Truth.
