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


describe( 'gradeSelection', () => {
    test( 'returns grading object on happy path', () => {
        const result = api.gradeSelection( {
            selectionId: 'sel-1',
            schemaIds: [ 'a', 'b' ],
            grader: { kind: 'script', name: 'unit', version: '0.0.1' },
            options: {}
        } )
        expect( result.grading ).not.toBeNull()
        expect( result.grading.gradingTier ).toBe( 'group-bound' )
    } )

    test( 'missing schemaIds yields GRD-001', () => {
        const result = api.gradeSelection( {
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
