---
id: Q-selection-skills-L3-01
area: selection-skills-L3
dimension: skillAdequacy
question: "Does the L3 skill represent a daily-use routine for the persona?"
scoreType: scale-1-5
weight: 0.34
determinism: non-deterministic
tier: S3
filesToRead:
  - "{{skillPath}}"
  - "{{personaPath}}"
preInstructionRef: pre-instructions/selection-skills-L3.md
evaluatorTask: "Assess whether the L3 skill corresponds to an actual daily routine."
outputSchemaRef: output-schemas/selection-skills-L3.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

L3 is the highest composition level — it should directly serve the persona's daily workflows.

## Persona Application

The daily routine is persona-specific (trader: portfolio check; decision-maker: health dashboard).
