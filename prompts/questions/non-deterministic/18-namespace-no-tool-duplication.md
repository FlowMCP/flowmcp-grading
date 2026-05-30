---
id: Q-tools-aggregate-namespace-03
area: tools-aggregate-namespace
dimension: domainCoverage
question: "Are the tools in the namespace functionally non-duplicate?"
scoreType: scale-1-5
weight: 0.2
determinism: non-deterministic
tier: P4
filesToRead:
  - "{{namespacePath}}"
preInstructionRef: pre-instructions/tools-aggregate-namespace.md
evaluatorTask: "Check whether tools represent redundant functions (e.g. two tools for price)."
outputSchemaRef: output-schemas/tools-aggregate-namespace.schema.json
personaRequired: false
version: 1.0.0
---

## Rationale

Functional duplication confuses tool selection. Meaningful differentiation
(e.g. by-address vs. by-symbol) is the exception.
