---
area: about-selection
specRef: spec/1.1.0/11-about-convention.md#4
personaRequired: true
outputSchemaRef: prompts/output-schemas/about-selection.schema.json
version: 1.0.0
---

## Pre-Instructions

{{PRE_INSTRUCTIONS_BLOCK}}

## Persona

Persona: {{BASE_PERSONA_NAME}} ({{BASE_PERSONA_FILE}})
Lens: {{LENS_NAME}} ({{LENS_FILE}})

Sieh die About-Page der Selection durch die Brille dieser Persona + Lens.
Spec 11 §4 verlangt Persona-Reference im About-Content.

## Files to Read

{{FILES_TO_READ_BLOCK}}

## Question(s)

Bewerte die About-Page der Selection `{{SELECTION_NAME}}` aus
Persona-Perspektive nach Spec 11 §4. Pruefe die Personas-Reference im
About-Content und ihre Konsistenz mit der Selection-Definition. Antworte
nur auf Basis der gelesenen Files — keine Web-Recherche, keine Annahmen.

{{QUESTIONS_BLOCK}}

## Output Schema

Die Antwort MUSS exakt dem JSON-Schema unter `{{OUTPUT_SCHEMA_REF}}` entsprechen.
Bei Datei-Lese-Fehler antworte ausschliesslich mit:
`{ "blocker": "<dateipfad>", "reason": "<grund>" }`
und brich ab.
