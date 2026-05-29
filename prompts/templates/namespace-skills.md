---
area: namespace-skills
specRef: spec/1.1.0/13-skills.md#3
personaRequired: true
outputSchemaRef: prompts/output-schemas/namespace-skills.schema.json
version: 1.0.0
---

<!-- Spec 13 §3.1 deklariert Persona-Bezug als OPTIONAL fuer Namespace-Skills.
     Memo 082 Kap 7.4 setzt den Default auf MIT Persona. -->

## Pre-Instructions

{{PRE_INSTRUCTIONS_BLOCK}}

## Persona

Persona: {{BASE_PERSONA_NAME}} ({{BASE_PERSONA_FILE}})
Lens: {{LENS_NAME}} ({{LENS_FILE}})

Sieh den Namespace-Skill durch die Brille dieser Persona + Lens.
Spec 13 §3.1 deklariert Persona-Bezug als OPTIONAL fuer Namespace-Skills;
Memo 082 Kap 7.4 setzt den Default auf MIT Persona.

## Files to Read

{{FILES_TO_READ_BLOCK}}

## Question(s)

Bewerte den Namespace-Skill `{{NAMESPACE}}.{{SKILL_NAME}}` mit Persona-Fokus
nach Spec 13 §3. Pruefe ob der Skill aus Persona-Sicht klar, eindeutig und
ohne versteckte Defaults funktioniert. Antworte nur auf Basis der
gelesenen Files — keine Web-Recherche, keine Annahmen.

{{QUESTIONS_BLOCK}}

## Output Schema

Die Antwort MUSS exakt dem JSON-Schema unter `{{OUTPUT_SCHEMA_REF}}` entsprechen.
Bei Datei-Lese-Fehler antworte ausschliesslich mit:
`{ "blocker": "<dateipfad>", "reason": "<grund>" }`
und brich ab.
