import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import { QuestionCatalogDocBuilder } from '../../scripts/build-question-catalog-doc.mjs'


function makeQuestionsPayload( { questions } ) {
    return JSON.stringify( {
        version: '1.0.0',
        generatedAt: '1970-01-01T00:00:00.000Z',
        count: questions.length,
        questions
    } )
}


describe( 'QuestionCatalogDocBuilder.build', () => {
    let tmpDir
    let questionsJsonPath
    let outputMdPath

    beforeEach( () => {
        tmpDir = mkdtempSync( join( tmpdir(), 'qcd-' ) )
        questionsJsonPath = join( tmpDir, 'questions.json' )
        outputMdPath = join( tmpDir, 'question-catalog.md' )
    } )

    afterEach( () => {
        rmSync( tmpDir, { recursive: true, force: true } )
    } )

    test( 'renders a filename overview generated from _sourcePath', () => {
        writeFileSync( questionsJsonPath, makeQuestionsPayload( {
            questions: [
                {
                    id: 'Q-single-test-01',
                    area: 'single-test',
                    dimension: 'docsUrlReachable',
                    question: 'Is the docs URL reachable?',
                    determinism: 'deterministic',
                    personaRequired: false,
                    _sourcePath: 'deterministic/01-docs-url-reachable.md'
                },
                {
                    id: 'Q-single-test-02',
                    area: 'single-test',
                    dimension: 'descriptionClarity',
                    question: 'Is the description free of marketing terms?',
                    determinism: 'non-deterministic',
                    personaRequired: false,
                    _sourcePath: 'non-deterministic/01-description-clarity.md'
                }
            ]
        } ) )

        const result = QuestionCatalogDocBuilder.build( { questionsJsonPath, outputMdPath } )
        expect( result.status ).toBe( true )

        const md = readFileSync( outputMdPath, 'utf8' )
        expect( md ).toContain( '## Overview by Filename' )
        expect( md ).toContain( '### Deterministic (1)' )
        expect( md ).toContain( '### Non-deterministic (1)' )
        expect( md ).toContain( '`deterministic/01-docs-url-reachable.md`' )
        expect( md ).toContain( '`non-deterministic/01-description-clarity.md`' )
    } )

    test( 'overview is idempotent with BUILD_TS=fixed', () => {
        writeFileSync( questionsJsonPath, makeQuestionsPayload( {
            questions: [ {
                id: 'Q-single-test-01',
                area: 'single-test',
                dimension: 'docsUrlReachable',
                question: 'Q',
                determinism: 'deterministic',
                personaRequired: false,
                _sourcePath: 'deterministic/01-docs-url-reachable.md'
            } ]
        } ) )

        process.env.BUILD_TS = 'fixed'
        QuestionCatalogDocBuilder.build( { questionsJsonPath, outputMdPath } )
        const a = readFileSync( outputMdPath, 'utf8' )
        QuestionCatalogDocBuilder.build( { questionsJsonPath, outputMdPath } )
        const b = readFileSync( outputMdPath, 'utf8' )
        delete process.env.BUILD_TS
        expect( a ).toBe( b )
    } )

    test( 'production questions.json renders 60 rows across the overview', () => {
        const result = QuestionCatalogDocBuilder.build( {
            questionsJsonPath: 'prompts/generated/questions.json',
            outputMdPath
        } )
        expect( result.status ).toBe( true )
        expect( result.struct.questions.length ).toBe( 60 )

        const md = readFileSync( outputMdPath, 'utf8' )
        expect( md ).toContain( '## Overview by Filename' )
        expect( md ).toContain( '### Deterministic (7)' )
        expect( md ).toContain( '### Non-deterministic (53)' )
    } )
} )
