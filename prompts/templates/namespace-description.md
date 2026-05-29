---
area: namespace-description
specRef: spec/1.1.0/01-namespace-extensions.md
personaRequired: false
outputSchemaRef: prompts/output-schemas/namespace-description.schema.json
version: 1.0.0
---

## Pre-Instructions

{{PRE_INSTRUCTIONS_BLOCK}}

## Persona

{{PERSONA_BLOCK}}

## Files to Read

{{FILES_TO_READ_BLOCK}}

## Question(s)

Bewerte die Klarheit der Namespace-Identitaet `{{NAMESPACE}}`. Pruefe ob die
Beschreibung die Identitaet objektiv eindeutig macht — neutral, kein
Persona-Bezug. Antworte nur auf Basis der gelesenen Files — keine
Web-Recherche, keine Annahmen.

{{QUESTIONS_BLOCK}}

## Output Schema

Die Antwort MUSS exakt dem JSON-Schema unter `{{OUTPUT_SCHEMA_REF}}` entsprechen.
Bei Datei-Lese-Fehler antworte ausschliesslich mit:
`{ "blocker": "<dateipfad>", "reason": "<grund>" }`
und brich ab.
