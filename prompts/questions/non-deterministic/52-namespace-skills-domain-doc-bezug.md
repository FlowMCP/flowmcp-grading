---
id: Q-namespace-skills-05
area: namespace-skills
dimension: domainAlignment
question: "Ist der Bezug zur Domain-Knowledge-Doc klar?"
scoreType: scale-1-5
weight: 0.33
determinism: non-deterministic
tier: S4
filesToRead:
  - "{{skillPath}}"
  - "{{domainKnowledgePath}}"
preInstructionRef: pre-instructions/namespace-skills.md
evaluatorTask: "Pruefe ob der Skill auf die Domain-Knowledge-Doc referenziert."
outputSchemaRef: output-schemas/namespace-skills.schema.json
personaRequired: true
version: 1.0.0
---

## Begruendung

Domain-Knowledge-Doc ist Source-of-Truth (Spec 10 §3) — Skill ohne Bezug ist
losgeloest.

## Persona-Anwendung

Persona-Workflow als Begruendung fuer Domain-Referenz.
