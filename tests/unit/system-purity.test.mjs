/**
 * system-purity.test.mjs — PRD-014 System-Reinheit (Purity) Gate.
 *
 * One consolidated, auditable purity suite. Each describe block maps to one row of
 * the grading-handover guarantee table (G1..G6). Every guarantee has at least one
 * PASS-case and one REJECT-case, so the table is provable from the tests.
 *
 * Guarantee -> code anchor (re-located by symbol, not by line number):
 *   G1  Payload validity (strict-JSON vs output-schemas/<area>.schema.json)
 *       -> AreaScorer.validateAnswers (src/harness/AreaScorer.mjs)
 *   G5  HTTP-4xx != PASS (only HTTP 200 = pass)
 *       -> SingleSchemaPhases.#runSingleTest (src/Phases/SingleSchema.mjs);
 *          spec grading/3.0.0/06-determinism-and-tier.md (HTTP-200-only)
 *   G6a No free writing (only the derived grade.json, atomic single writer)
 *       -> ProviderProof.write / #writeProofOverwritable (src/ProviderProof.mjs)
 *
 * G2/G3/G4 (consume Task-ID known / area-set complete-or-partial / per-area
 * question-count) live in the CLI consume path and are pinned in the cli repo's
 * grading-system-purity suite. G6b (kanban-readonly read-only grep) is also pinned
 * there because the skill file is reachable from the cli repo's tree.
 *
 * NO SILENT DEFAULTS. Tests write ONLY into an OS temp dir, never a home folder.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals'
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { AreaScorer } from '../../src/harness/AreaScorer.mjs'
import { SingleSchemaPhases } from '../../src/Phases/SingleSchema.mjs'
import { Grading } from '../../src/Grading.mjs'
import { ProviderProof } from '../../src/ProviderProof.mjs'


const here = dirname( fileURLToPath( import.meta.url ) )
const outputSchemasDir = join( here, '..', '..', 'prompts', 'output-schemas' )
const PROVIDER_AREAS = [
    'single-test',
    'tools-aggregate-schema',
    'tools-aggregate-namespace',
    'namespace-description',
    'namespace-skills',
    'about-namespace'
]


let tempRoot = null


// A 10-question single-test set (3 deterministic + 7 non-deterministic), kept inline
// so the suite is independent of the generated catalogue.
const questions = [
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


const goodAnswers = () => {
    return questions
        .map( ( question, index ) => {
            const score = index < 3 ? 'pass' : 5
            return { questionId: question.id, score, reasoning: `ok-${index}` }
        } )
}


beforeAll( async () => {
    tempRoot = await mkdtemp( join( tmpdir(), 'purity-' ) )
} )


afterAll( async () => {
    if( tempRoot !== null ) {
        await rm( tempRoot, { recursive: true, force: true } )
    }
} )


// ---- G1: Payload validity (strict-JSON vs output-schemas/<area>.schema.json) ----
describe( 'G1 — Payload validity (AreaScorer.validateAnswers)', () => {
    test( 'PASS — a well-formed 10-answer envelope validates', () => {
        const result = AreaScorer.validateAnswers( { answers: goodAnswers(), questions } )
        expect( result.status ).toBe( true )
        expect( result.messages ).toEqual( [] )
    } )

    test( 'REJECT — unknown questionId (ASC-003)', () => {
        const answers = goodAnswers()
        answers[ 0 ].questionId = 'Q-not-a-real-question'
        const result = AreaScorer.validateAnswers( { answers, questions } )
        expect( result.status ).toBe( false )
        expect( result.messages.some( ( m ) => m.includes( 'ASC-003' ) && m.includes( 'unknown questionId' ) ) ).toBe( true )
    } )

    test( 'REJECT — duplicate questionId (ASC-003)', () => {
        const answers = goodAnswers()
        answers[ 1 ].questionId = answers[ 0 ].questionId
        const result = AreaScorer.validateAnswers( { answers, questions } )
        expect( result.status ).toBe( false )
        expect( result.messages.some( ( m ) => m.includes( 'ASC-003' ) && m.includes( 'duplicate' ) ) ).toBe( true )
    } )

    test( 'REJECT — answer count mismatch (ASC-002, the G4 anchor in this module)', () => {
        const answers = goodAnswers().slice( 0, 9 )
        const result = AreaScorer.validateAnswers( { answers, questions } )
        expect( result.status ).toBe( false )
        expect( result.messages.some( ( m ) => m.includes( 'ASC-002' ) ) ).toBe( true )
    } )

    test( 'REJECT — invalid score enum (ASC-004)', () => {
        const answers = goodAnswers()
        answers[ 4 ].score = 'maybe'
        const result = AreaScorer.validateAnswers( { answers, questions } )
        expect( result.status ).toBe( false )
        expect( result.messages.some( ( m ) => m.includes( 'ASC-004' ) ) ).toBe( true )
    } )

    test( 'REJECT — empty reasoning (ASC-005)', () => {
        const answers = goodAnswers()
        answers[ 5 ].reasoning = ''
        const result = AreaScorer.validateAnswers( { answers, questions } )
        expect( result.status ).toBe( false )
        expect( result.messages.some( ( m ) => m.includes( 'ASC-005' ) ) ).toBe( true )
    } )

    test( 'REJECT — n/a score without a valid naReason (ASC-006)', () => {
        const answers = goodAnswers()
        answers[ 6 ].score = 'n/a'
        answers[ 6 ].naReason = 'just-because'
        const result = AreaScorer.validateAnswers( { answers, questions } )
        expect( result.status ).toBe( false )
        expect( result.messages.some( ( m ) => m.includes( 'ASC-006' ) ) ).toBe( true )
    } )

    test( 'every area output-schema is strict-JSON (additionalProperties:false)', async () => {
        const checked = await Promise.all(
            PROVIDER_AREAS.map( async ( area ) => {
                const path = join( outputSchemasDir, `${area}.schema.json` )
                const schema = JSON.parse( await readFile( path, 'utf-8' ) )
                // The answer-envelope branch is the object branch of the oneOf
                // (the other branch is the shared blocker shape).
                const objectBranch = Array.isArray( schema.oneOf )
                    ? schema.oneOf.find( ( branch ) => branch.type === 'object' )
                    : schema
                return { area, additionalProperties: objectBranch === undefined ? undefined : objectBranch.additionalProperties }
            } )
        )
        checked
            .forEach( ( entry ) => {
                expect( entry.additionalProperties ).toBe( false )
            } )
    } )
} )


// ---- G5: HTTP-4xx != PASS (only HTTP 200 = pass) --------------------------------
describe( 'G5 — HTTP-4xx is never PASS (SingleSchemaPhases.#runSingleTest)', () => {
    const baseEntry = () => {
        const created = Grading.createEntry( {
            schemaId: 'demoapi.getThing',
            gradingTier: 'autonomous',
            grader: { kind: 'llm', llmModel: 'test' },
            area: 'single-test',
            harness: 'claude-code'
        } )
        return created.entry
    }

    const runWithStatus = ( { httpStatus } ) => {
        return SingleSchemaPhases.runArea( {
            entry: baseEntry(),
            schemaPath: '/tmp/demoapi.mjs',
            area: 'single-test',
            dataPretest: { ok: httpStatus === 200, httpStatus, workingTests: httpStatus === 200 ? 3 : 0 }
        } )
    }

    test( 'PASS — httpStatus 200 scores pass and the node is graded', () => {
        const result = runWithStatus( { httpStatus: 200 } )
        expect( result.status ).toBe( 'graded' )
        const lastGrading = result.entry.gradings[ result.entry.gradings.length - 1 ]
        expect( lastGrading.score ).toBe( 'pass' )
    } )

    test.each( [ 401, 403, 404, 429, 500 ] )( 'REJECT — httpStatus %i never scores pass (node blocked)', ( httpStatus ) => {
        const result = runWithStatus( { httpStatus } )
        expect( result.status ).toBe( 'blocked' )
        const lastGrading = result.entry.gradings[ result.entry.gradings.length - 1 ]
        expect( lastGrading.score ).toBe( 'fail' )
        expect( lastGrading.score ).not.toBe( 'pass' )
    } )

    test( 'REJECT — a missing DataPretest summary errors (GRD-050), never defaults to pass', () => {
        const result = SingleSchemaPhases.runArea( {
            entry: baseEntry(), schemaPath: '/tmp/demoapi.mjs', area: 'single-test', dataPretest: null
        } )
        expect( result.status ).toBe( 'blocked' )
        expect( result.errors.some( ( e ) => e.includes( 'GRD-050' ) ) ).toBe( true )
    } )

    test( 'REJECT — a missing numeric httpStatus errors (GRD-050), never defaults to pass', () => {
        const result = SingleSchemaPhases.runArea( {
            entry: baseEntry(), schemaPath: '/tmp/demoapi.mjs', area: 'single-test', dataPretest: { ok: true, workingTests: 3 }
        } )
        expect( result.status ).toBe( 'blocked' )
        expect( result.errors.some( ( e ) => e.includes( 'GRD-050' ) ) ).toBe( true )
    } )
} )


// ---- G6a: No free writing (ProviderProof is the sole, atomic writer) ------------
describe( 'G6a — No free writing (ProviderProof.write, atomic single writer)', () => {
    const namespaceIndex = () => ( {
        namespace: 'demoapi',
        status: 'graded',
        namespaceAggregate: { status: 'graded', grade: 'B', normalizedScore: 3.8 },
        schemas: { 'demoapi.api': { status: 'graded', grade: 'B' } },
        blockers: []
    } )

    test( 'PASS — write produces exactly one grade.json and no other file under the provider dir', async () => {
        const providerDir = await mkdtemp( join( tempRoot, 'prov-' ) )
        const result = await ProviderProof.write( { namespaceIndex: namespaceIndex(), providerDir } )
        expect( result.status ).toBe( true )

        const entries = await readdir( providerDir )
        expect( entries ).toEqual( [ 'grade.json' ] )

        // No leftover atomic-tmp file (the write is atomic tmp+rename).
        const noTmp = entries.every( ( name ) => name.includes( '.tmp' ) === false )
        expect( noTmp ).toBe( true )

        const proof = JSON.parse( await readFile( join( providerDir, 'grade.json' ), 'utf-8' ) )
        expect( proof.namespace ).toBe( 'demoapi' )
        expect( proof.monitoring ).toEqual( { githubIssue: null, boardColumn: null } )
    } )

    test( 'PASS — a re-write touches ONLY grade.json (still exactly one file, atomic)', async () => {
        const providerDir = await mkdtemp( join( tempRoot, 'prov-rewrite-' ) )
        await ProviderProof.write( { namespaceIndex: namespaceIndex(), providerDir } )
        const second = await ProviderProof.write( { namespaceIndex: namespaceIndex(), providerDir } )
        expect( second.status ).toBe( true )
        const entries = await readdir( providerDir )
        expect( entries ).toEqual( [ 'grade.json' ] )
    } )

    test( 'REJECT — an invalid namespaceIndex is refused (no write, explicit error)', async () => {
        const providerDir = await mkdtemp( join( tempRoot, 'prov-bad-' ) )
        const result = await ProviderProof.write( { namespaceIndex: null, providerDir } )
        expect( result.status ).toBe( false )
        expect( result.errors.length ).toBeGreaterThan( 0 )
        expect( existsSync( join( providerDir, 'grade.json' ) ) ).toBe( false )
    } )

    test( 'REJECT — an empty providerDir is refused (no silent default path)', async () => {
        const result = await ProviderProof.write( { namespaceIndex: namespaceIndex(), providerDir: '' } )
        expect( result.status ).toBe( false )
        expect( result.errors.some( ( e ) => e.includes( 'PRF-003' ) || e.includes( 'PRF-001' ) ) ).toBe( true )
    } )
} )
