---
id: Q-single-test-07
area: single-test
dimension: exampleQuality
question: "Sind die Beispiel-Inputs realistisch und nutzbar?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P3
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/single-test.md
evaluatorTask: "Pruefe ob examples-Felder echte, sinnvolle Werte enthalten (kein 'foo', 'bar', 'test')."
outputSchemaRef: output-schemas/single-test.schema.json
personaRequired: false
version: 1.0.0
---

## Begruendung

Lebende Beispiele (`0x...USDC-contract-address`) sind nutzbar; Platzhalter
(`foo`, `bar`) sind wertlos.
