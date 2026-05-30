---
id: Q-tools-aggregate-namespace-05
area: tools-aggregate-namespace
dimension: domainCoverage
question: "Are coverage gaps explicitly documented (or deliberately absent)?"
scoreType: boolean
weight: 0.2
determinism: non-deterministic
tier: P4
filesToRead:
  - "{{namespacePath}}"
  - "{{domainKnowledgePath}}"
preInstructionRef: pre-instructions/tools-aggregate-namespace.md
evaluatorTask: "Check whether missing functions are documented or deliberately left out."
outputSchemaRef: output-schemas/tools-aggregate-namespace.schema.json
personaRequired: false
version: 1.0.0
---

## Rationale

A documented gap is clear; an implicit gap is confusing.
