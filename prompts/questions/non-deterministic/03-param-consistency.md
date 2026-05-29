---
id: Q-single-test-06
area: single-test
dimension: paramConsistency
question: "Sind die Parameter-Namen konsistent (snake_case vs camelCase)?"
scoreType: scale-1-5
weight: 0.33
determinism: non-deterministic
tier: P2
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/single-test.md
evaluatorTask: "Pruefe Naming-Konsistenz aller Parameter innerhalb einer Route."
outputSchemaRef: output-schemas/single-test.schema.json
personaRequired: false
version: 1.0.0
---

## Begruendung

Mischformen (z.B. `user_id` neben `tokenAddress`) verwirren den User und brechen
mit der Tool-Konvention.
