---
area: namespace-skills
specRef: flowmcp-spec/grading/3.0.0/13-skills.md#3
personaRequired: true
outputSchemaRef: prompts/output-schemas/namespace-skills.schema.json
version: 3.0.0
---

<!-- Spec 13 §3.1 declares the persona reference as OPTIONAL for namespace skills.
     The grading spec sets the default to WITH persona. -->

## Pre-Instructions

{{PRE_INSTRUCTIONS_BLOCK}}

## Persona

Persona: {{BASE_PERSONA_NAME}} ({{BASE_PERSONA_FILE}})
Lens: {{LENS_NAME}} ({{LENS_FILE}})

View the namespace skill through the lens of this persona + lens.
Spec 13 §3.1 declares the persona reference as OPTIONAL for namespace skills;
the grading spec sets the default to WITH persona.

## Files to Read

{{FILES_TO_READ_BLOCK}}

## Question(s)

Evaluate the namespace skill `{{NAMESPACE}}.{{SKILL_NAME}}` with a persona
focus per Spec 13 §3. Check whether the skill works clearly, unambiguously,
and without hidden defaults from the persona's point of view. Answer only on
the basis of the files you have read — no web research, no assumptions.

{{QUESTIONS_BLOCK}}

## Output Schema

The answer MUST conform exactly to the JSON schema at `{{OUTPUT_SCHEMA_REF}}`.
On a file-read error, answer exclusively with:
`{ "blocker": "<file-path>", "reason": "<reason>" }`
and stop.
