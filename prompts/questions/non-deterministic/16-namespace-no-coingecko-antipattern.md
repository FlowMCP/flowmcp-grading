---
id: Q-namespace-description-04
area: namespace-description
dimension: namespaceDescriptionClarity
question: "Vermeidet die Identitaets-Aussage das CoinGecko-Anti-Pattern (Abkuerzung statt Klartext)?"
scoreType: boolean
weight: 0.25
determinism: non-deterministic
tier: P4
filesToRead:
  - "{{namespacePath}}"
preInstructionRef: pre-instructions/namespace-description.md
evaluatorTask: "Pruefe ob keine Kuerzel wie sol/eth/btc als Identitaet statt solana/ethereum/bitcoin auftreten."
outputSchemaRef: output-schemas/namespace-description.schema.json
personaRequired: false
version: 1.0.0
---

## Begruendung

Die User-Memory-Regel "No CoinGecko" verlangt vollstaendige Namen statt Ticker-Abkuerzungen.
