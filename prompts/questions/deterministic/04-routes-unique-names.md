---
id: Q-tools-aggregate-schema-01
area: tools-aggregate-schema
dimension: routesUniqueNames
question: "Sind alle Route-Namen innerhalb des Schemas eindeutig?"
scoreType: boolean
weight: 0.25
determinism: deterministic
tier: P4
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/tools-aggregate-schema.md
evaluatorTask: "Sammle alle route.name-Werte und pruefe auf Duplikate."
outputSchemaRef: output-schemas/tools-aggregate-schema.schema.json
personaRequired: false
version: 1.0.0
---

## Begruendung

Duplikate fuehren zu Tool-Aufruf-Konflikten im MCP-Client. Pruefung deterministisch
ueber Set-Vergleich.

## Doppelung-Check (Memo 082 Kap 6)

`flowmcp-core` validiert Route-Schema, aber Duplikat-Check auf Aggregat-Ebene fehlt — Frage bleibt.
