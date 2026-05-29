import { describe, test, expect } from '@jest/globals'

import { Scoring } from '../../src/Scoring.mjs'
import { sampleGrading } from '../helpers/fixtures.mjs'


describe( 'Scoring.getVersion', () => {
    test( 'returns scoringSystem/1.0.0', () => {
        const result = Scoring.getVersion()
        expect( result.version ).toBe( 'scoringSystem/1.0.0' )
    } )
} )


describe( 'Scoring.scoreDimension', () => {
    test( 'happy path returns object with stub flag', () => {
        const result = Scoring.scoreDimension( {
            dimension: 'apiAvailability',
            rawValue: { httpStatus: 200 },
            determinism: 'deterministic'
        } )
        expect( result ).toBeDefined()
        expect( result.stub ).toBe( true )
        expect( result.errors ).toEqual( [] )
    } )

    test( 'missing dimension yields GRD-001', () => {
        const result = Scoring.scoreDimension( {
            rawValue: 1,
            determinism: 'deterministic'
        } )
        expect( result.errors[ 0 ] ).toContain( 'GRD-001' )
    } )

    test( 'unknown dimension yields SCO-002', () => {
        const result = Scoring.scoreDimension( {
            dimension: 'notADimension',
            rawValue: 1,
            determinism: 'deterministic'
        } )
        expect( result.errors[ 0 ] ).toContain( 'SCO-002' )
    } )
} )


describe( 'Scoring.validateScore', () => {
    test( 'numeric 3.5 is valid', () => {
        const result = Scoring.validateScore( { score: 3.5 } )
        expect( result.valid ).toBe( true )
    } )

    test( 'numeric 6.0 is out of range (SCO-001)', () => {
        const result = Scoring.validateScore( { score: 6.0 } )
        expect( result.valid ).toBe( false )
        expect( result.errors[ 0 ] ).toContain( 'SCO-001' )
    } )

    test( 'enum pass is valid', () => {
        const result = Scoring.validateScore( { score: 'pass' } )
        expect( result.valid ).toBe( true )
    } )

    test( 'invalid enum (SCO-003)', () => {
        const result = Scoring.validateScore( { score: 'invalid' } )
        expect( result.valid ).toBe( false )
        expect( result.errors[ 0 ] ).toContain( 'SCO-003' )
    } )
} )


describe( 'Scoring.computeWeightedSum', () => {
    test( 'happy path with two numeric scores', () => {
        const gradings = [
            sampleGrading( { score: 4.0, dimension: 'apiAvailability', weight: 1.0 } ),
            sampleGrading( { score: 5.0, dimension: 'apiResponseValid', weight: 2.0 } )
        ]
        const result = Scoring.computeWeightedSum( { gradings } )
        expect( result.weightSum ).toBeCloseTo( 3.0 )
        expect( result.sum ).toBeCloseTo( 14.0 )
        expect( result.normalizedScore ).toBeCloseTo( 14.0 / 3.0 )
    } )

    test( 'n/a entries are ignored (Memo Z. 309)', () => {
        const gradings = [
            sampleGrading( { score: 4.0, dimension: 'apiAvailability', weight: 1.0 } ),
            sampleGrading( { score: 'n/a', dimension: 'tosCompliance', weight: 1.0 } )
        ]
        const result = Scoring.computeWeightedSum( { gradings } )
        expect( result.weightSum ).toBeCloseTo( 1.0 )
        expect( result.normalizedScore ).toBeCloseTo( 4.0 )
    } )

    test( 'stale entries emit SCO-WARN-001', () => {
        const gradings = [
            sampleGrading( { score: 4.0, dimension: 'apiAvailability', weight: 1.0 } ),
            sampleGrading( { score: 'stale', dimension: 'tosCompliance', weight: 1.0 } )
        ]
        const result = Scoring.computeWeightedSum( { gradings } )
        const hasWarn = result.errors.some( ( e ) => e.includes( 'SCO-WARN-001' ) )
        expect( hasWarn ).toBe( true )
    } )

    test( 'missing gradings yields GRD-001', () => {
        const result = Scoring.computeWeightedSum( {} )
        expect( result.errors[ 0 ] ).toContain( 'GRD-001' )
    } )

    test( 'invalid weight yields SCO-004', () => {
        const gradings = [
            { dimension: 'apiAvailability', score: 4.0, weight: -1.0 }
        ]
        const result = Scoring.computeWeightedSum( { gradings } )
        const hasErr = result.errors.some( ( e ) => e.includes( 'SCO-004' ) )
        expect( hasErr ).toBe( true )
    } )
} )
