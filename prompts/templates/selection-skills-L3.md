---
area: selection-skills-L3
specRef: flowmcp-spec/grading/3.0.0/13-skills.md#4
personaRequired: true
outputSchemaRef: prompts/output-schemas/selection-skills-L3.schema.json
version: 3.0.0
skillLevel: L3
---

## Pre-Instructions

{{PRE_INSTRUCTIONS_BLOCK}}

## Persona

Persona: {{BASE_PERSONA_NAME}} ({{BASE_PERSONA_FILE}})
Lens: {{LENS_NAME}} ({{LENS_FILE}})

Spec 13 §4.2 requires a persona focus on ALL three skill levels (mandatory).
You evaluate the L3 skill from this persona + lens perspective.

## Files to Read

1. {{SPEC_13_PATH}}                    — Skills spec, §4
2. {{BASE_PERSONA_FILE}}               — Base persona
3. {{LENS_FILE}}                       — Domain lens
4. {{SELECTION_SKILL_L3_FILE}}         — The L3 skill to be evaluated (workflow)
5. {{L2_GRADING_RESULT_FILE}}          — Result JSON from the L2 grading of the same selection

Note: L3 references L2, not L1 directly. Spec 13 §4 is hierarchical.

If `{{L2_GRADING_RESULT_FILE}}` is missing, answer exclusively with
`{ "blocker": "<path>", "reason": "L2 grading prerequisite missing" }`
and stop.

## Question(s)

Evaluate the L3 workflow skill `{{SKILL_NAME}}` of the selection `{{SELECTION_NAME}}`.
L3 = several L2 skills with state. Check whether the workflow builds on
evaluated L2 composition skills, whether state transitions are explicitly
documented, and whether the persona can follow the end-to-end journey.

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
