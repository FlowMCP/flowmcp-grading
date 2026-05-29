---
id: Q-about-namespace-04
area: about-namespace
dimension: useCaseClarity
question: "Sind die Use-Case-Beispiele Persona-relevant?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P7
filesToRead:
  - "{{aboutPath}}"
  - "{{personaPath}}"
  - "{{lensPath}}"
preInstructionRef: pre-instructions/about-namespace.md
evaluatorTask: "Pruefe ob Use-Case-Beispiele auf der About-Page zur Persona passen."
outputSchemaRef: output-schemas/about-namespace.schema.json
personaRequired: true
version: 1.0.0
---

## Begruendung

Generische Beispiele ("Get all data") sind wertlos; Persona-spezifische
("Crypto-Trader: Get top-10 by volume") sind nutzbar.

## Persona-Anwendung

Lens-spezifische Beispiele (Crypto-Trader-Lens) werden gegen die Use-Cases gehalten.
