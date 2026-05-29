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
