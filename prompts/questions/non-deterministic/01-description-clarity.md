---
id: Q-single-test-04
area: single-test
dimension: descriptionClarity
question: "Is the tool description free of marketing terms?"
scoreType: scale-1-5
weight: 0.34
determinism: non-deterministic
tier: P2
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/single-test.md
evaluatorTask: "Assess the clarity of the description. Anti-patterns: buzzwords, adjectives without substance, superlatives."
outputSchemaRef: output-schemas/single-test.schema.json
personaRequired: false
version: 1.0.0
---

## Rationale

Marketing language distorts the user's expectation of the tool. A description should
be descriptive ("Returns contract metadata"), not promotional ("Powerful contract API").

## Anti-Pattern

- "Powerful", "Advanced", "Easy-to-use"
- Superlatives without evidence
- Adjectives without technical information
