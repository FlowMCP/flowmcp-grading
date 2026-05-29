---
id: Q-tools-aggregate-namespace-04
area: tools-aggregate-namespace
dimension: domainCoverage
question: "Enthalten die Tools sowohl Read-Cases als auch Aggregate-Cases?"
scoreType: scale-1-5
weight: 0.2
determinism: non-deterministic
tier: P4
filesToRead:
  - "{{namespacePath}}"
preInstructionRef: pre-instructions/tools-aggregate-namespace.md
evaluatorTask: "Pruefe ob ein gesunder Mix aus Single-Item-Reads und Aggregations vorliegt."
outputSchemaRef: output-schemas/tools-aggregate-namespace.schema.json
personaRequired: false
version: 1.0.0
---

## Begruendung

Ein Namespace nur mit `get-X-by-id` ist limitiert. Aggregations (`list`, `top-N`)
sind oft die User-relevanteren Endpoints.
