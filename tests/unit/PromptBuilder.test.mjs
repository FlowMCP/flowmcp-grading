import { describe, test, expect } from '@jest/globals'

import { PromptBuilder, VALID_AREAS, PERSONA_REQUIRED_BY_AREA } from '../../src/PromptBuilder.mjs'


const sampleTemplate = '---\narea: {{AREA}}\n---\n\n## Pre-Instructions\n\n{{PRE_INSTRUCTIONS_BLOCK}}\n\n## Persona\n\n{{PERSONA_BLOCK}}\n\n## Files to Read\n\n{{FILES_TO_READ_BLOCK}}\n\n## Question(s)\n\n{{QUESTIONS_BLOCK}}\n\n## Output Schema\n\n{{OUTPUT_SCHEMA_BLOCK}}\n'

const sampleFilesNeutral = [
    { path: '{{SCHEMA_PATH}}', role: 'Schema-Definition des Tools' },
    { path: '{{TEST_RESPONSE_PATH}}', role: 'Letzte erfolgreiche Test-Response' }
]

const sampleFilesWithPersona = [
    { path: '{{NAMESPACE_ABOUT_PATH}}', role: 'About-Page des Namespaces' },
    { path: '{{DOMAIN_KNOWLEDGE_PATH}}', role: 'Domain-Knowledge-Doc' },
    { path: '{{PERSONA_PATH}}', role: 'Persona-File' }
]

const sampleQuestions = [
    { id: 'Q-001', question: 'Is the tool description precise?' },
    { id: 'Q-002', question: 'Is the input-schema description complete?' }
]

const sampleOutputSchema = {
    type: 'object',
    properties: {
        scores: { type: 'array' },
        blocker: { type: [ 'string', 'null' ] }
    },
    required: [ 'scores' ]
}

const samplePolicies = [
    { id: 'POL-001', summary: 'No web research' },
    { id: 'POL-002', summary: 'HTTP 4xx is never PASS' }
]

const samplePersona = {
    id: 'decision-maker--crypto-trader',
    basePersona: 'decision-maker',
    lens: 'crypto-trader',
    focus: 'live trading'
}


describe( 'PromptBuilder.getValidAreas', () => {
    test( 'returns exactly 11 areas matching the persona-table', () => {
        const result = PromptBuilder.getValidAreas()
        expect( Array.isArray( result.areas ) ).toBe( true )
        expect( result.areas.length ).toBe( 11 )
        expect( result.areas ).toEqual( VALID_AREAS )
    } )

    test( 'VALID_AREAS includes the 11th area selection-aggregate', () => {
        expect( VALID_AREAS ).toContain( 'selection-aggregate' )
    } )

    test( 'PERSONA_REQUIRED_BY_AREA has 11 entries — 4 neutral, 7 with persona', () => {
        const entries = Object.entries( PERSONA_REQUIRED_BY_AREA )
        expect( entries.length ).toBe( 11 )

        const neutral = entries
            .filter( ( [ , required ] ) => required === false )
            .map( ( [ key ] ) => key )

        const withPersona = entries
            .filter( ( [ , required ] ) => required === true )
            .map( ( [ key ] ) => key )

        expect( neutral.length ).toBe( 4 )
        expect( withPersona.length ).toBe( 7 )
        expect( neutral ).toEqual( [ 'single-test', 'tools-aggregate-schema', 'namespace-description', 'tools-aggregate-namespace' ] )
        expect( withPersona ).toEqual( [ 'about-namespace', 'about-selection', 'selection-skills-L1', 'selection-skills-L2', 'selection-skills-L3', 'namespace-skills', 'selection-aggregate' ] )
    } )

    test( 'selection-aggregate is persona-required', () => {
        const result = PromptBuilder.isPersonaRequired( { area: 'selection-aggregate' } )
        expect( result.personaRequired ).toBe( true )
    } )
} )


