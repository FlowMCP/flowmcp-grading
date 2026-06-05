---
area: single-test
specRef: flowmcp-spec/grading/3.0.0/06-determinism-and-tier.md#4
personaRequired: false
outputSchemaRef: prompts/output-schemas/single-test.schema.json
version: 3.0.0
---

## Pre-Instructions

{{PRE_INSTRUCTIONS_BLOCK}}

## Persona

{{PERSONA_BLOCK}}

## Files to Read

{{FILES_TO_READ_BLOCK}}

## Question(s)

Evaluate the description of the tool `{{NAMESPACE}}.{{TOOL_NAME}}` neutrally
per Spec 06 §4. Answer only on the basis of the files you have read — no
web research, no assumptions.

{{QUESTIONS_BLOCK}}

## Output Schema

The answer MUST conform exactly to the JSON schema at `{{OUTPUT_SCHEMA_REF}}`.
On a file-read error, answer exclusively with:
`{ "blocker": "<file-path>", "reason": "<reason>" }`
and stop.
