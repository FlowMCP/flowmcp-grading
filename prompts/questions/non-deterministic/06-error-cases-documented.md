---
id: Q-single-test-09
area: single-test
dimension: errorCasesDocumented
question: "Sind die Error-Cases (4xx/5xx) im Schema dokumentiert?"
scoreType: scale-1-5
weight: 0.25
determinism: non-deterministic
tier: P3
filesToRead:
  - "{{schemaPath}}"
preInstructionRef: pre-instructions/single-test.md
evaluatorTask: "Pruefe ob bekannte API-Fehler (Rate-Limit, Auth-Fail, Not-Found) dokumentiert sind."
outputSchemaRef: output-schemas/single-test.schema.json
personaRequired: false
version: 1.0.0
---

## Begruendung

Undokumentierte Fehler fuehren zu Try-and-Error-Debugging fuer den User.
