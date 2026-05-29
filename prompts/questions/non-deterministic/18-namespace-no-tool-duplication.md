---
id: Q-tools-aggregate-namespace-03
area: tools-aggregate-namespace
dimension: domainCoverage
question: "Sind die Tools im Namespace funktional nicht-doppelt?"
scoreType: scale-1-5
weight: 0.2
determinism: non-deterministic
tier: P4
filesToRead:
  - "{{namespacePath}}"
preInstructionRef: pre-instructions/tools-aggregate-namespace.md
evaluatorTask: "Pruefe ob Tools redundante Funktionen abbilden (z.B. zwei Tools fuer Price)."
outputSchemaRef: output-schemas/tools-aggregate-namespace.schema.json
personaRequired: false
version: 1.0.0
---

## Begruendung

Funktions-Doppelung verwirrt bei der Tool-Auswahl. Sinnvolle Differenzierung
(z.B. by-Address vs. by-Symbol) ist Ausnahme.
