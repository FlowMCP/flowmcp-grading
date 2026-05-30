---
id: Q-about-selection-03
area: about-selection
dimension: personaReference
question: "Is the use case for the persona described concretely?"
scoreType: scale-1-5
weight: 0.33
determinism: non-deterministic
tier: P6
filesToRead:
  - "{{aboutPath}}"
  - "{{personaPath}}"
  - "{{lensPath}}"
preInstructionRef: pre-instructions/about-selection.md
evaluatorTask: "Check whether a concrete persona use case is described (not generic)."
outputSchemaRef: output-schemas/about-selection.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

"Tools for everyone" is not a use case. "Crypto trader: daily portfolio check" is one.

## Persona Application

The use case must fit the lens (e.g. crypto-trader lens for a crypto selection).
