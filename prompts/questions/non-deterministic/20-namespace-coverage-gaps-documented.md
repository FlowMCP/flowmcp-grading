---
id: Q-tools-aggregate-namespace-05
area: tools-aggregate-namespace
dimension: domainCoverage
question: "Sind Coverage-Gaps explizit dokumentiert (oder bewusst absent)?"
scoreType: boolean
weight: 0.2
determinism: non-deterministic
tier: P4
filesToRead:
  - "{{namespacePath}}"
  - "{{domainKnowledgePath}}"
preInstructionRef: pre-instructions/tools-aggregate-namespace.md
evaluatorTask: "Pruefe ob fehlende Funktionen dokumentiert sind oder bewusst draussen bleiben."
outputSchemaRef: output-schemas/tools-aggregate-namespace.schema.json
personaRequired: false
version: 1.0.0
---

## Begruendung

Ein dokumentierter Gap ist klar; ein impliziter Gap ist Verwirrung.
