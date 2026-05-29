---
id: Q-single-test-04
area: single-test
dimension: descriptionClarity
question: "Ist die Tool-Description ohne Marketing-Begriffe?"
scoreType: scale-1-5
weight: 0.34
determinism: non-deterministic
tier: P2
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/single-test.md
evaluatorTask: "Bewerte die Description-Klarheit. Anti-Pattern: Buzzwords, Adjektive ohne Substanz, Superlative."
outputSchemaRef: output-schemas/single-test.schema.json
personaRequired: false
version: 1.0.0
---

## Begruendung

Marketing-Sprache verzerrt die User-Erwartung an das Tool. Eine Description sollte
deskriptiv sein ("Returns contract metadata"), nicht werblich ("Powerful contract API").

## Anti-Pattern

- "Powerful", "Advanced", "Easy-to-use"
- Superlative ohne Beleg
- Adjektive ohne technische Information
