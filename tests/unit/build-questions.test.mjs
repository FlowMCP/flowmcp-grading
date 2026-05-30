import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import { QuestionBuilder } from '../../scripts/build-questions.mjs'


const FIXTURE_ROOT = 'tests/fixtures/questions-valid'
const BROKEN_ROOT = 'tests/fixtures/questions-broken'


describe( 'QuestionBuilder.build (valid fixtures)', () => {
    let tmpDir
    let outFile

    beforeEach( () => {
        tmpDir = mkdtempSync( join( tmpdir(), 'qb-' ) )
        outFile = join( tmpDir, 'questions.json' )
    } )

    afterEach( () => {
        rmSync( tmpDir, { recursive: true, force: true } )
    } )

    test( 'builds 3 fixtures successfully and writes JSON', () => {
        const result = QuestionBuilder.build( { rootDir: FIXTURE_ROOT, outFile } )
        expect( result.status ).toBe( true )
        expect( result.struct.messages ).toEqual( [] )
        expect( result.struct.questions.length ).toBe( 3 )
        expect( existsSync( outFile ) ).toBe( true )

        const payload = JSON.parse( readFileSync( outFile, 'utf8' ) )
        expect( payload.count ).toBe( 3 )
        expect( payload.questions ).toHaveLength( 3 )
        expect( payload.version ).toBe( '1.0.0' )
    } )

    test( 'idempotent with BUILD_TS=fixed', () => {
        process.env.BUILD_TS = 'fixed'
        QuestionBuilder.build( { rootDir: FIXTURE_ROOT, outFile } )
        const a = readFileSync( outFile, 'utf8' )
        QuestionBuilder.build( { rootDir: FIXTURE_ROOT, outFile } )
        const b = readFileSync( outFile, 'utf8' )
        delete process.env.BUILD_TS
        expect( a ).toBe( b )
    } )
} )


describe( 'QuestionBuilder.build (validation failures)', () => {
    let tmpDir
    let outFile

    beforeEach( () => {
        tmpDir = mkdtempSync( join( tmpdir(), 'qb-' ) )
        outFile = join( tmpDir, 'questions.json' )
    } )

    afterEach( () => {
        rmSync( tmpDir, { recursive: true, force: true } )
    } )

    test( 'fails on missing required field', () => {
        const result = QuestionBuilder.build( { rootDir: BROKEN_ROOT, outFile } )
        expect( result.status ).toBe( false )
        const hasMissingVersion = result.struct.messages
            .some( ( m ) => m.includes( 'MISSING-FIELD version' ) )
        expect( hasMissingVersion ).toBe( true )
    } )

    test( 'fails on bad id-pattern', () => {
        const badDir = mkdtempSync( join( tmpdir(), 'qb-bad-' ) )
        mkdirSync( join( badDir, 'deterministic' ), { recursive: true } )
        writeFileSync(
            join( badDir, 'deterministic', '01-bad.md' ),
            [
                '---',
                'id: BAD_ID',
                'area: single-test',
                'dimension: docsUrlReachable',
                'question: "Q"',
                'scoreType: boolean',
                'weight: 1.0',
                'determinism: deterministic',
                'tier: P1',
                'filesToRead:',
                '  - "{{schemaPath}}"',
                'preInstructionRef: x',
                'evaluatorTask: "T"',
                'outputSchemaRef: y',
                'personaRequired: false',
                'version: 1.0.0',
                '---'
            ].join( '\n' )
        )
        const result = QuestionBuilder.build( { rootDir: badDir, outFile } )
        rmSync( badDir, { recursive: true, force: true } )
        expect( result.status ).toBe( false )
        const hasIdPattern = result.struct.messages
            .some( ( m ) => m.includes( 'ID-PATTERN' ) )
        expect( hasIdPattern ).toBe( true )
    } )

    test( 'fails on bad area enum', () => {
        const badDir = mkdtempSync( join( tmpdir(), 'qb-bad-' ) )
        mkdirSync( join( badDir, 'deterministic' ), { recursive: true } )
        writeFileSync(
            join( badDir, 'deterministic', '01-bad.md' ),
            [
                '---',
                'id: Q-unknown-area-01',
                'area: unknown-area',
                'dimension: x',
                'question: "Q"',
                'scoreType: boolean',
                'weight: 1.0',
                'determinism: deterministic',
                'tier: P1',
                'filesToRead:',
                '  - "{{schemaPath}}"',
                'preInstructionRef: x',
                'evaluatorTask: "T"',
                'outputSchemaRef: y',
                'personaRequired: false',
                'version: 1.0.0',
                '---'
            ].join( '\n' )
        )
        const result = QuestionBuilder.build( { rootDir: badDir, outFile } )
        rmSync( badDir, { recursive: true, force: true } )
        expect( result.status ).toBe( false )
        const hasAreaEnum = result.struct.messages
            .some( ( m ) => m.includes( 'AREA-ENUM' ) )
        expect( hasAreaEnum ).toBe( true )
    } )

    test( 'fails on weight-sum < 0.95', () => {
        const badDir = mkdtempSync( join( tmpdir(), 'qb-bad-' ) )
        mkdirSync( join( badDir, 'deterministic' ), { recursive: true } )
        writeFileSync(
            join( badDir, 'deterministic', '01-low.md' ),
            [
                '---',
                'id: Q-single-test-01',
                'area: single-test',
                'dimension: docsUrlReachable',
                'question: "Q"',
                'scoreType: boolean',
                'weight: 0.5',
                'determinism: deterministic',
                'tier: P1',
                'filesToRead:',
                '  - "{{schemaPath}}"',
                'preInstructionRef: x',
                'evaluatorTask: "T"',
                'outputSchemaRef: y',
                'personaRequired: false',
                'version: 1.0.0',
                '---'
            ].join( '\n' )
        )
        const result = QuestionBuilder.build( { rootDir: badDir, outFile } )
        rmSync( badDir, { recursive: true, force: true } )
        expect( result.status ).toBe( false )
        const hasWeightSum = result.struct.messages
            .some( ( m ) => m.includes( 'WEIGHT-SUM' ) )
        expect( hasWeightSum ).toBe( true )
    } )

    test( 'fails on persona mismatch (single-test with personaRequired=true)', () => {
        const badDir = mkdtempSync( join( tmpdir(), 'qb-bad-' ) )
        mkdirSync( join( badDir, 'non-deterministic' ), { recursive: true } )
        writeFileSync(
            join( badDir, 'non-deterministic', '01-persona-mismatch.md' ),
            [
                '---',
                'id: Q-single-test-01',
                'area: single-test',
                'dimension: descriptionClarity',
                'question: "Q"',
                'scoreType: scale-1-5',
                'weight: 1.0',
                'determinism: non-deterministic',
                'tier: P1',
                'filesToRead:',
                '  - "{{schemaPath}}"',
                'preInstructionRef: x',
                'evaluatorTask: "T"',
                'outputSchemaRef: y',
                'personaRequired: true',
                'version: 1.0.0',
                '---'
            ].join( '\n' )
        )
        const result = QuestionBuilder.build( { rootDir: badDir, outFile } )
        rmSync( badDir, { recursive: true, force: true } )
        expect( result.status ).toBe( false )
        const hasPersonaMismatch = result.struct.messages
            .some( ( m ) => m.includes( 'PERSONA-MISMATCH' ) )
        expect( hasPersonaMismatch ).toBe( true )
    } )
} )


