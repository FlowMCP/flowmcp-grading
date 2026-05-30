---
id: Q-selection-skills-L2-04
area: selection-skills-L2
dimension: skillAdequacy
question: "Is the L2 output sensibly summarized (not raw)?"
scoreType: scale-1-5
weight: 0.33
determinism: non-deterministic
tier: S3
filesToRead:
  - "{{skillPath}}"
preInstructionRef: pre-instructions/selection-skills-L2.md
evaluatorTask: "Assess whether the L2 output is condensed and does not merely pass through the L1 outputs."
outputSchemaRef: output-schemas/selection-skills-L2.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

L2 should provide persona-relevant condensation; raw pass-through is L1 level.

## Persona Application

The persona lens (e.g. a trader sees trends, an engineer sees raw data) determines the condensation expectation.
