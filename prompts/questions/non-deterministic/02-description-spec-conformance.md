---
id: Q-single-test-05
area: single-test
dimension: descriptionSpecConformance
question: "Folgt die Description den Spec-06-§4-Konventionen (3rd-Person, kein Werbespruch)?"
scoreType: scale-1-5
weight: 0.33
determinism: non-deterministic
tier: P2
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/single-test.md
evaluatorTask: "Pruefe Spec-06-§4-Konformitaet der Description: 3rd-Person, deskriptiv, ohne Buzzwords."
outputSchemaRef: output-schemas/single-test.schema.json
personaRequired: false
version: 1.0.0
---

## Begruendung

Spec 06 §4 definiert das Description-Format. Abweichung fuehrt zu inkonsistenten
Tool-Beschreibungen ueber das gesamte Schemas-Repo.
