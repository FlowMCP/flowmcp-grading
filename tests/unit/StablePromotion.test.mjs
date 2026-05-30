import { describe, test, expect, beforeAll, afterAll } from '@jest/globals'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { StablePromotion } from '../../src/StablePromotion.mjs'


let tempRoot = null


beforeAll( async () => {
    tempRoot = await mkdtemp( join( tmpdir(), 'stablepromotion-' ) )
} )


afterAll( async () => {
    if( tempRoot !== null ) {
        await rm( tempRoot, { recursive: true, force: true } )
    }
} )


describe( 'StablePromotion.checkEligibility', () => {
    test( 'empty gradingFiles → reason: no-gradings', () => {
        const r = StablePromotion.checkEligibility( { gradingFiles: [], threshold: 'A' } )
        expect( r.eligible ).toBe( false )
        expect( r.reason ).toBe( 'no-gradings' )
    } )

    test( 'last is partial → last-not-full', () => {
        const r = StablePromotion.checkEligibility( {
            gradingFiles: [
                { gradingMode: 'full', aggregateGrade: 'A' },
                { gradingMode: 'partial', aggregateGrade: 'A' }
            ],
            threshold: 'A'
        } )
        expect( r.eligible ).toBe( false )
        expect( r.reason ).toBe( 'last-not-full' )
    } )

    test( 'last full with grade C and threshold A → below-threshold', () => {
        const r = StablePromotion.checkEligibility( {
            gradingFiles: [ { gradingMode: 'full', aggregateGrade: 'C' } ],
            threshold: 'A'
        } )
        expect( r.eligible ).toBe( false )
        expect( r.reason ).toBe( 'below-threshold' )
    } )

    test( 'last full with grade A and threshold A → eligible', () => {
        const r = StablePromotion.checkEligibility( {
            gradingFiles: [ { gradingMode: 'full', aggregateGrade: 'A' } ],
            threshold: 'A'
        } )
        expect( r.eligible ).toBe( true )
    } )

    test( 'threshold B with grade B → eligible', () => {
        const r = StablePromotion.checkEligibility( {
            gradingFiles: [ { gradingMode: 'full', aggregateGrade: 'B' } ],
            threshold: 'B'
        } )
        expect( r.eligible ).toBe( true )
    } )

    test( 'invalid sequence → sequence-invalid', () => {
        const r = StablePromotion.checkEligibility( {
            gradingFiles: [
                { gradingMode: 'partial', aggregateGrade: 'A' },
                { gradingMode: 'full', aggregateGrade: 'A' }
            ],
            threshold: 'A'
        } )
        expect( r.eligible ).toBe( false )
        expect( r.reason ).toBe( 'sequence-invalid' )
    } )

    test( 'invalid threshold yields STB-003', () => {
        const r = StablePromotion.checkEligibility( {
            gradingFiles: [ { gradingMode: 'full', aggregateGrade: 'A' } ],
            threshold: 'Z'
        } )
        expect( r.errors[ 0 ] ).toContain( 'STB-003' )
    } )
} )


describe( 'StablePromotion.promoteIfEligible', () => {
    test( 'writes phase-status with status stable on success', async () => {
        const root = join( tempRoot, 'promote-1' )
        const result = await StablePromotion.promoteIfEligible( {
            gradingDataRoot: root,
            namespaceTool: 'demo--foo',
            gradingFiles: [ {
                gradingMode: 'full',
                aggregateGrade: 'A',
                schemaVersion: '1.0.0',
                schemaHash: 'a1b2c3d4'
            } ],
            threshold: 'A'
        } )
        expect( result.written ).toBe( true )
        expect( result.status ).toBe( 'stable' )
        const path = join( root, 'phase-status', 'single', 'demo--foo.json' )
        const raw = await readFile( path, 'utf-8' )
        const ps = JSON.parse( raw )
        expect( ps.gradingStatus ).toBe( 'stable' )
        expect( ps.threshold ).toBe( 'A' )
    } )

    test( 'writes pending when last partial', async () => {
        const root = join( tempRoot, 'promote-2' )
        const result = await StablePromotion.promoteIfEligible( {
            gradingDataRoot: root,
            namespaceTool: 'demo--bar',
            gradingFiles: [ {
                gradingMode: 'partial',
                aggregateGrade: 'A',
                schemaVersion: '1.0.0',
                schemaHash: 'a1b2c3d4'
            } ],
            threshold: 'A'
        } )
        expect( result.status ).toBe( 'pending' )
    } )

    test( 'idempotent: phase-status payload is deterministic per input', async () => {
        const root = join( tempRoot, 'promote-3' )
        const args = {
            gradingDataRoot: root,
            namespaceTool: 'demo--baz',
            gradingFiles: [ { gradingMode: 'full', aggregateGrade: 'A', schemaVersion: '1.0.0', schemaHash: 'a1b2c3d4' } ],
            threshold: 'A'
        }
        const a = await StablePromotion.promoteIfEligible( args )
        const b = await StablePromotion.promoteIfEligible( args )

        const rawA = JSON.parse( await readFile( a.path, 'utf-8' ) )
        const rawB = JSON.parse( await readFile( b.path, 'utf-8' ) )
        expect( rawA.gradingStatus ).toBe( rawB.gradingStatus )
        expect( rawA.threshold ).toBe( rawB.threshold )
    } )

    test( 'default threshold reported as A', () => {
        const r = StablePromotion.getDefaultThreshold()
        expect( r.threshold ).toBe( 'A' )
    } )
} )
