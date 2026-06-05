---
area: selection-aggregate
specRef: flowmcp-spec/grading/3.0.0/24-selection-aggregate.md
personaRequired: true
outputSchemaRef: prompts/output-schemas/selection-aggregate.schema.json
version: 3.0.0
---

## Pre-Instructions

{{PRE_INSTRUCTIONS_BLOCK}}

## Persona

Persona: {{BASE_PERSONA_NAME}} ({{BASE_PERSONA_FILE}})
Lens: {{LENS_NAME}} ({{LENS_FILE}})

Assess the selection `{{SELECTION_NAME}}` as a whole through the lens of this
persona + lens. This area grades the selection-wide dimensions that have no
per-skill or per-About home (Spec 24 §2).

## Predecessor Grades

{{PREDECESSOR_GRADES_BLOCK}}

The predecessor grades above are the per-skill area grades and the member
grades that feed this aggregate. Use them as evidence — do not re-grade an
individual member here.

## Files to Read

{{FILES_TO_READ_BLOCK}}

## Question(s)

Grade the selection as a whole per Spec 24 §2. The injected manifest reports
`{{MEMBER_COUNT}}` member namespaces. The thresholds are: soft `>= 5` members
(a group; Grade A is not regularly attainable) and hard `>= 7` members (Grade A
regularly attainable). Fewer than 5 members → no selection phases (`n/a`); 5–6
members → no Grade A. Answer one question per carried dimension:

- Thresholds — the deterministic member count against the soft/hard gates.
- Topic coherence — the members form a coherent topic, not an arbitrary bag.
- domainConformance — the members checked against the About / Domain-Knowledge
  (distinct from about-selection, which grades the document's own quality —
  two checks, no circularity).
- personaUseCaseFit — the selection fits the declared persona's use case.
- Group-bound tier — whether a group-bound evaluation opens the path to Grade A
  (provider-level grading alone caps at Grade B).
- Cascade-stop — whether a hard precondition fails (members below threshold) and
  the cascade must stop rather than emit a misleading partial grade.

Answer only on the basis of the files you have read — no web research, no
assumptions.

{{QUESTIONS_BLOCK}}

## Output Schema

The answer MUST conform exactly to the JSON schema at `{{OUTPUT_SCHEMA_REF}}`.
On a file-read error, answer exclusively with:
`{ "blocker": "<file-path>", "reason": "<reason>" }`
and stop.

## Goal-Block

{{GOAL_BLOCK}}
