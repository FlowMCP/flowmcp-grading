---
id: Q-single-test-08
area: single-test
dimension: toolNameSemantic
question: "Ist der Tool-Name semantisch klar (kein Kuerzel ohne Erklaerung)?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P3
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/single-test.md
evaluatorTask: "Bewerte den Tool-Namen: vollstaendig, deskriptiv, ohne Insider-Kuerzel."
outputSchemaRef: output-schemas/single-test.schema.json
personaRequired: false
version: 1.0.0
---

## Begruendung

Ein Tool-Name wie `getCgPrice` zwingt zur Recherche; `getCoinGeckoPriceUsd` ist klar.
