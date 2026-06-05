---
area: namespace-description
specRef: flowmcp-spec/grading/3.0.0/04-phases-single.md
personaRequired: false
outputSchemaRef: prompts/output-schemas/namespace-description.schema.json
version: 3.0.0
---

## Pre-Instructions

{{PRE_INSTRUCTIONS_BLOCK}}

## Question(s)

Evaluate the clarity of the namespace identity `{{NAMESPACE}}`. Check whether
the description makes the identity objectively unambiguous — neutral, with no
persona reference. Answer only on the basis of the files you have read — no
web research, no assumptions.

{{QUESTIONS_BLOCK}}

{{OUTPUT_SCHEMA_BLOCK}}
On a file-read error, answer exclusively with:
`{ "blocker": "<file-path>", "reason": "<reason>" }`
and stop.
