---
id: Q-tools-aggregate-namespace-01
area: tools-aggregate-namespace
dimension: domainCoverage
question: "Erreicht die Anzahl Tools im Namespace den Hard-Threshold aus Spec 10 §2?"
scoreType: boolean
weight: 0.2
determinism: deterministic
tier: P4
filesToRead:
  - "{{namespacePath}}"
preInstructionRef: pre-instructions/tools-aggregate-namespace.md
evaluatorTask: "Zaehle Tools im Namespace und vergleiche mit Hard-Threshold (siehe Spec 10 §2)."
outputSchemaRef: output-schemas/tools-aggregate-namespace.schema.json
personaRequired: false
version: 1.0.0
---

## Begruendung

Spec 10 §2 nennt einen Hard-Threshold fuer Namespace-Coverage. Unterhalb dessen
ist die Aggregations-Annahme verletzt — der Namespace ist incomplete.

## Doppelung-Check (Memo 082 Kap 6)

`flowmcp-core` zaehlt Tools nicht gegen Threshold — Frage bleibt.