describe( 'PromptBuilder.isPersonaRequired', () => {
    test( 'returns false for neutral areas (1-4)', () => {
        const neutralAreas = [ 'single-test', 'tools-aggregate-schema', 'namespace-description', 'tools-aggregate-namespace' ]
        neutralAreas
            .forEach( ( area ) => {
                const result = PromptBuilder.isPersonaRequired( { area } )
                expect( result.personaRequired ).toBe( false )
            } )
    } )

    test( 'returns true for persona areas (5,6,7L1/L2/L3,8)', () => {
        const personaAreas = [ 'about-namespace', 'about-selection', 'selection-skills-L1', 'selection-skills-L2', 'selection-skills-L3', 'namespace-skills' ]
        personaAreas
            .forEach( ( area ) => {
                const result = PromptBuilder.isPersonaRequired( { area } )
                expect( result.personaRequired ).toBe( true )
            } )
    } )

    test( 'throws PB-004 for invalid area', () => {
        expect( () => PromptBuilder.isPersonaRequired( { area: 'invalid-area' } ) ).toThrow( /PB-004/ )
    } )

    test( 'throws PB-001 for missing area', () => {
        expect( () => PromptBuilder.isPersonaRequired( {} ) ).toThrow( /PB-001/ )
    } )
} )


describe( 'PromptBuilder.build — neutral areas (persona-optional)', () => {
    test( 'area=single-test, persona=null — personaRequired false, persona=neutral, no persona content in prompt', () => {
        const result = PromptBuilder.build( {
            template: sampleTemplate,
            persona: null,
            files: sampleFilesNeutral,
            questions: sampleQuestions,
            outputSchema: sampleOutputSchema,
            policies: samplePolicies,
            area: 'single-test'
        } )

        expect( result.metadata.personaRequired ).toBe( false )
        expect( result.metadata.persona ).toBe( 'neutral' )
        expect( result.metadata.area ).toBe( 'single-test' )
        expect( result.metadata.fileCount ).toBe( 2 )
        expect( result.metadata.questionCount ).toBe( 2 )

        // Persona placeholder collapsed to empty string — no Persona content.
        expect( result.prompt ).not.toContain( 'Persona: ' )
        expect( result.prompt ).not.toContain( 'Base-Persona: ' )
        // Pre-Instructions, Files and Question blocks remain.
        expect( result.prompt ).toContain( 'File preparation (mandatory — strict order)' )
        expect( result.prompt ).toContain( '{{SCHEMA_PATH}}' )
        expect( result.prompt ).toContain( 'Q-001' )
        expect( result.prompt ).toContain( 'Output schema (binding)' )
    } )

    test( 'all 4 neutral areas accept persona=null', () => {
        const neutralAreas = [ 'single-test', 'tools-aggregate-schema', 'namespace-description', 'tools-aggregate-namespace' ]
        neutralAreas
            .forEach( ( area ) => {
                const result = PromptBuilder.build( {
                    template: sampleTemplate,
                    persona: null,
                    files: sampleFilesNeutral,
                    questions: sampleQuestions,
                    outputSchema: sampleOutputSchema,
                    policies: samplePolicies,
                    area
                } )
                expect( result.metadata.personaRequired ).toBe( false )
                expect( result.metadata.persona ).toBe( 'neutral' )
            } )
    } )
} )


describe( 'PromptBuilder.build — persona areas', () => {
    test( 'area=about-namespace with persona — persona block is rendered', () => {
        const result = PromptBuilder.build( {
            template: sampleTemplate,
            persona: samplePersona,
            files: sampleFilesWithPersona,
            questions: sampleQuestions,
            outputSchema: sampleOutputSchema,
            policies: samplePolicies,
            area: 'about-namespace'
        } )

        expect( result.metadata.personaRequired ).toBe( true )
        expect( result.metadata.persona ).toBe( 'decision-maker--crypto-trader' )
        expect( result.prompt ).toContain( 'Persona: decision-maker--crypto-trader' )
        expect( result.prompt ).toContain( 'Base-Persona: decision-maker' )
        expect( result.prompt ).toContain( 'Lens: crypto-trader' )
        expect( result.prompt ).toContain( 'Focus: live trading' )
    } )

    test( 'all 6 persona areas accept a valid persona object', () => {
        const personaAreas = [ 'about-namespace', 'about-selection', 'selection-skills-L1', 'selection-skills-L2', 'selection-skills-L3', 'namespace-skills' ]
        personaAreas
            .forEach( ( area ) => {
                const result = PromptBuilder.build( {
                    template: sampleTemplate,
                    persona: samplePersona,
                    files: sampleFilesWithPersona,
                    questions: sampleQuestions,
                    outputSchema: sampleOutputSchema,
                    policies: samplePolicies,
                    area
                } )
                expect( result.metadata.personaRequired ).toBe( true )
                expect( result.metadata.persona ).toBe( samplePersona.id )
            } )
    } )

    test( 'persona without focus — block rendered without Focus line', () => {
        const personaWithoutFocus = {
            id: 'ai-engineer--neutral',
            basePersona: 'ai-engineer',
            lens: 'neutral'
        }
        const result = PromptBuilder.build( {
            template: sampleTemplate,
            persona: personaWithoutFocus,
            files: sampleFilesWithPersona,
            questions: sampleQuestions,
            outputSchema: sampleOutputSchema,
            policies: samplePolicies,
            area: 'about-namespace'
        } )

        expect( result.prompt ).toContain( 'Persona: ai-engineer--neutral' )
        expect( result.prompt ).not.toContain( 'Focus: ' )
    } )
} )


