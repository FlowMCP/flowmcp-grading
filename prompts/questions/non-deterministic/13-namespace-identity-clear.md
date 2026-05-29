---
id: Q-namespace-description-01
area: namespace-description
dimension: namespaceDescriptionClarity
question: "Ist die Namespace-Identitaet in 1-2 Saetzen klar formuliert?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P4
filesToRead:
  - "{{namespacePath}}"
preInstructionRef: pre-instructions/namespace-description.md
evaluatorTask: "Bewerte die Klarheit der Namespace-Identitaet im Header-Text."
outputSchemaRef: output-schemas/namespace-description.schema.json
personaRequired: false
version: 1.0.0
---

## Begruendung

Wenn der Namespace-Header nicht erklaert "Was ist das?", muss der User den
gesamten Tools-Katalog lesen.
