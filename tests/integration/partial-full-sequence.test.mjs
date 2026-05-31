/**
 * Integration test: Full → Partial → Full sequence,
 * StablePromotion across the sequence.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PartialGrading } from '../../src/Phases/PartialGrading.mjs'
import { StablePromotion } from '../../src/StablePromotion.mjs'


let tempRoot = null


beforeAll( async () => {
    tempRoot = await mkdtemp( join( tmpdir(), 'partial-full-' ) )
} )


afterAll( async () => {
    if( tempRoot !== null ) {
        await rm( tempRoot, { recursive: true, force: true } )
    }
} )


describe( 'Full → Partial → Full sequence', () => {
    test( 'last full + A grade + valid sequence → stable', async () => {
        const sequence = [
            { gradingMode: 'full', aggregateGrade: 'A', schemaVersion: '1.0.0', schemaHash: 'a1b2c3d4', path: 'g1.json' },
            { gradingMode: 'partial', aggregateGrade: 'A', schemaVersion: '1.0.0', schemaHash: 'a1b2c3d4', path: 'g2.json' },
            { gradingMode: 'full', aggregateGrade: 'A', schemaVersion: '1.0.0', schemaHash: 'a1b2c3d4', path: 'g3.json' }
        ]

        const validation = PartialGrading.validateSequence( { gradingFiles: sequence } )
        expect( validation.valid ).toBe( true )

        const root = join( tempRoot, 's1' )
        const promotion = await StablePromotion.promoteIfEligible( {
            gradingDataRoot: root,
            namespaceTool: 'demo--foo',
            gradingFiles: sequence,
            threshold: 'A'
        } )
        expect( promotion.status ).toBe( 'stable' )

        const ps = JSON.parse( await readFile( promotion.path, 'utf-8' ) )
        expect( ps.gradingStatus ).toBe( 'stable' )
        expect( ps.lastGradingMode ).toBe( 'full' )
    } )

    test( 'last partial → not stable, maps to 5-status graded (last-not-full)', async () => {
        const sequence = [
            { gradingMode: 'full', aggregateGrade: 'A', schemaVersion: '1.0.0', schemaHash: 'a1b2c3d4', path: 'g1.json' },
            { gradingMode: 'partial', aggregateGrade: 'A', schemaVersion: '1.0.0', schemaHash: 'a1b2c3d4', path: 'g2.json' }
        ]

        const root = join( tempRoot, 's2' )
        const promotion = await StablePromotion.promoteIfEligible( {
            gradingDataRoot: root,
            namespaceTool: 'demo--bar',
            gradingFiles: sequence,
            threshold: 'A'
        } )
        // v2 5-status: a full grade exists but the latest is partial → graded, not stable.
        expect( promotion.status ).toBe( 'graded' )
    } )

    test( 'last full grade B threshold A → not stable, maps to graded (below-threshold)', async () => {
        const sequence = [
            { gradingMode: 'full', aggregateGrade: 'B', schemaVersion: '1.0.0', schemaHash: 'a1b2c3d4', path: 'g1.json' }
        ]

        const root = join( tempRoot, 's3' )
        const promotion = await StablePromotion.promoteIfEligible( {
            gradingDataRoot: root,
            namespaceTool: 'demo--baz',
            gradingFiles: sequence,
            threshold: 'A'
        } )
        // v2 5-status: a grade exists (B) but below threshold A → graded.
        expect( promotion.status ).toBe( 'graded' )
    } )
} )
