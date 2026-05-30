---
id: Q-about-namespace-01
area: about-namespace
dimension: aboutRouteExists
question: "Does an About route exist in the namespace and is it technically reachable?"
scoreType: boolean
weight: 0.34
determinism: deterministic
tier: P6
filesToRead:
  - "{{aboutPath}}"
preInstructionRef: pre-instructions/about-namespace.md
evaluatorTask: "Check for the presence of an About route and whether it returns HTTP 200."
outputSchemaRef: output-schemas/about-namespace.schema.json
personaRequired: true
version: 1.0.0
---

## Rationale

A missing About route means no persona-reference content is present.
The specification requires About content per namespace.

## Persona Application

The persona is applied to the About content (content evaluation happens in the
non-deterministic questions). This deterministic question only checks existence,
but it stays in the persona area because the entire area is persona-driven.
