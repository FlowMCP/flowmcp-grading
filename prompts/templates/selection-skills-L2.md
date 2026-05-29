---
area: selection-skills-L2
specRef: spec/1.1.0/13-skills.md#4
personaRequired: true
outputSchemaRef: prompts/output-schemas/selection-skills-L2.schema.json
version: 1.0.0
skillLevel: L2
---

## Pre-Instructions

{{PRE_INSTRUCTIONS_BLOCK}}

## Persona

Persona: {{BASE_PERSONA_NAME}} ({{BASE_PERSONA_FILE}})
Lens: {{LENS_NAME}} ({{LENS_FILE}})

Spec 13 §4.2 verlangt Persona-Focus auf ALLEN drei Skill-Levels (Pflicht).
Du bewertest den L2-Skill aus dieser Persona- + Lens-Perspektive.

## Files to Read

1. {{SPEC_13_PATH}}                    — Skills-Spec, §4
2. {{BASE_PERSONA_FILE}}               — Base-Persona
3. {{LENS_FILE}}                       — Domain-Lens
4. {{SELECTION_SKILL_L2_FILE}}         — Der zu bewertende L2-Skill (Komposition)
5. {{L1_GRADING_RESULT_FILE}}          — Ergebnis-JSON aus dem L1-Grading der gleichen Selection

Falls `{{L1_GRADING_RESULT_FILE}}` fehlt, antworte ausschliesslich mit
`{ "blocker": "<pfad>", "reason": "L1-Grading-Voraussetzung fehlt" }`
und brich ab.

## Question(s)

Bewerte den L2-Komposition-Skill `{{SKILL_NAME}}` der Selection `{{SELECTION_NAME}}`.
L2 = mehrere L1-Skills komponiert. Pruefe ob die Komposition auf den im
L1-Grading bewerteten Sub-Skills aufbaut, ob die Persona die Komposition
durchschaut, und ob Komposition ohne versteckte Defaults erfolgt.

{{QUESTIONS_BLOCK}}

## Output Schema

Die Antwort MUSS exakt dem JSON-Schema unter `{{OUTPUT_SCHEMA_REF}}` entsprechen.
Bei Datei-Lese-Fehler antworte ausschliesslich mit:
`{ "blocker": "<dateipfad>", "reason": "<grund>" }`
und brich ab.

<!--
Caveat (Memo 082 REV-04 + Kap 10.1):
„Bei Selection-Skills aufpassen wegen Komplexitaet" — 9 Skills (3 pro Sub-Bereich x 3 Levels)
sind moeglicherweise zu viele. Der Mini-Praxis-Test in Phase 6 verifiziert,
ob die Konsolidierung haelt. Lessons werden in
`grading-data/mini-praxis-2026-MM.md` ODER
`.memo/082-.../execution/mini-praxis-lessons.md` festgehalten.
-->
