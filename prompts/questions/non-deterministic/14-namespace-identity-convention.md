---
id: Q-namespace-description-02
area: namespace-description
dimension: namespaceDescriptionClarity
question: "Does the namespace identity match the provider identity convention?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P4
filesToRead:
  - "{{namespacePath}}"
preInstructionRef: pre-instructions/namespace-description.md
evaluatorTask: "Check whether the namespace identity matches the provider (e.g. solana instead of sol)."
outputSchemaRef: output-schemas/namespace-description.schema.json
personaRequired: false
version: 1.0.0
---

## Rationale

Abbreviated identities (`sol` instead of `solana`) break with domain conventions
and are hard to find.
