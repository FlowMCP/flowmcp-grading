import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import { TestCatalogBuilder } from '../../scripts/build-test-catalog.mjs'


function makeQuestionsPayload( { questions } ) {
    return JSON.stringify( {
        version: '1.0.0',
        generatedAt: '1970-01-01T00:00:00.000Z',
        count: questions.length,
        questions
    } )
}


describe( 'TestCatalogBuilder.build', () => {
    let tmpDir
    let questionsFile
    let outFile

    beforeEach( () => {
        tmpDir = mkdtempSync( join( tmpdir(), 'tcb-' ) )
        questionsFile = join( tmpDir, 'questions.json' )
        outFile = join( tmpDir, 'test-catalog.md' )
    } )

    afterEach( () => {
        rmSync( tmpDir, { recursive: true, force: true } )
    } )

    test( 'deterministic single-test maps to validation bucket', () => {
        writeFileSync( questionsFile, makeQuestionsPayload( {
            questions: [ {
                id: 'Q-single-test-01',
                area: 'single-test',
                dimension: 'docsUrlReachable',
                determinism: 'deterministic'
            } ]
        } ) )

        const result = TestCatalogBuilder.build( { questionsFile, outFile } )
        expect( result.status ).toBe( true )
        expect( result.struct.mapping ).toHaveLength( 1 )
        expect( result.struct.mapping[ 0 ].codeTestBucket )
            .toBe( 'tests/unit/v1/validation.test.mjs (route-level)' )
    } )

    test( 'non-deterministic maps to LLM-only bucket', () => {
        writeFileSync( questionsFile, makeQuestionsPayload( {
            questions: [ {
                id: 'Q-single-test-02',
                area: 'single-test',
                dimension: 'descriptionClarity',
                determinism: 'non-deterministic'
            } ]
        } ) )

        const result = TestCatalogBuilder.build( { questionsFile, outFile } )
        expect( result.status ).toBe( true )
        expect( result.struct.mapping[ 0 ].codeTestBucket )
            .toBe( 'no-code-test (eval-question, LLM-only)' )
    } )

    test( 'markdown output has header + row per question', () => {
        writeFileSync( questionsFile, makeQuestionsPayload( {
            questions: [
                { id: 'Q-single-test-01', area: 'single-test', dimension: 'a', determinism: 'deterministic' },
                { id: 'Q-single-test-02', area: 'single-test', dimension: 'b', determinism: 'non-deterministic' }
            ]
        } ) )

        TestCatalogBuilder.build( { questionsFile, outFile } )
        const md = readFileSync( outFile, 'utf8' )
        expect( md ).toContain( '| Frage-ID | Area | Dimension | Determinism | Code-Test-Bucket |' )
        expect( md ).toContain( '| Q-single-test-01 | single-test |' )
        expect( md ).toContain( '| Q-single-test-02 | single-test |' )
    } )

    test( 'fails when questions file is missing', () => {
        const result = TestCatalogBuilder.build( {
            questionsFile: join( tmpDir, 'does-not-exist.json' ),
            outFile
        } )
        expect( result.status ).toBe( false )
        const hasLoadError = result.struct.messages
            .some( ( m ) => m.includes( 'LOAD-ERROR' ) )
        expect( hasLoadError ).toBe( true )
    } )

    test( 'production catalog (60 questions) maps successfully', () => {
        const result = TestCatalogBuilder.build( {
            questionsFile: 'prompts/generated/questions.json',
            outFile
        } )
        expect( result.status ).toBe( true )
        expect( result.struct.mapping.length ).toBe( 60 )
    } )
} )
