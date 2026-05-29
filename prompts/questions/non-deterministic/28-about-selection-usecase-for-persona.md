---
id: Q-about-selection-03
area: about-selection
dimension: personaReference
question: "Ist der Use-Case fuer die Persona konkret beschrieben?"
scoreType: scale-1-5
weight: 0.33
determinism: non-deterministic
tier: P6
filesToRead:
  - "{{aboutPath}}"
  - "{{personaPath}}"
  - "{{lensPath}}"
preInstructionRef: pre-instructions/about-selection.md
evaluatorTask: "Pruefe ob ein konkreter Persona-Use-Case beschrieben ist (nicht generisch)."
outputSchemaRef: output-schemas/about-selection.schema.json
personaRequired: true
version: 1.0.0
---

## Begruendung

"Tools fuer alle" ist kein Use-Case. "Crypto-Trader: Daily Portfolio-Check"
ist einer.

## Persona-Anwendung

Use-Case muss zur Lens passen (z.B. crypto-trader Lens fuer Crypto-Selection).
