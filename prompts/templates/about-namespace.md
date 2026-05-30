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

View the About page through the lens of this persona + lens.
Spec 11 §4 requires a persona reference in the About content.

## Files to Read

{{FILES_TO_READ_BLOCK}}

## Question(s)

Evaluate the About page of the namespace `{{NAMESPACE}}` from the persona's
perspective per Spec 11 §4. The persona reference in the About content is
mandatory — check for its presence and quality. Answer only on the basis of
the files you have read — no web research, no assumptions.

{{QUESTIONS_BLOCK}}

## Output Schema

The answer MUST conform exactly to the JSON schema at `{{OUTPUT_SCHEMA_REF}}`.
On a file-read error, answer exclusively with:
`{ "blocker": "<file-path>", "reason": "<reason>" }`
and stop.
