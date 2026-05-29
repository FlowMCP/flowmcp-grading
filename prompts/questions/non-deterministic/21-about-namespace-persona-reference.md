---
id: Q-about-namespace-02
area: about-namespace
dimension: personaReference
question: "Ist die Persona-Reference im About-Content vorhanden und matched die uebergebene Persona?"
scoreType: scale-1-5
weight: 0.33
determinism: non-deterministic
tier: P6
filesToRead:
  - "{{aboutPath}}"
  - "{{personaPath}}"
  - "{{lensPath}}"
preInstructionRef: pre-instructions/about-namespace.md
evaluatorTask: "Pruefe ob About-Content explizit auf die Persona referenziert (Spec 11 §4). Bewerte Fit gegen Persona + Lens."
outputSchemaRef: output-schemas/about-namespace.schema.json
personaRequired: true
version: 1.0.0
---

## Begruendung

Spec 11 §4 verlangt Persona-Reference im About-Content. Ohne Reference ist About
generisch und nicht decision-maker-tauglich.

## Persona-Anwendung

Wird vom PromptBuilder mit Base-Persona (z.B. `decision-maker`) + Lens
(z.B. `crypto-trader`) befuellt — siehe Memo 082 Kap 7.4.
