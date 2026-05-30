---
area: about-namespace
specRef: flowmcp-spec/grading/1.1.0/11-about-convention.md#4
personaRequired: true
outputSchemaRef: prompts/output-schemas/about-namespace.schema.json
version: 1.0.0
---

## Pre-Instructions

{{PRE_INSTRUCTIONS_BLOCK}}

## Persona

Persona: {{BASE_PERSONA_NAME}} ({{BASE_PERSONA_FILE}})
Lens: {{LENS_NAME}} ({{LENS_FILE}})

Sieh die About-Page durch die Brille dieser Persona + Lens.
Spec 11 §4 verlangt Persona-Reference im About-Content.

## Files to Read

{{FILES_TO_READ_BLOCK}}

## Question(s)

Bewerte die About-Page des Namespaces `{{NAMESPACE}}` aus Persona-Perspektive
nach Spec 11 §4. Die Personas-Reference im About-Content ist Pflicht —
pruefe ihre Praesenz und Qualitaet. Antworte nur auf Basis der gelesenen
Files — keine Web-Recherche, keine Annahmen.

{{QUESTIONS_BLOCK}}

## Output Schema

Die Antwort MUSS exakt dem JSON-Schema unter `{{OUTPUT_SCHEMA_REF}}` entsprechen.
Bei Datei-Lese-Fehler antworte ausschliesslich mit:
`{ "blocker": "<dateipfad>", "reason": "<grund>" }`
und brich ab.
