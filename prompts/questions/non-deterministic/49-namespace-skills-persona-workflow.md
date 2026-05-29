---
id: Q-namespace-skills-02
area: namespace-skills
dimension: skillAdequacy
question: "Bildet der Namespace-Skill einen Persona-Workflow ab?"
scoreType: scale-1-5
weight: 0.33
determinism: non-deterministic
tier: S3
filesToRead:
  - "{{skillPath}}"
  - "{{personaPath}}"
preInstructionRef: pre-instructions/namespace-skills.md
evaluatorTask: "Pruefe ob der Namespace-Skill einen typischen Persona-Workflow innerhalb des Namespace abdeckt."
outputSchemaRef: output-schemas/namespace-skills.schema.json
personaRequired: true
version: 1.0.0
---

## Begruendung

Der Namespace-Skill ist das Persona-Anwendungs-Beispiel des Namespace.

## Persona-Anwendung

Persona-Workflow als Beurteilungs-Grundlage.
