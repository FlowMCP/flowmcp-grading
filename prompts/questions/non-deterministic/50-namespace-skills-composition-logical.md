---
id: Q-namespace-skills-03
area: namespace-skills
dimension: skillAdequacy
question: "Ist die Composition aus Namespace-Tools logisch?"
scoreType: scale-1-5
weight: 0.33
determinism: non-deterministic
tier: S3
filesToRead:
  - "{{skillPath}}"
  - "{{namespacePath}}"
preInstructionRef: pre-instructions/namespace-skills.md
evaluatorTask: "Bewerte die Tool-Composition des Namespace-Skills auf Logik und Reihenfolge."
outputSchemaRef: output-schemas/namespace-skills.schema.json
personaRequired: true
version: 1.0.0
---

## Begruendung

Logische Reihenfolge (z.B. erst Lookup, dann Aggregation) macht den Skill
nachvollziehbar.

## Persona-Anwendung

Persona-Workflow-Logik als Massstab.
