---
id: Q-namespace-description-03
area: namespace-description
dimension: namespaceDescriptionClarity
question: "Ist die Abgrenzung zu anderen Namespaces explizit benannt?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P4
filesToRead:
  - "{{namespacePath}}"
preInstructionRef: pre-instructions/namespace-description.md
evaluatorTask: "Pruefe ob der Namespace seine Grenzen erklaert (Was ist drin, was nicht)."
outputSchemaRef: output-schemas/namespace-description.schema.json
personaRequired: false
version: 1.0.0
---

## Begruendung

Klare Abgrenzungen helfen bei der Tool-Auswahl. Ohne sie wird der User Tools im
falschen Namespace suchen.