describe( 'QuestionBuilder.build (naming-convention enforcement)', () => {
    let tmpDir
    let outFile

    beforeEach( () => {
        tmpDir = mkdtempSync( join( tmpdir(), 'qb-' ) )
        outFile = join( tmpDir, 'questions.json' )
    } )

    afterEach( () => {
        rmSync( tmpDir, { recursive: true, force: true } )
    } )

    function validFrontmatter( { determinism } ) {
        return [
            '---',
            'id: Q-single-test-01',
            'area: single-test',
            'dimension: docsUrlReachable',
            'question: "Q"',
            'scoreType: boolean',
            'weight: 1.0',
            `determinism: ${determinism}`,
            'tier: P1',
            'filesToRead:',
            '  - "{{schemaPath}}"',
            'preInstructionRef: x',
            'evaluatorTask: "T"',
            'outputSchemaRef: y',
            'personaRequired: false',
            'version: 1.0.0',
            '---'
        ].join( '\n' )
    }

    test( 'fails on filename not matching the regex', () => {
        const badDir = mkdtempSync( join( tmpdir(), 'qb-fn-' ) )
        mkdirSync( join( badDir, 'deterministic' ), { recursive: true } )
        writeFileSync(
            join( badDir, 'deterministic', 'BadName.md' ),
            validFrontmatter( { determinism: 'deterministic' } )
        )
        const result = QuestionBuilder.build( { rootDir: badDir, outFile } )
        rmSync( badDir, { recursive: true, force: true } )
        expect( result.status ).toBe( false )
        const hasFilenamePattern = result.struct.messages
            .some( ( m ) => m.includes( 'FILENAME-PATTERN' ) )
        expect( hasFilenamePattern ).toBe( true )
    } )

    test( 'fails when folder does not match determinism field', () => {
        const badDir = mkdtempSync( join( tmpdir(), 'qb-fd-' ) )
        mkdirSync( join( badDir, 'deterministic' ), { recursive: true } )
        writeFileSync(
            join( badDir, 'deterministic', '01-wrong.md' ),
            validFrontmatter( { determinism: 'non-deterministic' } )
        )
        const result = QuestionBuilder.build( { rootDir: badDir, outFile } )
        rmSync( badDir, { recursive: true, force: true } )
        expect( result.status ).toBe( false )
        const hasMismatch = result.struct.messages
            .some( ( m ) => m.includes( 'FOLDER-DETERMINISM-MISMATCH' ) )
        expect( hasMismatch ).toBe( true )
    } )

    test( 'does not emit the internal _folder field', () => {
        const okDir = mkdtempSync( join( tmpdir(), 'qb-ok-' ) )
        mkdirSync( join( okDir, 'deterministic' ), { recursive: true } )
        writeFileSync(
            join( okDir, 'deterministic', '01-ok.md' ),
            validFrontmatter( { determinism: 'deterministic' } )
        )
        const result = QuestionBuilder.build( { rootDir: okDir, outFile } )
        rmSync( okDir, { recursive: true, force: true } )
        expect( result.status ).toBe( true )
        const payload = JSON.parse( readFileSync( outFile, 'utf8' ) )
        expect( payload.questions[ 0 ]._folder ).toBeUndefined()
        expect( payload.questions[ 0 ]._sourcePath ).toBe( 'deterministic/01-ok.md' )
    } )
} )


describe( 'QuestionBuilder.build (production catalog)', () => {
    let tmpDir
    let outFile

    beforeEach( () => {
        tmpDir = mkdtempSync( join( tmpdir(), 'qb-prod-' ) )
        outFile = join( tmpDir, 'questions.json' )
    } )

    afterEach( () => {
        rmSync( tmpDir, { recursive: true, force: true } )
    } )

    test( 'production catalog (60 questions) builds without messages', () => {
        const result = QuestionBuilder.build( { rootDir: 'prompts/questions', outFile } )
        expect( result.struct.messages ).toEqual( [] )
        expect( result.status ).toBe( true )
        expect( result.struct.questions.length ).toBe( 60 )
    } )
} )
