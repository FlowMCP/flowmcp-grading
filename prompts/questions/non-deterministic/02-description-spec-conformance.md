---
id: Q-single-test-05
area: single-test
dimension: descriptionSpecConformance
question: "Does the description follow the specification's conventions (third person, no promotional copy)?"
scoreType: scale-1-5
weight: 0.33
determinism: non-deterministic
tier: P2
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/single-test.md
evaluatorTask: "Check the description for conformance with the specification: third person, descriptive, free of buzzwords."
outputSchemaRef: output-schemas/single-test.schema.json
personaRequired: false
version: 1.0.0
---

## Rationale

The specification defines the description format. Deviation leads to inconsistent
tool descriptions across the entire schemas repository.
