import { describe, test, expect, beforeAll, afterAll } from '@jest/globals'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SelectionPhases } from '../../src/Phases/Selection.mjs'
import { HashGenerator } from '../../src/HashGenerator.mjs'


let tempRoot = null

const baseEntry = () => {
    return {
        schemaId: 'selection:demo',
        selectionId: 'demo',
        gradingTier: 'group-bound',
        grader: { kind: 'script', name: 'unit', version: '0.0.1' },
        gradings: [],
        categoricalVeto: null,
        aggregateGrade: null,
        maxAttainableGrade: 'A',
        previousGradingId: null,
        options: {}
    }
}


const seedPhaseStatus = async ( { schemaId } ) => {
    const ns = schemaId.replace( /\./g, '--' )
    const dir = join( tempRoot, 'phase-status', 'single' )
    await mkdir( dir, { recursive: true } )
    await writeFile( join( dir, `${ns}.json` ), JSON.stringify( { schemaHash: 'aaaaaaaa' } ), 'utf-8' )
}


beforeAll( async () => {
    tempRoot = await mkdtemp( join( tmpdir(), 'sel-phases-' ) )
} )


afterAll( async () => {
    if( tempRoot !== null ) {
        await rm( tempRoot, { recursive: true, force: true } )
    }
} )


describe( 'SelectionPhases.runS1 (Member-Coverage)', () => {
    test( 'all members resolved → no errors', async () => {
        await seedPhaseStatus( { schemaId: 'ns.a' } )
        await seedPhaseStatus( { schemaId: 'ns.b' } )
        const selectionJson = { members: [ { schemaId: 'ns.a' }, { schemaId: 'ns.b' } ] }
        const r = await SelectionPhases.runS1( {
            entry: baseEntry(), selectionId: 'demo', selectionJson, gradingDataRoot: tempRoot
        } )
        expect( r.errors ).toEqual( [] )
    } )

    test( 'duplicate member → SEL-S1', async () => {
        await seedPhaseStatus( { schemaId: 'ns.a' } )
        const selectionJson = { members: [ { schemaId: 'ns.a' }, { schemaId: 'ns.a' } ] }
        const r = await SelectionPhases.runS1( {
            entry: baseEntry(), selectionId: 'demo', selectionJson, gradingDataRoot: tempRoot
        } )
        const hasErr = r.errors.some( ( e ) => e.includes( 'SEL-S1' ) )
        expect( hasErr ).toBe( true )
    } )

    test( 'missing phase-status → SEL-S1', async () => {
        const selectionJson = { members: [ { schemaId: 'nope.x' } ] }
        const r = await SelectionPhases.runS1( {
            entry: baseEntry(), selectionId: 'demo', selectionJson, gradingDataRoot: tempRoot
        } )
        const hasErr = r.errors.some( ( e ) => e.includes( 'SEL-S1' ) )
        expect( hasErr ).toBe( true )
    } )
} )


describe( 'SelectionPhases.runS2 (Lockfile-Consistency)', () => {
    test( 'matching hash + members → no errors', async () => {
        const selectionJson = { selectionId: 'demo', members: [] }
        const expectedHash = HashGenerator.computeSelectionHash( { selection: selectionJson } ).hash
        const lockfile = { selectionHash: expectedHash, members: [] }
        const r = await SelectionPhases.runS2( {
            entry: baseEntry(), selectionId: 'demo', selectionJson, lockfile, gradingDataRoot: tempRoot
        } )
        expect( r.errors ).toEqual( [] )
    } )

    test( 'mismatched selectionHash → SEL-S2', async () => {
        const selectionJson = { selectionId: 'demo', members: [] }
        const lockfile = { selectionHash: 'deadbeef', members: [] }
        const r = await SelectionPhases.runS2( {
            entry: baseEntry(), selectionId: 'demo', selectionJson, lockfile, gradingDataRoot: tempRoot
        } )
        const hasErr = r.errors.some( ( e ) => e.includes( 'SEL-S2' ) )
        expect( hasErr ).toBe( true )
    } )

    test( 'missing lockfile → SEL-S2', async () => {
        const selectionJson = { selectionId: 'demo', members: [] }
        const r = await SelectionPhases.runS2( {
            entry: baseEntry(), selectionId: 'demo', selectionJson, lockfile: null, gradingDataRoot: tempRoot
        } )
        const hasErr = r.errors.some( ( e ) => e.includes( 'SEL-S2' ) )
        expect( hasErr ).toBe( true )
    } )
} )


