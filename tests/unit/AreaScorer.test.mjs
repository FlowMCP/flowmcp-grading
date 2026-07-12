import { describe, test, expect, beforeAll, afterAll } from '@jest/globals'
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { AreaScorer, NEUTRAL_PERSONA_IDS } from '../../src/harness/AreaScorer.mjs'


let tempRoot = null


// The 10 single-test questions (mirror of prompts/generated/questions.json, area
// single-test): 3 deterministic + 7 non-deterministic. Kept inline so the unit
// test does not depend on the generated catalogue.
const singleTestQuestions = [
    { id: 'Q-single-test-01', dimension: 'docsUrlReachable', determinism: 'deterministic', weight: 0.34 },
    { id: 'Q-single-test-02', dimension: 'outputSchemaMatch', determinism: 'deterministic', weight: 0.33 },
    { id: 'Q-single-test-03', dimension: 'apiKeyDomainMatch', determinism: 'deterministic', weight: 0.33 },
    { id: 'Q-single-test-04', dimension: 'descriptionClarity', determinism: 'non-deterministic', weight: 0.34 },
    { id: 'Q-single-test-05', dimension: 'descriptionSpecConformance', determinism: 'non-deterministic', weight: 0.33 },
    { id: 'Q-single-test-06', dimension: 'paramConsistency', determinism: 'non-deterministic', weight: 0.33 },
    { id: 'Q-single-test-07', dimension: 'exampleQuality', determinism: 'non-deterministic', weight: 0.25 },
    { id: 'Q-single-test-08', dimension: 'toolNameSemantic', determinism: 'non-deterministic', weight: 0.25 },
    { id: 'Q-single-test-09', dimension: 'errorCasesDocumented', determinism: 'non-deterministic', weight: 0.25 },
    { id: 'Q-single-test-10', dimension: 'verbPrefixConsistent', determinism: 'non-deterministic', weight: 0.25 }
]


// A high-scoring answer set (all pass / 5) -> aggregate A raw, trimmed to B for
// the autonomous tier.
const highAnswers = () => {
    return singleTestQuestions
        .map( ( question, index ) => {
            const score = index < 3 ? 'pass' : 5
            return { questionId: question.id, score, reasoning: `ok-${index}` }
        } )
}


const goodEnvelope = () => {
    return {
        gradingId: '88986874--2026-06-01T00-00-00Z',
        schemaHash: '88986874',
        area: 'single-test',
        iteration: 0,
        timestamp: '2026-06-01T00:00:00.000Z',
        persona: null,
        answers: highAnswers(),
        improvementHints: [],
        harness: 'claude-code'
    }
}


beforeAll( async () => {
    tempRoot = await mkdtemp( join( tmpdir(), 'areascorer-' ) )
} )


afterAll( async () => {
    if( tempRoot !== null ) {
        await rm( tempRoot, { recursive: true, force: true } )
    }
} )


describe( 'AreaScorer.validateAnswers', () => {
    test( 'accepts a well-formed 10-answer set', () => {
        const result = AreaScorer.validateAnswers( { answers: highAnswers(), questions: singleTestQuestions } )
        expect( result.status ).toBe( true )
        expect( result.messages ).toEqual( [] )
    } )

    test( 'rejects a count mismatch (no silent skip)', () => {
        const answers = highAnswers().slice( 0, 9 )
        const result = AreaScorer.validateAnswers( { answers, questions: singleTestQuestions } )
        expect( result.status ).toBe( false )
        expect( result.messages.some( ( m ) => m.startsWith( 'ASC-002' ) ) ).toBe( true )
    } )

    test( 'rejects an unknown questionId', () => {
        const answers = highAnswers()
        answers[ 0 ] = { questionId: 'Q-bogus-99', score: 'pass', reasoning: 'x' }
        const result = AreaScorer.validateAnswers( { answers, questions: singleTestQuestions } )
        expect( result.status ).toBe( false )
        expect( result.messages.some( ( m ) => m.startsWith( 'ASC-003' ) ) ).toBe( true )
    } )

    test( 'rejects an out-of-range numeric score', () => {
        const answers = highAnswers()
        answers[ 3 ] = { questionId: 'Q-single-test-04', score: 7, reasoning: 'x' }
        const result = AreaScorer.validateAnswers( { answers, questions: singleTestQuestions } )
        expect( result.status ).toBe( false )
        expect( result.messages.some( ( m ) => m.startsWith( 'ASC-004' ) ) ).toBe( true )
    } )

    test( 'rejects empty reasoning', () => {
        const answers = highAnswers()
        answers[ 0 ] = { questionId: 'Q-single-test-01', score: 'pass', reasoning: '' }
        const result = AreaScorer.validateAnswers( { answers, questions: singleTestQuestions } )
        expect( result.status ).toBe( false )
        expect( result.messages.some( ( m ) => m.startsWith( 'ASC-005' ) ) ).toBe( true )
    } )

    test( 'requires naReason when score is n/a', () => {
        const answers = highAnswers()
        answers[ 4 ] = { questionId: 'Q-single-test-05', score: 'n/a', reasoning: 'x' }
        const result = AreaScorer.validateAnswers( { answers, questions: singleTestQuestions } )
        expect( result.status ).toBe( false )
        expect( result.messages.some( ( m ) => m.startsWith( 'ASC-006' ) ) ).toBe( true )
    } )
} )


