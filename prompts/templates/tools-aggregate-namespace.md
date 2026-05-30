---
area: tools-aggregate-namespace
specRef: flowmcp-spec/grading/1.1.0/01-namespace-extensions.md
personaRequired: false
outputSchemaRef: prompts/output-schemas/tools-aggregate-namespace.schema.json
version: 1.0.0
---

## Pre-Instructions

{{PRE_INSTRUCTIONS_BLOCK}}

## Persona

{{PERSONA_BLOCK}}

## Files to Read

{{FILES_TO_READ_BLOCK}}

## Question(s)

Bewerte die Coverage der Tools im Namespace `{{NAMESPACE}}` gegen die in
`{{DOMAIN_KNOWLEDGE_DOC}}` dokumentierten Use-Cases. Die Bewertung ist
neutral und vergleicht Tool-Liste vs. Domain-Erwartung. Antworte nur auf
Basis der gelesenen Files — keine Web-Recherche, keine Annahmen.

{{QUESTIONS_BLOCK}}

## Output Schema

Die Antwort MUSS exakt dem JSON-Schema unter `{{OUTPUT_SCHEMA_REF}}` entsprechen.
Bei Datei-Lese-Fehler antworte ausschliesslich mit:
`{ "blocker": "<dateipfad>", "reason": "<grund>" }`
und brich ab.
