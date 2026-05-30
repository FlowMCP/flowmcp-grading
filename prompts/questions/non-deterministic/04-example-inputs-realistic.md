---
id: Q-single-test-07
area: single-test
dimension: exampleQuality
question: "Are the example inputs realistic and usable?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P3
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/single-test.md
evaluatorTask: "Check whether the examples fields contain real, meaningful values (no 'foo', 'bar', 'test')."
outputSchemaRef: output-schemas/single-test.schema.json
personaRequired: false
version: 1.0.0
---

## Rationale

Real-world examples (`0x...USDC-contract-address`) are usable; placeholders
(`foo`, `bar`) are worthless.
