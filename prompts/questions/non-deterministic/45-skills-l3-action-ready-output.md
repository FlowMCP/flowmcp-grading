---
id: Q-selection-skills-L3-04
area: selection-skills-L3
dimension: domainAlignment
question: "Ist der L3-Output Persona-Action-Ready?"
scoreType: scale-1-5
weight: 0.34
determinism: non-deterministic
tier: S4
filesToRead:
  - "{{skillPath}}"
  - "{{personaPath}}"
  - "{{lensPath}}"
preInstructionRef: pre-instructions/selection-skills-L3.md
evaluatorTask: "Bewerte ob die Persona aus dem L3-Output direkt handeln kann."
outputSchemaRef: output-schemas/selection-skills-L3.schema.json
personaRequired: true
version: 1.0.0
---

## Begruendung

Action-Ready heisst: Output enthaelt Empfehlungen + Begruendung, nicht nur
Rohdaten.

## Persona-Anwendung

Action-Definition variiert: Trader handelt am Markt, Decision-Maker entscheidet.
