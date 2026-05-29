---
id: Q-namespace-description-02
area: namespace-description
dimension: namespaceDescriptionClarity
question: "Matched die Namespace-Identitaet die Provider-Identity-Konvention?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P4
filesToRead:
  - "{{namespacePath}}"
preInstructionRef: pre-instructions/namespace-description.md
evaluatorTask: "Pruefe ob die Namespace-Identitaet dem Provider entspricht (z.B. solana statt sol)."
outputSchemaRef: output-schemas/namespace-description.schema.json
personaRequired: false
version: 1.0.0
---

## Begruendung

Abgekuerzte Identitaeten (`sol` statt `solana`) brechen mit Domain-Konventionen
und sind schwer auffindbar.
