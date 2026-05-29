---
id: Q-namespace-skills-06
area: namespace-skills
dimension: domainAlignment
question: "Bleibt der Namespace-Skill innerhalb des eigenen Namespace?"
scoreType: boolean
weight: 0.33
determinism: non-deterministic
tier: S4
filesToRead:
  - "{{skillPath}}"
  - "{{namespacePath}}"
preInstructionRef: pre-instructions/namespace-skills.md
evaluatorTask: "Pruefe ob der Skill keine Tools aus anderen Namespaces aufruft."
outputSchemaRef: output-schemas/namespace-skills.schema.json
personaRequired: true
version: 1.0.0
---

## Begruendung

Cross-Namespace-Skills gehoeren auf Selection-Level (L3), nicht in Namespace-Skills.
Spec 13 §3.

## Persona-Anwendung

Persona-Workflow-Abgrenzung ist Architektur-Pflicht.
