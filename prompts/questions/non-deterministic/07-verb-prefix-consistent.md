---
id: Q-single-test-10
area: single-test
dimension: verbPrefixConsistent
question: "Ist der Verb-Praefix des Tool-Namens konsistent (get/list/search)?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P3
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/single-test.md
evaluatorTask: "Pruefe Verb-Praefix-Konvention: get/list/search/post/put/delete passend zum Verhalten."
outputSchemaRef: output-schemas/single-test.schema.json
personaRequired: false
version: 1.0.0
---

## Begruendung

Verb-Praefixe machen das Verhalten ohne Description erschliessbar. Tools wie `userAccount`
ohne Verb sind ambivalent.
