---
id: Q-selection-skills-L1-01
area: selection-skills-L1
dimension: coverage
question: "Ist der L1-Skill atomar (genau 1 Tool-Call)?"
scoreType: boolean
weight: 0.5
determinism: non-deterministic
tier: S1
filesToRead:
  - "{{skillPath}}"
preInstructionRef: pre-instructions/selection-skills-L1.md
evaluatorTask: "Pruefe ob der L1-Skill genau 1 Tool aufruft (Atomic-Skill-Definition)."
outputSchemaRef: output-schemas/selection-skills-L1.schema.json
personaRequired: true
version: 1.0.0
---

## Begruendung

Spec 13 §4.2 definiert L1 als atomar. Mehr-Tool-L1-Skills brechen die Komposition.

## Persona-Anwendung

Persona-Pflicht laut Spec 13 §4.2 — gilt auf allen drei Levels.
