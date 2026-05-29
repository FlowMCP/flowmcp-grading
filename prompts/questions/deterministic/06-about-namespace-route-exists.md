---
id: Q-about-namespace-01
area: about-namespace
dimension: aboutRouteExists
question: "Existiert eine About-Route im Namespace und ist sie technisch erreichbar?"
scoreType: boolean
weight: 0.34
determinism: deterministic
tier: P6
filesToRead:
  - "{{aboutPath}}"
preInstructionRef: pre-instructions/about-namespace.md
evaluatorTask: "Pruefe das Vorhandensein einer About-Route und ob sie HTTP 200 zurueckgibt."
outputSchemaRef: output-schemas/about-namespace.schema.json
personaRequired: true
version: 1.0.0
---

## Begruendung

Eine fehlende About-Route bedeutet: Kein Persona-Reference-Content vorhanden.
Spec 11 §4 verlangt About-Inhalt pro Namespace.

## Persona-Anwendung

Persona wird auf den About-Content angewendet (Inhalts-Bewertung erfolgt in non-det-Fragen).
Diese deterministische Frage prueft nur die Existenz — bleibt aber im Persona-Bereich,
weil der gesamte Bereich Persona-getrieben ist (Kap 7.4).