describe( 'PromptBuilder.build — validation errors', () => {
    test( 'missing template throws PB-001', () => {
        expect( () => PromptBuilder.build( {
            persona: null,
            files: sampleFilesNeutral,
            questions: sampleQuestions,
            outputSchema: sampleOutputSchema,
            policies: samplePolicies,
            area: 'single-test'
        } ) ).toThrow( /PB-001.*template/ )
    } )

    test( 'missing files throws PB-001', () => {
        expect( () => PromptBuilder.build( {
            template: sampleTemplate,
            persona: null,
            questions: sampleQuestions,
            outputSchema: sampleOutputSchema,
            policies: samplePolicies,
            area: 'single-test'
        } ) ).toThrow( /PB-001.*files/ )
    } )

    test( 'invalid area throws PB-004 with whitelist in message', () => {
        try {
            PromptBuilder.build( {
                template: sampleTemplate,
                persona: null,
                files: sampleFilesNeutral,
                questions: sampleQuestions,
                outputSchema: sampleOutputSchema,
                policies: samplePolicies,
                area: 'invalid-area'
            } )
            throw new Error( 'should have thrown' )
        } catch( error ) {
            expect( error.message ).toContain( 'PB-004' )
            expect( error.message ).toContain( 'invalid-area' )
            expect( error.message ).toContain( 'single-test' )
        }
    } )

    test( 'persona-required area but persona missing throws PB-005', () => {
        expect( () => PromptBuilder.build( {
            template: sampleTemplate,
            persona: null,
            files: sampleFilesWithPersona,
            questions: sampleQuestions,
            outputSchema: sampleOutputSchema,
            policies: samplePolicies,
            area: 'selection-skills-L2'
        } ) ).toThrow( /PB-005.*selection-skills-L2/ )
    } )

    test( 'empty files array throws PB-003', () => {
        expect( () => PromptBuilder.build( {
            template: sampleTemplate,
            persona: null,
            files: [],
            questions: sampleQuestions,
            outputSchema: sampleOutputSchema,
            policies: samplePolicies,
            area: 'single-test'
        } ) ).toThrow( /PB-003.*files/ )
    } )

    test( 'empty template throws PB-003', () => {
        expect( () => PromptBuilder.build( {
            template: '',
            persona: null,
            files: sampleFilesNeutral,
            questions: sampleQuestions,
            outputSchema: sampleOutputSchema,
            policies: samplePolicies,
            area: 'single-test'
        } ) ).toThrow( /PB-003.*template/ )
    } )

    test( 'empty questions array throws PB-003', () => {
        expect( () => PromptBuilder.build( {
            template: sampleTemplate,
            persona: null,
            files: sampleFilesNeutral,
            questions: [],
            outputSchema: sampleOutputSchema,
            policies: samplePolicies,
            area: 'single-test'
        } ) ).toThrow( /PB-003.*questions/ )
    } )

    test( 'persona object missing basePersona throws PB-006', () => {
        const brokenPersona = { id: 'x', lens: 'y' }
        expect( () => PromptBuilder.build( {
            template: sampleTemplate,
            persona: brokenPersona,
            files: sampleFilesWithPersona,
            questions: sampleQuestions,
            outputSchema: sampleOutputSchema,
            policies: samplePolicies,
            area: 'about-namespace'
        } ) ).toThrow( /PB-006.*basePersona/ )
    } )

    test( 'files entry without role throws PB-003', () => {
        expect( () => PromptBuilder.build( {
            template: sampleTemplate,
            persona: null,
            files: [ { path: 'x.mjs' } ],
            questions: sampleQuestions,
            outputSchema: sampleOutputSchema,
            policies: samplePolicies,
            area: 'single-test'
        } ) ).toThrow( /PB-003.*files\[0\]\.role/ )
    } )

    test( 'wrong type for files (string) throws PB-002', () => {
        expect( () => PromptBuilder.build( {
            template: sampleTemplate,
            persona: null,
            files: 'not-an-array',
            questions: sampleQuestions,
            outputSchema: sampleOutputSchema,
            policies: samplePolicies,
            area: 'single-test'
        } ) ).toThrow( /PB-002.*files/ )
    } )
} )