describe( 'AreaScorer.answersToGradings (neutral-area personaIds rule)', () => {
    test( 'attaches personaIds=[neutral] to non-deterministic gradings only', () => {
        const result = AreaScorer.answersToGradings( {
            answers: highAnswers(), questions: singleTestQuestions, recordedAt: '2026-06-01T00:00:00.000Z'
        } )
        expect( result.errors ).toEqual( [] )
        expect( result.gradings.length ).toBe( 10 )

        const deterministic = result.gradings.slice( 0, 3 )
        deterministic
            .forEach( ( grading ) => {
                expect( grading.determinism ).toBe( 'deterministic' )
                expect( grading.selectionContext ).toBeUndefined()
            } )

        const nonDeterministic = result.gradings.slice( 3 )
        nonDeterministic
            .forEach( ( grading ) => {
                expect( grading.determinism ).toBe( 'non-deterministic' )
                expect( grading.selectionContext.personaIds ).toEqual( NEUTRAL_PERSONA_IDS )
            } )
    } )
} )


describe( 'AreaScorer.buildEntry', () => {
    test( 'builds a full autonomous entry and trims the grade to B', () => {
        const mapped = AreaScorer.answersToGradings( {
            answers: highAnswers(), questions: singleTestQuestions, recordedAt: '2026-06-01T00:00:00.000Z'
        } )
        const result = AreaScorer.buildEntry( {
            schemaId: 'openMeteoAirQuality',
            area: 'single-test',
            llmModel: 'claude-opus-4-8',
            gradings: mapped.gradings,
            schemaHash: '88986874'
        } )
        expect( result.errors ).toEqual( [] )
        expect( result.entry.gradingTier ).toBe( 'autonomous' )
        expect( result.entry.maxAttainableGrade ).toBe( 'B' )
        // raw aggregate is A (all 5 / pass) but autonomous trims to B
        expect( result.entry.rawGrade ).toBe( 'A' )
        expect( result.entry.aggregateGrade ).toBe( 'B' )
        expect( result.entry.grade ).toBe( 'B' )
        expect( result.entry.gradingMode ).toBe( 'full' )
        expect( result.entry.gradings.length ).toBe( 10 )
        expect( result.entry.harness ).toBe( 'claude-code' )
    } )

    test( 'rejects empty gradings (no silent default)', () => {
        const result = AreaScorer.buildEntry( {
            schemaId: 'x', area: 'single-test', llmModel: 'm', gradings: []
        } )
        expect( result.entry ).toBeNull()
        expect( result.errors.length ).toBeGreaterThan( 0 )
    } )
} )


describe( 'AreaScorer.scoreArea (skillInvoker seam)', () => {
    test( 'scores via a mock skillInvoker and returns a built entry', async () => {
        const mockInvoker = async ( { skillName, payload } ) => {
            expect( skillName ).toBe( 'single-test-start-grade' )
            expect( payload.area ).toBe( 'single-test' )
            return { gradingJson: goodEnvelope(), iteration: 0 }
        }
        const result = await AreaScorer.scoreArea( {
            area: 'single-test',
            questions: singleTestQuestions,
            schemaId: 'openMeteoAirQuality',
            llmModel: 'claude-opus-4-8',
            schemaHash: '88986874',
            skillInvoker: mockInvoker,
            recordedAt: '2026-06-01T00:00:00.000Z'
        } )
        expect( result.errors ).toEqual( [] )
        expect( result.entry.grade ).toBe( 'B' )
        expect( result.blocker ).toBeNull()
    } )

    test( 'passes through a blocker without building an entry', async () => {
        const blockInvoker = async () => { return { gradingJson: null, blocker: 'download failed' } }
        const result = await AreaScorer.scoreArea( {
            area: 'single-test', questions: singleTestQuestions, schemaId: 'x', llmModel: 'm',
            skillInvoker: blockInvoker, recordedAt: '2026-06-01T00:00:00.000Z'
        } )
        expect( result.blocker ).toBe( 'download failed' )
        expect( result.entry ).toBeNull()
    } )

    test( 'surfaces invalid answers as errors (no default-pass)', async () => {
        const badInvoker = async () => {
            const env = goodEnvelope()
            env.answers = env.answers.slice( 0, 8 )
            return { gradingJson: env }
        }
        const result = await AreaScorer.scoreArea( {
            area: 'single-test', questions: singleTestQuestions, schemaId: 'x', llmModel: 'm',
            skillInvoker: badInvoker, recordedAt: '2026-06-01T00:00:00.000Z'
        } )
        expect( result.entry ).toBeNull()
        expect( result.errors.length ).toBeGreaterThan( 0 )
    } )
} )


