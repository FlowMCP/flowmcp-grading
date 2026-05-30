---
area: selection-skills-L1
specRef: flowmcp-spec/grading/1.1.0/13-skills.md#4
personaRequired: true
outputSchemaRef: prompts/output-schemas/selection-skills-L1.schema.json
version: 1.0.0
skillLevel: L1
---

## Pre-Instructions

{{PRE_INSTRUCTIONS_BLOCK}}

## Persona

Persona: {{BASE_PERSONA_NAME}} ({{BASE_PERSONA_FILE}})
Lens: {{LENS_NAME}} ({{LENS_FILE}})

Spec 13 §4.2 requires a persona focus on ALL three skill levels (mandatory).
You evaluate the L1 skill from this persona + lens perspective.

## Files to Read

1. {{SPEC_13_PATH}}                    — Skills spec, §4 selection-skill pyramid
2. {{BASE_PERSONA_FILE}}               — Base persona (source of truth, flowmcp-spec/personas/)
3. {{LENS_FILE}}                       — Domain lens (helper file from grading-data/personas/)
4. {{SELECTION_SKILL_L1_FILE}}         — The L1 skill to be evaluated

## Question(s)

Evaluate the atomic L1 skill `{{SKILL_NAME}}` of the selection `{{SELECTION_NAME}}`
from the persona + lens perspective per Spec 13 §4. Check whether it calls a
tool atomically, holds no state, and is usable by the persona without hidden
defaults (no-hidden-defaults).

{{QUESTIONS_BLOCK}}

## Output Schema

The answer MUST conform exactly to the JSON schema at `{{OUTPUT_SCHEMA_REF}}`.
On a file-read error, answer exclusively with:
`{ "blocker": "<file-path>", "reason": "<reason>" }`
and stop.

<!--
Caveat: watch out for selection-skill complexity — 9 skills (3 per sub-area x 3 levels)
may be too many. A small practical test should verify whether the consolidation
holds, with lessons recorded in the gitignored working folder.
-->
