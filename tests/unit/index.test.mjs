import { describe, test, expect } from '@jest/globals'

import * as api from '../../src/index.mjs'


describe( 'Public API exports', () => {
    test( 'has at least 10 named exports', () => {
        const keys = Object.keys( api )
        expect( keys.length ).toBeGreaterThanOrEqual( 10 )
    } )

    test( 'exports all class identifiers', () => {
        const expected = [ 'Grading', 'Scoring', 'Veto', 'SingleSchemaPhases', 'SelectionPhases', 'ErrorCodes' ]
        const keys = Object.keys( api )
        const missing = expected
            .filter( ( k ) => !keys.includes( k ) )
        expect( missing ).toEqual( [] )
    } )

    test( 'exports all convenience functions', () => {
        const expected = [ 'gradeSingleSchema', 'gradeSelection', 'validateGradingEntry', 'getVersion' ]
        const keys = Object.keys( api )
        const missing = expected
            .filter( ( k ) => !keys.includes( k ) )
        expect( missing ).toEqual( [] )
    } )

    test( 'exports PromptBuilder on the public surface (G9)', () => {
        expect( Object.keys( api ) ).toContain( 'PromptBuilder' )
        expect( typeof api.PromptBuilder.build ).toBe( 'function' )
        expect( typeof api.PromptBuilder.buildGoalBlock ).toBe( 'function' )
        expect( typeof api.PromptBuilder.getValidAreas ).toBe( 'function' )
    } )

    test( 'exports GradingImport and GradingExport (IN/OUT round-trip)', () => {
        const keys = Object.keys( api )
        expect( keys ).toContain( 'GradingImport' )
        expect( keys ).toContain( 'GradingExport' )
        expect( typeof api.GradingImport.run ).toBe( 'function' )
        expect( typeof api.GradingExport.run ).toBe( 'function' )
    } )

    test( 'SelectionLockfile is NOT exported (lifecycle dropped in v2)', () => {
        expect( Object.keys( api ) ).not.toContain( 'SelectionLockfile' )
    } )

    test( 'validateOverride salvage + OVERRIDE_WHITELIST stay reachable', () => {
        const keys = Object.keys( api )
        expect( keys ).toContain( 'validateOverride' )
        expect( keys ).toContain( 'OVERRIDE_WHITELIST' )
        expect( typeof api.validateOverride ).toBe( 'function' )
        const r = api.validateOverride( { override: { name: 'x' } } )
        expect( r.valid ).toBe( true )
    } )
} )


describe( 'getVersion', () => {
    test( 'returns scoringSystem, gradingSystem, repoVersion', () => {
        const result = api.getVersion()
        expect( result.scoringSystem ).toBe( 'scoringSystem/1.0.0' )
        expect( result.gradingSystem ).toBe( 'gradingSystem/1.0.0' )
        expect( typeof result.repoVersion ).toBe( 'string' )
    } )
} )


describe( 'gradeSingleSchema', () => {
    test( 'returns grading object on happy path', () => {
        const result = api.gradeSingleSchema( {
            schemaPath: '/tmp/demo.mjs',
            schemaId: 'demo',
            grader: { kind: 'script', name: 'unit', version: '0.0.1' },
            options: {}
        } )
        expect( result.grading ).not.toBeNull()
        expect( result.grading.gradingTier ).toBe( 'autonomous' )
    } )

    test( 'missing field yields GRD-001', () => {
        const result = api.gradeSingleSchema( {
            schemaId: 'demo',
            grader: { kind: 'script', name: 'u', version: '0.0.1' }
        } )
        expect( result.grading ).toBeNull()
        expect( result.errors[ 0 ] ).toContain( 'GRD-001' )
    } )
} )


describe( 'gradeSelection (async, real S1/S3/S4 chain — no stub)', () => {
    test( 'returns grading object on happy path', async () => {
        const result = await api.gradeSelection( {
            selectionId: 'sel-1',
            schemaIds: [ 'test.a', 'test.b' ],
            grader: { kind: 'script', name: 'unit', version: '0.0.1' },
            options: { gradingDataRoot: '/tmp/does-not-exist-island' }
        } )
        expect( result.grading ).not.toBeNull()
        expect( result.grading.gradingTier ).toBe( 'group-bound' )
    } )

    test( 'runs the real phase chain — no runAllStub marker present', async () => {
        const result = await api.gradeSelection( {
            selectionId: 'sel-1',
            schemaIds: [ 'test.a' ],
            grader: { kind: 'script', name: 'unit', version: '0.0.1' },
            options: { gradingDataRoot: '/tmp/does-not-exist-island' }
        } )
        // The stub used to set grading.stub === true and a `todo` field.
        expect( result.grading.stub ).toBeUndefined()
        expect( result.grading.todo ).toBeUndefined()
        // The real chain reports the executed phases S1/S3/S4.
        const phaseNames = result.grading.phases.map( ( p ) => p.phase )
        expect( phaseNames ).toEqual( [ 'S1', 'S3', 'S4' ] )
    } )

    test( 'missing schemaIds yields GRD-001', async () => {
        const result = await api.gradeSelection( {
            selectionId: 'sel-1',
            grader: { kind: 'script', name: 'u', version: '0.0.1' }
        } )
        expect( result.grading ).toBeNull()
        const hasErr = result.errors.some( ( e ) => e.includes( 'GRD-001' ) )
        expect( hasErr ).toBe( true )
    } )
} )


describe( 'validateGradingEntry', () => {
    test( 'valid entry passes', () => {
        const entry = {
            schemaId: 'demo',
            gradingTier: 'autonomous',
            gradings: []
        }
        const result = api.validateGradingEntry( { entry } )
        expect( result.valid ).toBe( true )
    } )

    test( 'invalid tier rejected with GRD-003', () => {
        const entry = {
            schemaId: 'demo',
            gradingTier: 'wrong',
            gradings: []
        }
        const result = api.validateGradingEntry( { entry } )
        expect( result.valid ).toBe( false )
        expect( result.errors[ 0 ] ).toContain( 'GRD-003' )
    } )
} )
