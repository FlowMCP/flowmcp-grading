---
area: about-selection
specRef: flowmcp-spec/grading/3.0.0/11-about-convention.md#4
personaRequired: true
outputSchemaRef: prompts/output-schemas/about-selection.schema.json
version: 3.0.0
---

## Pre-Instructions

{{PRE_INSTRUCTIONS_BLOCK}}

## Persona

Persona: {{BASE_PERSONA_NAME}} ({{BASE_PERSONA_FILE}})
Lens: {{LENS_NAME}} ({{LENS_FILE}})

View the selection's About page through the lens of this persona + lens.
Spec 11 §4 requires a persona reference in the About content.

## Question(s)

Evaluate the About page of the selection `{{SELECTION_NAME}}` from the
persona's perspective per Spec 11 §4. Check the persona reference in the
About content and its consistency with the selection definition. Answer
only on the basis of the files you have read — no web research, no assumptions.

{{QUESTIONS_BLOCK}}

{{OUTPUT_SCHEMA_BLOCK}}
On a file-read error, answer exclusively with:
`{ "blocker": "<file-path>", "reason": "<reason>" }`
and stop.
