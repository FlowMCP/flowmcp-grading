---
area: tools-aggregate-schema
specRef: flowmcp-spec/grading/3.0.0/06-determinism-and-tier.md#4
personaRequired: false
outputSchemaRef: prompts/output-schemas/tools-aggregate-schema.schema.json
version: 3.0.0
---

## Pre-Instructions

{{PRE_INSTRUCTIONS_BLOCK}}

## Question(s)

Evaluate the coherence of **all routes** in the schema `{{NAMESPACE}}.{{SCHEMA_NAME}}`.
Aggregate across the routes — the evaluation is structural, neutral, and not
persona-driven. Answer only on the basis of the files you have read — no
web research, no assumptions.

{{QUESTIONS_BLOCK}}

{{OUTPUT_SCHEMA_BLOCK}}
On a file-read error, answer exclusively with:
`{ "blocker": "<file-path>", "reason": "<reason>" }`
and stop.
