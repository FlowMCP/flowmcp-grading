---
id: Q-about-selection-01
area: about-selection
dimension: aboutRouteExists
question: "Existiert eine About-Route fuer die Selection?"
scoreType: boolean
weight: 0.34
determinism: deterministic
tier: P6
filesToRead:
  - "{{aboutPath}}"
preInstructionRef: pre-instructions/about-selection.md
evaluatorTask: "Pruefe das Vorhandensein einer About-Page fuer die Selection."
outputSchemaRef: output-schemas/about-selection.schema.json
personaRequired: true
version: 1.0.0
---

## Begruendung

Spec 11 §4 verlangt eine About-Page pro Selection — fehlt sie, kann die Persona
keinen Bezug zur Selection herstellen.

## Persona-Anwendung

Persona-getrieben fuer den gesamten Bereich. Die Existenz ist deterministisch,
aber der Inhalt wird in den non-det-Fragen Persona-spezifisch bewertet.
