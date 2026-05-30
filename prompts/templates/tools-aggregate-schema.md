---
area: tools-aggregate-schema
specRef: flowmcp-spec/grading/1.1.0/06-determinism-and-tier.md#4
personaRequired: false
outputSchemaRef: prompts/output-schemas/tools-aggregate-schema.schema.json
version: 1.0.0
---

## Pre-Instructions

{{PRE_INSTRUCTIONS_BLOCK}}

## Persona

{{PERSONA_BLOCK}}

## Files to Read

{{FILES_TO_READ_BLOCK}}

## Question(s)

Bewerte die Kohaerenz **aller Routes** im Schema `{{NAMESPACE}}.{{SCHEMA_NAME}}`.
Aggregiere ueber die Routes — die Bewertung ist strukturell, neutral, nicht
persona-getrieben. Antworte nur auf Basis der gelesenen Files — keine
Web-Recherche, keine Annahmen.

{{QUESTIONS_BLOCK}}

## Output Schema

Die Antwort MUSS exakt dem JSON-Schema unter `{{OUTPUT_SCHEMA_REF}}` entsprechen.
Bei Datei-Lese-Fehler antworte ausschliesslich mit:
`{ "blocker": "<dateipfad>", "reason": "<grund>" }`
und brich ab.
