import { describe, test, expect } from '@jest/globals'

import { PartialGrading } from '../../src/Phases/PartialGrading.mjs'


const baseFullEntry = ( { aggregateGrade } ) => {
    return {
        schemaId: 'demo.foo',
        selectionId: null,
        schemaVersion: '1.0.0',
        schemaHash: 'a1b2c3d4',
        gradingMode: 'full',
        gradingTier: 'autonomous',
        grader: { kind: 'script', name: 'unit', version: '0.0.1' },
        gradings: [],
        aggregateGrade: aggregateGrade === undefined ? 'A' : aggregateGrade,
        maxAttainableGrade: 'B',
        options: {}
    }
}


describe( 'PartialGrading.buildPartialEntry', () => {
    test( 'happy path: copies aggregateGrade + sets inheritedFrom', () => {
        const base = baseFullEntry( { aggregateGrade: 'A' } )
        const result = PartialGrading.buildPartialEntry( {
            baseEntry: base,
            dimensions: [ 'descriptionNeutrality' ],
            newGradings: [ { dimension: 'descriptionNeutrality', score: 'pass', determinism: 'non-deterministic' } ],
            grader: base.grader,
            schemaHash: 'a1b2c3d4',
            schemaVersion: '1.0.0'
        } )
        expect( result.errors ).toEqual( [] )
        expect( result.entry.gradingMode ).toBe( 'partial' )
        expect( result.entry.aggregateGrade ).toBe( 'A' )
        expect( result.entry.inheritedFrom ).toBe( 'demo.foo@a1b2c3d4' )
        expect( result.entry.gradings.length ).toBe( 1 )
    } )

    test( 'newGrading with dimension not in dimensions[] yields PRT-002', () => {
        const base = baseFullEntry( {} )
        const result = PartialGrading.buildPartialEntry( {
            baseEntry: base,
            dimensions: [ 'descriptionNeutrality' ],
            newGradings: [ { dimension: 'apiAvailability', score: 'pass', determinism: 'deterministic' } ],
            grader: base.grader,
            schemaHash: 'a1b2c3d4',
            schemaVersion: '1.0.0'
        } )
        expect( result.errors[ 0 ] ).toContain( 'PRT-002' )
    } )

    test( 'empty gradings yields PRT-WARN-001 warning but entry is built', () => {
        const base = baseFullEntry( {} )
        const result = PartialGrading.buildPartialEntry( {
            baseEntry: base,
            dimensions: [],
            newGradings: [],
            grader: base.grader,
            schemaHash: 'a1b2c3d4',
            schemaVersion: '1.0.0'
        } )
        expect( result.entry ).not.toBeNull()
        expect( result.errors[ 0 ] ).toContain( 'PRT-WARN-001' )
    } )

    test( 'missing baseEntry yields PRT-001', () => {
        const result = PartialGrading.buildPartialEntry( {
            dimensions: [], newGradings: [], grader: {}, schemaHash: 'x', schemaVersion: 'x'
        } )
        expect( result.errors[ 0 ] ).toContain( 'PRT-001' )
    } )
} )


describe( 'PartialGrading.validateSequence', () => {
    test( 'empty list is valid', () => {
        const r = PartialGrading.validateSequence( { gradingFiles: [] } )
        expect( r.valid ).toBe( true )
        expect( r.violations ).toEqual( [] )
    } )

    test( 'first entry partial → first-must-be-full violation', () => {
        const r = PartialGrading.validateSequence( {
            gradingFiles: [ { gradingMode: 'partial', aggregateGrade: 'A' } ]
        } )
        expect( r.valid ).toBe( false )
        expect( r.violations[ 0 ].rule ).toBe( 'first-must-be-full' )
    } )

    test( 'partial changes aggregateGrade → partial-must-not-change-aggregate', () => {
        const r = PartialGrading.validateSequence( {
            gradingFiles: [
                { gradingMode: 'full', aggregateGrade: 'A' },
                { gradingMode: 'partial', aggregateGrade: 'B' }
            ]
        } )
        expect( r.valid ).toBe( false )
        expect( r.violations[ 0 ].rule ).toBe( 'partial-must-not-change-aggregate' )
    } )

    test( 'full-partial-full sequence is valid', () => {
        const r = PartialGrading.validateSequence( {
            gradingFiles: [
                { gradingMode: 'full', aggregateGrade: 'A' },
                { gradingMode: 'partial', aggregateGrade: 'A' },
                { gradingMode: 'full', aggregateGrade: 'A' }
            ]
        } )
        expect( r.valid ).toBe( true )
    } )

    test( 'full-full sequence with aggregate change is valid', () => {
        const r = PartialGrading.validateSequence( {
            gradingFiles: [
                { gradingMode: 'full', aggregateGrade: 'A' },
                { gradingMode: 'full', aggregateGrade: 'B' }
            ]
        } )
        expect( r.valid ).toBe( true )
    } )

    test( 'invalid mode value detected', () => {
        const r = PartialGrading.validateSequence( {
            gradingFiles: [ { gradingMode: 'wrong', aggregateGrade: 'A' } ]
        } )
        const hasInvalidMode = r.violations.some( ( v ) => v.rule === 'invalid-mode' )
        expect( hasInvalidMode ).toBe( true )
    } )

    test( 'missing gradingFiles yields PRT-001', () => {
        const r = PartialGrading.validateSequence( {} )
        expect( r.errors[ 0 ] ).toContain( 'PRT-001' )
    } )
} )


describe( 'PartialGrading.listGradedDimensions', () => {
    test( 'returns dimension names from gradings[]', () => {
        const entry = {
            gradings: [
                { dimension: 'apiAvailability' },
                { dimension: 'descriptionNeutrality' }
            ]
        }
        const r = PartialGrading.listGradedDimensions( { entry } )
        expect( r.dimensions ).toEqual( [ 'apiAvailability', 'descriptionNeutrality' ] )
    } )

    test( 'missing entry yields PRT-001', () => {
        const r = PartialGrading.listGradedDimensions( {} )
        expect( r.errors[ 0 ] ).toContain( 'PRT-001' )
    } )
} )
