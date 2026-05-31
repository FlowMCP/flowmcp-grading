import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Grading } from '../../src/Grading.mjs'
import { RebuildIndex } from '../../src/RebuildIndex.mjs'


// The answer-envelope -> letter-grade bridge (gradingSystem/1.0.0).
// computeWeightedSum maps pass=5/fail=1/numbers as-is, then #trimByTier bands the
// 1.0-5.0 mean to a letter and caps it at the tier maximum.

describe( 'Grading.computeAggregateGrade — score-to-grade thresholds', () => {
    const answers = ( scores ) => scores.map( ( s, i ) => ( { questionId: `Q-0${i}`, score: s, reasoning: 'r' } ) )

    test( 'all top scores -> A on group-bound (no stub flag)', () => {
        const out = Grading.computeAggregateGrade( { entry: { gradings: answers( [ 5, 5, 5, 5 ] ), gradingTier: 'group-bound', categoricalVeto: null } } )
        expect( out.aggregateGrade ).toBe( 'A' )
        expect( out.stub ).toBeUndefined()
        expect( out.normalizedScore ).toBeCloseTo( 5.0 )
    } )

    test( 'mid scores -> C', () => {
        const out = Grading.computeAggregateGrade( { entry: { gradings: answers( [ 3, 3, 2, 3 ] ), gradingTier: 'group-bound', categoricalVeto: null } } )
        // mean = 2.75 -> band C (>=2.5)
        expect( out.aggregateGrade ).toBe( 'C' )
    } )

    test( 'tier trim: autonomous caps an A-worthy score at B', () => {
        const out = Grading.computeAggregateGrade( { entry: { gradings: answers( [ 5, 5, 5, 5 ] ), gradingTier: 'autonomous', categoricalVeto: null } } )
        expect( out.rawGrade ).toBe( 'A' )
        expect( out.aggregateGrade ).toBe( 'B' )
    } )

    test( 'all n/a -> null grade (pending, not an error, not stub)', () => {
        const out = Grading.computeAggregateGrade( { entry: { gradings: answers( [ 'n/a', 'n/a' ] ), gradingTier: 'autonomous', categoricalVeto: null } } )
        expect( out.aggregateGrade ).toBeNull()
        expect( out.stub ).toBeUndefined()
    } )

    test( 'pass/fail enums map and aggregate', () => {
        const out = Grading.computeAggregateGrade( { entry: { gradings: answers( [ 'pass', 'pass', 'fail' ] ), gradingTier: 'group-bound', categoricalVeto: null } } )
        // (5+5+1)/3 = 3.67 -> B
        expect( out.aggregateGrade ).toBe( 'B' )
    } )
} )


describe( 'RebuildIndex — answer-envelope rolls up to a graded node', () => {
    let root = null

    beforeEach( async () => {
        root = await mkdtemp( join( tmpdir(), 'grade-bridge-' ) )
    } )
    afterEach( async () => {
        if( root !== null ) { await rm( root, { recursive: true, force: true } ) }
    } )

    const writeEnvelope = async ( { dir, area, scores } ) => {
        await mkdir( dir, { recursive: true } )
        const envelope = {
            gradingId: 'g-1',
            area,
            persona: null,
            timestamp: '2026-05-31T01-10-00Z',
            answers: scores.map( ( s, i ) => ( { questionId: `Q-0${i}`, score: s, reasoning: 'r' } ) )
        }
        await writeFile( join( dir, `${area}--2026-05-31T01-10-00Z.json` ), JSON.stringify( envelope, null, 4 ), 'utf-8' )
    }

    test( 'single-test envelope with strong scores -> graded B (autonomous cap)', async () => {
        const nsDir = join( root, 'providers', 'demo' )
        const toolGradings = join( nsDir, 'sample', 'tools', 'getThing', '_gradings' )
        await writeEnvelope( { dir: toolGradings, area: 'single-test', scores: [ 5, 5, 5, 4, 5 ] } )

        const rebuilt = await RebuildIndex.rebuildNamespaceIndex( { namespaceDir: nsDir } )
        expect( rebuilt.status ).toBe( true )
        const tool = rebuilt.index.schemas.sample.tools.getThing
        expect( tool.status ).toBe( 'graded' )
        expect( tool.grade ).toBe( 'B' )
    } )

    test( 'weak scores -> a genuinely lower grade (real computation, not always tier-max)', async () => {
        const nsDir = join( root, 'providers', 'demo' )
        const toolGradings = join( nsDir, 'sample', 'tools', 'getThing', '_gradings' )
        // mean = (2+2+1+2+2)/5 = 1.8 -> band D (>=1.5), autonomous cap is B so D stays D
        await writeEnvelope( { dir: toolGradings, area: 'single-test', scores: [ 2, 2, 1, 2, 2 ] } )

        const rebuilt = await RebuildIndex.rebuildNamespaceIndex( { namespaceDir: nsDir } )
        const tool = rebuilt.index.schemas.sample.tools.getThing
        expect( tool.status ).toBe( 'graded' )
        expect( tool.grade ).toBe( 'D' )
    } )

    test( 'all-n/a single-test envelope -> pending (no scorable answers, no fake grade)', async () => {
        const nsDir = join( root, 'providers', 'demo' )
        const toolGradings = join( nsDir, 'sample', 'tools', 'getThing', '_gradings' )
        await writeEnvelope( { dir: toolGradings, area: 'single-test', scores: [ 'n/a', 'n/a' ] } )

        const rebuilt = await RebuildIndex.rebuildNamespaceIndex( { namespaceDir: nsDir } )
        const tool = rebuilt.index.schemas.sample.tools.getThing
        expect( tool.status ).toBe( 'pending' )
        expect( tool.reason ).toBe( 'no scorable answers' )
    } )
} )