describe( 'AreaScorer.resolveGradingsDir (gradings-dir mapping)', () => {
    const root = '/tmp/providers'

    test( 'single-test -> tools/<tool>/_gradings', () => {
        const r = AreaScorer.resolveGradingsDir( { providersRoot: root, ns: 'openmeteo', schemaId: 'openMeteoAirQuality', tool: 'getCurrentAirQuality', area: 'single-test' } )
        expect( r.errors ).toEqual( [] )
        expect( r.dir ).toBe( '/tmp/providers/openmeteo/openMeteoAirQuality/tools/getCurrentAirQuality/_gradings' )
    } )

    test( 'tools-aggregate-schema -> <schema>/_gradings', () => {
        const r = AreaScorer.resolveGradingsDir( { providersRoot: root, ns: 'openmeteo', schemaId: 'openMeteoAirQuality', area: 'tools-aggregate-schema' } )
        expect( r.dir ).toBe( '/tmp/providers/openmeteo/openMeteoAirQuality/_gradings' )
    } )

    test( 'tools-aggregate-namespace -> <ns>/_gradings', () => {
        const r = AreaScorer.resolveGradingsDir( { providersRoot: root, ns: 'openmeteo', area: 'tools-aggregate-namespace' } )
        expect( r.dir ).toBe( '/tmp/providers/openmeteo/_gradings' )
    } )

    test( 'about-namespace -> <schema>/resources/about/_gradings', () => {
        const r = AreaScorer.resolveGradingsDir( { providersRoot: root, ns: 'openmeteo', schemaId: 'openMeteoAirQuality', area: 'about-namespace' } )
        expect( r.dir ).toBe( '/tmp/providers/openmeteo/openMeteoAirQuality/resources/about/_gradings' )
    } )

    test( 'namespace-description -> <ns>/_gradings (shared with ns aggregate)', () => {
        const r = AreaScorer.resolveGradingsDir( { providersRoot: root, ns: 'openmeteo', area: 'namespace-description' } )
        expect( r.errors ).toEqual( [] )
        expect( r.dir ).toBe( '/tmp/providers/openmeteo/_gradings' )
    } )

    test( 'namespace-skills -> <schema>/skills/<skill>/_gradings', () => {
        const r = AreaScorer.resolveGradingsDir( { providersRoot: root, ns: 'openmeteo', schemaId: 'openMeteoAirQuality', skill: 'summariseAirQuality', area: 'namespace-skills' } )
        expect( r.errors ).toEqual( [] )
        expect( r.dir ).toBe( '/tmp/providers/openmeteo/openMeteoAirQuality/skills/summariseAirQuality/_gradings' )
    } )

    test( 'namespace-skills without skill errors (no silent default)', () => {
        const r = AreaScorer.resolveGradingsDir( { providersRoot: root, ns: 'openmeteo', schemaId: 'openMeteoAirQuality', area: 'namespace-skills' } )
        expect( r.dir ).toBeNull()
        expect( r.errors.some( ( m ) => m.startsWith( 'ASC-001' ) ) ).toBe( true )
    } )

    test( 'single-test without tool errors (no silent default)', () => {
        const r = AreaScorer.resolveGradingsDir( { providersRoot: root, ns: 'openmeteo', schemaId: 'openMeteoAirQuality', area: 'single-test' } )
        expect( r.dir ).toBeNull()
        expect( r.errors.some( ( m ) => m.startsWith( 'ASC-001' ) ) ).toBe( true )
    } )

    test( 'unknown area errors', () => {
        const r = AreaScorer.resolveGradingsDir( { providersRoot: root, ns: 'openmeteo', area: 'made-up' } )
        expect( r.dir ).toBeNull()
        expect( r.errors.some( ( m ) => m.startsWith( 'ASC-011' ) ) ).toBe( true )
    } )
} )


describe( 'AreaScorer.writeEntry (NO-OVERWRITE)', () => {
    test( 'writes a grading entry then refuses to overwrite', async () => {
        const gradingsDir = join( tempRoot, 'tools', 'getCurrentAirQuality', '_gradings' )
        const mapped = AreaScorer.answersToGradings( {
            answers: highAnswers(), questions: singleTestQuestions, recordedAt: '2026-06-01T00:00:00.000Z'
        } )
        const built = AreaScorer.buildEntry( {
            schemaId: 'openMeteoAirQuality', area: 'single-test', llmModel: 'm', gradings: mapped.gradings
        } )

        const first = await AreaScorer.writeEntry( {
            entry: built.entry, gradingsDir, area: 'single-test', timestamp: '2026-06-01T00-00-00Z'
        } )
        expect( first.written ).toBe( true )
        expect( first.errors ).toEqual( [] )

        const onDisk = JSON.parse( await readFile( first.path, 'utf-8' ) )
        expect( onDisk.grade ).toBe( 'B' )

        const second = await AreaScorer.writeEntry( {
            entry: built.entry, gradingsDir, area: 'single-test', timestamp: '2026-06-01T00-00-00Z'
        } )
        expect( second.written ).toBe( false )
        expect( second.errors.some( ( m ) => m.startsWith( 'ASC-010' ) ) ).toBe( true )
    } )
} )
