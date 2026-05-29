---
id: Q-tools-aggregate-namespace-02
area: tools-aggregate-namespace
dimension: domainCoverage
question: "Decken die Tools die wichtigsten Domain-Use-Cases ab?"
scoreType: scale-1-5
weight: 0.2
determinism: non-deterministic
tier: P4
filesToRead:
  - "{{namespacePath}}"
  - "{{domainKnowledgePath}}"
preInstructionRef: pre-instructions/tools-aggregate-namespace.md
evaluatorTask: "Vergleiche Tools im Namespace mit den Use-Cases der Domain-Knowledge-Doc."
outputSchemaRef: output-schemas/tools-aggregate-namespace.schema.json
personaRequired: false
version: 1.0.0
---

## Begruendung

Ein Crypto-Namespace ohne Price-Tool ist incomplete. Bewertung gegen Domain-Erwartung.