describe( 'PromptBuilder.build — smoke + metadata integrity', () => {
    test( 'metadata.fileCount and questionCount match input lengths', () => {
        const result = PromptBuilder.build( {
            template: sampleTemplate,
            persona: samplePersona,
            files: sampleFilesWithPersona,
            questions: sampleQuestions,
            outputSchema: sampleOutputSchema,
            policies: samplePolicies,
            area: 'about-namespace'
        } )
        expect( result.metadata.fileCount ).toBe( sampleFilesWithPersona.length )
        expect( result.metadata.questionCount ).toBe( sampleQuestions.length )
    } )

    test( 'output schema is JSON-stringified into the prompt', () => {
        const result = PromptBuilder.build( {
            template: sampleTemplate,
            persona: null,
            files: sampleFilesNeutral,
            questions: sampleQuestions,
            outputSchema: sampleOutputSchema,
            policies: samplePolicies,
            area: 'single-test'
        } )
        expect( result.prompt ).toContain( '"type": "object"' )
        expect( result.prompt ).toContain( '"scores"' )
        expect( result.prompt ).toContain( '"blocker"' )
    } )

    test( 'policies block lists each policy with id + summary', () => {
        const result = PromptBuilder.build( {
            template: sampleTemplate + '\n{{POLICIES_BLOCK}}\n',
            persona: null,
            files: sampleFilesNeutral,
            questions: sampleQuestions,
            outputSchema: sampleOutputSchema,
            policies: samplePolicies,
            area: 'single-test'
        } )
        expect( result.prompt ).toContain( 'POL-001 — No web research' )
        expect( result.prompt ).toContain( 'POL-002 — HTTP 4xx is never PASS' )
    } )

    test( 'questions block contains the question id and text', () => {
        const result = PromptBuilder.build( {
            template: sampleTemplate,
            persona: null,
            files: sampleFilesNeutral,
            questions: sampleQuestions,
            outputSchema: sampleOutputSchema,
            policies: samplePolicies,
            area: 'single-test'
        } )
        expect( result.prompt ).toContain( '[Q-001]' )
        expect( result.prompt ).toContain( 'Is the tool description precise?' )
    } )

    test( 'pre-instruction block contains mandatory header and numbered files', () => {
        const result = PromptBuilder.build( {
            template: sampleTemplate,
            persona: null,
            files: sampleFilesNeutral,
            questions: sampleQuestions,
            outputSchema: sampleOutputSchema,
            policies: samplePolicies,
            area: 'single-test'
        } )
        expect( result.prompt ).toContain( '## File preparation (mandatory — strict order)' )
        expect( result.prompt ).toContain( '"blocker": "<filepath>"' )
        expect( result.prompt ).toContain( '1. {{SCHEMA_PATH}}' )
        expect( result.prompt ).toContain( '2. {{TEST_RESPONSE_PATH}}' )
    } )
} )


const aggregateTemplate = sampleTemplate
    + '\n## Predecessor\n\n{{PREDECESSOR_GRADES_BLOCK}}\n\n## Goal\n\n{{GOAL_BLOCK}}\n'

const samplePredecessorGrades = [
    { id: 'btc-usd/getPrice', grade: 'A', status: 'stable' },
    { id: 'eth-usd/getPrice', grade: 'B', status: 'graded' }
]


