---
id: Q-selection-skills-L2-01
area: selection-skills-L2
dimension: personaFit
question: "Ist die L2-Composition aus L1-Skills logisch?"
scoreType: scale-1-5
weight: 0.5
determinism: non-deterministic
tier: S2
filesToRead:
  - "{{skillPath}}"
  - "{{l1SkillsPath}}"
preInstructionRef: pre-instructions/selection-skills-L2.md
evaluatorTask: "Pruefe ob die L2-Composition aus L1-Skills sinnvoll fuer die Persona zusammengesetzt ist."
outputSchemaRef: output-schemas/selection-skills-L2.schema.json
personaRequired: true
version: 1.0.0
---

## Begruendung

L2 ist die erste Komposition — illogische Kombination (z.B. Price + ToS-Lookup)
brechen den Persona-Workflow.

## Persona-Anwendung

Persona-Workflow ist Ground-Truth.
