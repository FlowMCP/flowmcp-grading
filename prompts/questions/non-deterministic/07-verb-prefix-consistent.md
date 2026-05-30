---
id: Q-single-test-10
area: single-test
dimension: verbPrefixConsistent
question: "Is the verb prefix of the tool name consistent (get/list/search)?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P3
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/single-test.md
evaluatorTask: "Check the verb-prefix convention: get/list/search/post/put/delete matching the behavior."
outputSchemaRef: output-schemas/single-test.schema.json
personaRequired: false
version: 1.0.0
---

## Rationale

Verb prefixes make the behavior inferable without the description. Tools like `userAccount`
without a verb are ambiguous.
