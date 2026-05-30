---
id: Q-single-test-08
area: single-test
dimension: toolNameSemantic
question: "Is the tool name semantically clear (no abbreviation without explanation)?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P3
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/single-test.md
evaluatorTask: "Assess the tool name: complete, descriptive, free of insider abbreviations."
outputSchemaRef: output-schemas/single-test.schema.json
personaRequired: false
version: 1.0.0
---

## Rationale

A tool name like `getCgPrice` forces research; `getCoinGeckoPriceUsd` is clear.
