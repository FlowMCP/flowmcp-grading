---
id: Q-single-test-03
area: single-test
dimension: apiKeyDomainMatch
question: "Matched die API-Key-Domain mit der Provider-Domain im Schema?"
scoreType: boolean
weight: 0.33
determinism: deterministic
tier: P1
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/single-test.md
evaluatorTask: "Vergleiche requiredServerParams Key-Namen mit der Base-URL Domain im Schema."
outputSchemaRef: output-schemas/single-test.schema.json
personaRequired: false
version: 1.0.0
---

## Begruendung

Wenn ein Schema z.B. `ETHERSCAN_API_KEY` referenziert, aber die Base-URL auf
`api.coingecko.com` zeigt, ist die Identitaet verletzt — User-Key wuerde an den
falschen Provider gesendet.

## Doppelung-Check (Memo 082 Kap 6)

Nicht in `flowmcp-core` — Frage bleibt.