describe( 'PromptBuilder.build — selection-aggregate area', () => {
    test( 'builds the 11th area with persona, predecessor grades and goal block', () => {
        const result = PromptBuilder.build( {
            template: aggregateTemplate,
            persona: samplePersona,
            files: sampleFilesWithPersona,
            questions: sampleQuestions,
            outputSchema: sampleOutputSchema,
            policies: samplePolicies,
            area: 'selection-aggregate',
            predecessorGrades: samplePredecessorGrades
        } )

        expect( result.metadata.area ).toBe( 'selection-aggregate' )
        expect( result.metadata.personaRequired ).toBe( true )
        expect( result.metadata.predecessorGradeCount ).toBe( 2 )
        expect( result.prompt ).toContain( 'Persona: decision-maker--crypto-trader' )
    } )

    test( 'predecessor-grades block lists each predecessor with grade + status', () => {
        const result = PromptBuilder.build( {
            template: aggregateTemplate,
            persona: samplePersona,
            files: sampleFilesWithPersona,
            questions: sampleQuestions,
            outputSchema: sampleOutputSchema,
            policies: samplePolicies,
            area: 'selection-aggregate',
            predecessorGrades: samplePredecessorGrades
        } )
        expect( result.prompt ).toContain( '## Predecessor Grades' )
        expect( result.prompt ).toContain( 'btc-usd/getPrice — grade=A, status=stable' )
        expect( result.prompt ).toContain( 'eth-usd/getPrice — grade=B, status=graded' )
    } )

    test( 'absent predecessorGrades yields empty block and zero count', () => {
        const result = PromptBuilder.build( {
            template: aggregateTemplate,
            persona: samplePersona,
            files: sampleFilesWithPersona,
            questions: sampleQuestions,
            outputSchema: sampleOutputSchema,
            policies: samplePolicies,
            area: 'selection-aggregate'
        } )
        expect( result.metadata.predecessorGradeCount ).toBe( 0 )
        expect( result.prompt ).not.toContain( '## Predecessor Grades' )
    } )

    test( 'malformed predecessorGrades entry throws PB-003', () => {
        expect( () => PromptBuilder.build( {
            template: aggregateTemplate,
            persona: samplePersona,
            files: sampleFilesWithPersona,
            questions: sampleQuestions,
            outputSchema: sampleOutputSchema,
            policies: samplePolicies,
            area: 'selection-aggregate',
            predecessorGrades: [ { id: 'x', grade: 'A' } ]
        } ) ).toThrow( /PB-003.*predecessorGrades\[0\]\.status/ )
    } )
} )


describe( 'PromptBuilder — Goal-Block + surfacing convention', () => {
    test( 'goal block contains a completion condition, a turn bound, and is <= 4000 characters', () => {
        const result = PromptBuilder.buildGoalBlock( { area: 'selection-aggregate' } )
        expect( result.condition.length ).toBeLessThanOrEqual( 4000 )
        expect( result.conditionLength ).toBeLessThanOrEqual( 4000 )
        expect( result.condition ).toMatch( /stop after \d+ turns/ )
        expect( result.maxTurns ).toBe( 25 )
        expect( result.goalBlock ).toContain( '## Goal-Block (completion condition)' )
    } )

    test( 'goal block carries the mandatory [GRADING] surfacing lines', () => {
        const result = PromptBuilder.buildGoalBlock( { area: 'selection-aggregate' } )
        expect( result.goalBlock ).toContain( 'Surfacing convention (mandatory)' )
        expect( result.goalBlock ).toContain( '[GRADING] area=' )
        expect( result.goalBlock ).toContain( 'schema-valid=✓' )
        expect( result.goalBlock ).toContain( 'status=' )
        expect( result.goalBlock ).toContain( '[GRADING] PROGRESS x/y' )
        expect( result.goalBlock ).toContain( '[GRADING] DONE' )
    } )

    test( 'goal block is injected into the prompt via {{GOAL_BLOCK}}', () => {
        const result = PromptBuilder.build( {
            template: aggregateTemplate,
            persona: samplePersona,
            files: sampleFilesWithPersona,
            questions: sampleQuestions,
            outputSchema: sampleOutputSchema,
            policies: samplePolicies,
            area: 'selection-aggregate',
            predecessorGrades: samplePredecessorGrades
        } )
        expect( result.prompt ).toContain( '[GRADING] DONE' )
        expect( result.prompt ).toContain( 'or stop after 25 turns' )
        expect( result.metadata.goalConditionLength ).toBeLessThanOrEqual( 4000 )
    } )

    test( 'custom condition + turn bound are honoured', () => {
        const result = PromptBuilder.buildGoalBlock( {
            condition: 'Grade every area in scope until schema-valid',
            maxTurns: 12
        } )
        expect( result.condition ).toContain( 'or stop after 12 turns' )
        expect( result.maxTurns ).toBe( 12 )
    } )

    test( 'over-length condition throws PB-007', () => {
        const tooLong = 'x'.repeat( 4001 )
        expect( () => PromptBuilder.buildGoalBlock( { condition: tooLong } ) ).toThrow( /PB-007/ )
    } )

    test( 'non-integer maxTurns throws PB-008', () => {
        expect( () => PromptBuilder.buildGoalBlock( { area: 'single-test', maxTurns: 2.5 } ) ).toThrow( /PB-008/ )
    } )
} )
