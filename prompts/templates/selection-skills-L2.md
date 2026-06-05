---
area: selection-skills-L2
specRef: flowmcp-spec/grading/3.0.0/13-skills.md#4
personaRequired: true
outputSchemaRef: prompts/output-schemas/selection-skills-L2.schema.json
version: 3.0.0
skillLevel: L2
---

## Pre-Instructions

{{PRE_INSTRUCTIONS_BLOCK}}

## Persona

Persona: {{BASE_PERSONA_NAME}} ({{BASE_PERSONA_FILE}})
Lens: {{LENS_NAME}} ({{LENS_FILE}})

Spec 13 §4.2 requires a persona focus on ALL three skill levels (mandatory).
You evaluate the L2 skill from this persona + lens perspective.

## Files to Read

1. {{SPEC_13_PATH}}                    — Skills spec, §4
2. {{BASE_PERSONA_FILE}}               — Base persona
3. {{LENS_FILE}}                       — Domain lens
4. {{SELECTION_SKILL_L2_FILE}}         — The L2 skill to be evaluated (composition)
5. {{L1_GRADING_RESULT_FILE}}          — Result JSON from the L1 grading of the same selection

If `{{L1_GRADING_RESULT_FILE}}` is missing, answer exclusively with
`{ "blocker": "<path>", "reason": "L1 grading prerequisite missing" }`
and stop.

## Question(s)

Evaluate the L2 composition skill `{{SKILL_NAME}}` of the selection `{{SELECTION_NAME}}`.
L2 = several L1 skills composed together. Check whether the composition builds
on the sub-skills evaluated in the L1 grading, whether the persona can follow
the composition, and whether the composition happens without hidden defaults.

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
