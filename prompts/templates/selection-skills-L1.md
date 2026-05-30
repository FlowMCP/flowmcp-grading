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

Spec 13 §4.2 verlangt Persona-Focus auf ALLEN drei Skill-Levels (Pflicht).
Du bewertest den L1-Skill aus dieser Persona- + Lens-Perspektive.

## Files to Read

1. {{SPEC_13_PATH}}                    — Skills-Spec, §4 Selection-Skill-Pyramide
2. {{BASE_PERSONA_FILE}}               — Base-Persona (Source-of-Truth, flowmcp-spec/personas/)
3. {{LENS_FILE}}                       — Domain-Lens (Helper-File aus grading-data/personas/)
4. {{SELECTION_SKILL_L1_FILE}}         — Der zu bewertende L1-Skill

## Question(s)

Bewerte den atomaren L1-Skill `{{SKILL_NAME}}` der Selection `{{SELECTION_NAME}}` aus
Persona- + Lens-Perspektive nach Spec 13 §4. Pruefe ob er ein Tool atomar
aufruft, ohne State zu halten, und ob er fuer die Persona ohne versteckte
Defaults nutzbar ist (Memory: no-hidden-defaults).

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
