---
id: Q-tools-aggregate-namespace-01
area: tools-aggregate-namespace
dimension: domainCoverage
question: "Does the number of tools in the namespace reach the hard threshold defined by the specification?"
scoreType: boolean
weight: 0.2
determinism: deterministic
tier: P4
filesToRead:
  - "{{namespacePath}}"
preInstructionRef: pre-instructions/tools-aggregate-namespace.md
evaluatorTask: "Count the tools in the namespace and compare against the hard threshold defined by the specification."
outputSchemaRef: output-schemas/tools-aggregate-namespace.schema.json
personaRequired: false
version: 1.0.0
---

## Rationale

The specification defines a hard threshold for namespace coverage. Below it, the
aggregation assumption is broken — the namespace is incomplete.

## Duplication Check

`flowmcp-core` does not count tools against a threshold, so this question remains.
