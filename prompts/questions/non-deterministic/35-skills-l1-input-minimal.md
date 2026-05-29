---
id: Q-selection-skills-L1-03
area: selection-skills-L1
dimension: personaFit
question: "Ist das L1-Input-Schema minimal (nur Pflicht-Parameter)?"
scoreType: scale-1-5
weight: 0.5
determinism: non-deterministic
tier: S2
filesToRead:
  - "{{skillPath}}"
preInstructionRef: pre-instructions/selection-skills-L1.md
evaluatorTask: "Pruefe ob das L1-Input-Schema nur die wirklich benoetigten Parameter zeigt."
outputSchemaRef: output-schemas/selection-skills-L1.schema.json
personaRequired: true
version: 1.0.0
---

## Begruendung

Ueberflutete Input-Schemas (alle 30 API-Parameter sichtbar) sind nicht
Persona-anschlussfaehig.

## Persona-Anwendung

Trader-Lens hat hoehere Minimalitaets-Erwartung als Engineer-Lens.
