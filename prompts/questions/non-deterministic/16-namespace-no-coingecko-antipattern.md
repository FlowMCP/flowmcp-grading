---
id: Q-namespace-description-04
area: namespace-description
dimension: namespaceDescriptionClarity
question: "Does the identity statement avoid the abbreviation anti-pattern (abbreviation instead of plain text)?"
scoreType: boolean
weight: 0.25
determinism: non-deterministic
tier: P4
filesToRead:
  - "{{namespacePath}}"
preInstructionRef: pre-instructions/namespace-description.md
evaluatorTask: "Check that no abbreviations like sol/eth/btc appear as the identity instead of solana/ethereum/bitcoin."
outputSchemaRef: output-schemas/namespace-description.schema.json
personaRequired: false
version: 1.0.0
---

## Rationale

The convention requires full names instead of ticker abbreviations.
