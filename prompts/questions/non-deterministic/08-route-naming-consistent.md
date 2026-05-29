---
id: Q-tools-aggregate-schema-02
area: tools-aggregate-schema
dimension: namingConsistency
question: "Ist das Route-Naming konsistent ueber alle Routes im Schema?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P4
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/tools-aggregate-schema.md
evaluatorTask: "Pruefe ob alle Route-Namen demselben Naming-Pattern folgen (Praefix, Casing, Wortwahl)."
outputSchemaRef: output-schemas/tools-aggregate-schema.schema.json
personaRequired: false
version: 1.0.0
---

## Begruendung

Inkonsistentes Naming (`getUser`, `list_accounts`, `searchTx`) zwingt den User zum
Memorieren. Einheitliches Pattern macht das Schema vorhersagbar.
