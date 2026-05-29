---
id: Q-selection-skills-L2-04
area: selection-skills-L2
dimension: skillAdequacy
question: "Ist der L2-Output sinnvoll zusammengefasst (nicht roh)?"
scoreType: scale-1-5
weight: 0.33
determinism: non-deterministic
tier: S3
filesToRead:
  - "{{skillPath}}"
preInstructionRef: pre-instructions/selection-skills-L2.md
evaluatorTask: "Bewerte ob der L2-Output verdichtet ist und nicht nur die L1-Outputs durchreicht."
outputSchemaRef: output-schemas/selection-skills-L2.schema.json
personaRequired: true
version: 1.0.0
---

## Begruendung

L2 soll Persona-relevante Verdichtung leisten; Roh-Durchreichung ist L1-Niveau.

## Persona-Anwendung

Persona-Lens (z.B. Trader sieht Trends, Engineer sieht Raw) bestimmt die Verdichtungs-Erwartung.
