---
id: Q-about-namespace-02
area: about-namespace
dimension: personaReference
question: "Is the persona reference present in the About content and does it match the supplied persona?"
scoreType: scale-1-5
weight: 0.33
determinism: non-deterministic
tier: P6
filesToRead:
  - "{{aboutPath}}"
  - "{{personaPath}}"
  - "{{lensPath}}"
preInstructionRef: pre-instructions/about-namespace.md
evaluatorTask: "Check whether the About content explicitly references the persona. Assess the fit against persona and lens."
outputSchemaRef: output-schemas/about-namespace.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

The specification requires a persona reference in the About content. Without a
reference, the About content is generic and not suitable for decision-makers.

## Persona Application

Filled by the PromptBuilder with a base persona (e.g. `decision-maker`) plus a lens
(e.g. `crypto-trader`).