describe( 'SelectionPhases.runS3 (Skills-Coverage)', () => {
    test( '4 skills with existing files → no errors', async () => {
        const selectionId = 'demo-s3-ok'
        const skillsDir = join( tempRoot, 'selection', selectionId, 'skills' )
        await mkdir( skillsDir, { recursive: true } )
        await writeFile( join( skillsDir, 'one.mjs' ), 'export {}' )
        await writeFile( join( skillsDir, 'two.mjs' ), 'export {}' )
        const selectionJson = { selectionId, skills: [ 'a/skill/one', 'a/skill/two' ] }

        const r = await SelectionPhases.runS3( {
            entry: baseEntry(), selectionId, selectionJson, gradingDataRoot: tempRoot
        } )
        expect( r.errors ).toEqual( [] )
    } )

    test( '5 skills → SEL-S3 (max 4)', async () => {
        const selectionJson = { selectionId: 'x', skills: [ 'a', 'b', 'c', 'd', 'e' ] }
        const r = await SelectionPhases.runS3( {
            entry: baseEntry(), selectionId: 'x', selectionJson, gradingDataRoot: tempRoot
        } )
        const hasErr = r.errors.some( ( e ) => e.includes( 'SEL-S3' ) )
        expect( hasErr ).toBe( true )
    } )

    test( 'duplicate skill name → SEL-S3', async () => {
        const selectionJson = { selectionId: 'x', skills: [ 'dup', 'dup' ] }
        const r = await SelectionPhases.runS3( {
            entry: baseEntry(), selectionId: 'x', selectionJson, gradingDataRoot: tempRoot
        } )
        const hasErr = r.errors.some( ( e ) => e.includes( 'SEL-S3' ) )
        expect( hasErr ).toBe( true )
    } )
} )


describe( 'SelectionPhases.runS4 (Persona-Reference-Coherence)', () => {
    test( 'all personaIds resolved + domainDocId set → no errors', async () => {
        const selectionJson = { personaIds: [ 'p1' ], domainDocId: 'doc-1' }
        const r = await SelectionPhases.runS4( {
            entry: baseEntry(), selectionId: 'demo', selectionJson, personaIndex: { p1: {} }
        } )
        expect( r.errors ).toEqual( [] )
    } )

    test( 'empty personaIds → SEL-S4', async () => {
        const selectionJson = { personaIds: [], domainDocId: 'doc' }
        const r = await SelectionPhases.runS4( {
            entry: baseEntry(), selectionId: 'demo', selectionJson, personaIndex: {}
        } )
        const hasErr = r.errors.some( ( e ) => e.includes( 'SEL-S4' ) )
        expect( hasErr ).toBe( true )
    } )

    test( 'unresolved personaId → SEL-S4', async () => {
        const selectionJson = { personaIds: [ 'missing' ], domainDocId: 'doc' }
        const r = await SelectionPhases.runS4( {
            entry: baseEntry(), selectionId: 'demo', selectionJson, personaIndex: {}
        } )
        const hasErr = r.errors.some( ( e ) => e.includes( 'SEL-S4' ) )
        expect( hasErr ).toBe( true )
    } )

    test( 'missing domainDocId → SEL-S4', async () => {
        const selectionJson = { personaIds: [ 'p1' ] }
        const r = await SelectionPhases.runS4( {
            entry: baseEntry(), selectionId: 'demo', selectionJson, personaIndex: { p1: {} }
        } )
        const hasErr = r.errors.some( ( e ) => e.includes( 'SEL-S4' ) )
        expect( hasErr ).toBe( true )
    } )
} )


describe( 'SelectionPhases.runAllStub (back-compat)', () => {
    test( 'returns synchronous stub when called via the old path', () => {
        const r = SelectionPhases.runAllStub( { entry: baseEntry() } )
        expect( r.stub ).toBe( true )
        expect( r.phases.length ).toBe( 4 )
    } )
} )
