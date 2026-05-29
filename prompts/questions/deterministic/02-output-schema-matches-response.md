---
id: Q-single-test-02
area: single-test
dimension: outputSchemaMatch
question: "Matched das Output-Schema die echte Test-Response des Tools?"
scoreType: boolean
weight: 0.33
determinism: deterministic
tier: P1
filesToRead:
  - "{{schemaPath}}"
  - "{{responseFixturePath}}"
preInstructionRef: pre-instructions/single-test.md
evaluatorTask: "Validiere das schema.routes[0].response gegen eine echte Live-Antwort des Endpoints."
outputSchemaRef: output-schemas/single-test.schema.json
personaRequired: false
version: 1.0.0
---

## Begruendung

Wenn das Output-Schema nicht mit der echten Response uebereinstimmt, fuehrt das zu Parser-Fehlern.
Die Pruefung ist deterministisch ueber JSON-Schema-Validation.

## Doppelung-Check (Memo 082 Kap 6)

`flowmcp-core` validiert Schema-Struktur, aber nicht den Match gegen Live-Antworten — Frage bleibt.
