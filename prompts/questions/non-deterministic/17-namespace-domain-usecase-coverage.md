---
id: Q-tools-aggregate-namespace-02
area: tools-aggregate-namespace
dimension: domainCoverage
question: "Do the tools cover the most important domain use cases?"
scoreType: scale-1-5
weight: 0.2
determinism: non-deterministic
tier: P4
filesToRead:
  - "{{namespacePath}}"
  - "{{domainKnowledgePath}}"
preInstructionRef: pre-instructions/tools-aggregate-namespace.md
evaluatorTask: "Compare the tools in the namespace with the use cases in the domain knowledge document."
outputSchemaRef: output-schemas/tools-aggregate-namespace.schema.json
personaRequired: false
version: 1.0.0
---

## Rationale

A crypto namespace without a price tool is incomplete. Assessment is made against
the domain expectation.
