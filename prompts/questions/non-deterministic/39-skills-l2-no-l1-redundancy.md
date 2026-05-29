---
id: Q-selection-skills-L2-03
area: selection-skills-L2
dimension: skillAdequacy
question: "Vermeidet L2 Redundanz zu L1-Skills?"
scoreType: scale-1-5
weight: 0.34
determinism: non-deterministic
tier: S3
filesToRead:
  - "{{skillPath}}"
  - "{{l1SkillsPath}}"
preInstructionRef: pre-instructions/selection-skills-L2.md
evaluatorTask: "Pruefe ob L2 nicht 1:1 einen L1-Skill wiederholt."
outputSchemaRef: output-schemas/selection-skills-L2.schema.json
personaRequired: true
version: 1.0.0
---

## Begruendung

Redundante L2-Skills verwirren den User; jedes Level muss eigenstaendige
Komposition liefern.

## Persona-Anwendung

Persona-Workflow-Beurteilung als Grundlage.
