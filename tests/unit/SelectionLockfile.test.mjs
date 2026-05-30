import { describe, test, expect, beforeAll, afterAll } from '@jest/globals'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SelectionLockfile } from '../../src/SelectionLockfile.mjs'
import { HashGenerator } from '../../src/HashGenerator.mjs'


let tempRoot = null


const seedSelection = async ( { selectionId, members } ) => {
    const selDir = join( tempRoot, 'selection', selectionId )
    await mkdir( selDir, { recursive: true } )
    const selectionJson = {
        selectionId,
        selectionVersion: '1.0.0',
        description: 'Demo',
        personaIds: [ 'p1' ],
        domainDocId: 'doc-1',
        aboutHash: 'aaaaaaaa',
        members,
        skills: []
    }
    await writeFile( join( selDir, 'selection.json' ), JSON.stringify( selectionJson, null, 4 ), 'utf-8' )
    return selectionJson
}


const seedPhaseStatus = async ( { schemaId, schemaHash, schemaVersion, gradingStatus } ) => {
    const psDir = join( tempRoot, 'phase-status', 'single' )
    await mkdir( psDir, { recursive: true } )
    const ns = schemaId.replace( /\./g, '--' )
    const ps = { namespaceTool: ns, schemaHash, schemaVersion, gradingStatus }
    await writeFile( join( psDir, `${ns}.json` ), JSON.stringify( ps, null, 4 ), 'utf-8' )
}


beforeAll( async () => {
    tempRoot = await mkdtemp( join( tmpdir(), 'lockfile-' ) )
} )


afterAll( async () => {
    if( tempRoot !== null ) {
        await rm( tempRoot, { recursive: true, force: true } )
    }
} )


describe( 'SelectionLockfile.generate', () => {
    test( 'writes lockfile with selectionHash + member states', async () => {
        const selectionId = 'demo-sel-1'
        const members = [ { schemaId: 'a.b' }, { schemaId: 'c.d' } ]
        const selectionJson = await seedSelection( { selectionId, members } )
        await seedPhaseStatus( { schemaId: 'a.b', schemaHash: 'aaaaaaaa', schemaVersion: '1.0.0', gradingStatus: 'stable' } )
        await seedPhaseStatus( { schemaId: 'c.d', schemaHash: 'cccccccc', schemaVersion: '1.0.0', gradingStatus: 'stable' } )

        const result = await SelectionLockfile.generate( { gradingDataRoot: tempRoot, selectionId } )
        expect( result.errors ).toEqual( [] )
        expect( result.lockfile.members.length ).toBe( 2 )

        const expectedHash = HashGenerator.computeSelectionHash( { selection: selectionJson } ).hash
        expect( result.lockfile.selectionHash ).toBe( expectedHash )
        expect( result.lockfile.members[ 0 ].gradingStatus ).toBe( 'stable' )
    } )

    test( 'missing phase-status → member.gradingStatus = pending, schemaHash = null', async () => {
        const selectionId = 'demo-sel-2'
        await seedSelection( { selectionId, members: [ { schemaId: 'never.seen' } ] } )

        const result = await SelectionLockfile.generate( { gradingDataRoot: tempRoot, selectionId } )
        expect( result.lockfile.members[ 0 ].gradingStatus ).toBe( 'pending' )
        expect( result.lockfile.members[ 0 ].schemaHash ).toBeNull()
    } )

    test( 'missing selection.json yields LCK-002', async () => {
        const r = await SelectionLockfile.generate( { gradingDataRoot: tempRoot, selectionId: 'no-such' } )
        expect( r.errors[ 0 ] ).toContain( 'LCK-002' )
    } )

    test( 'overwriting existing lockfile yields LCK-WARN-001', async () => {
        const selectionId = 'demo-sel-warn'
        await seedSelection( { selectionId, members: [] } )
        const first = await SelectionLockfile.generate( { gradingDataRoot: tempRoot, selectionId } )
        expect( first.errors ).toEqual( [] )
        const second = await SelectionLockfile.generate( { gradingDataRoot: tempRoot, selectionId } )
        expect( second.errors[ 0 ] ).toContain( 'LCK-WARN-001' )
    } )
} )


describe( 'SelectionLockfile.read', () => {
    test( 'roundtrip: write then read returns same data', async () => {
        const selectionId = 'demo-roundtrip'
        await seedSelection( { selectionId, members: [ { schemaId: 'a.b' } ] } )
        await seedPhaseStatus( { schemaId: 'a.b', schemaHash: 'aaaaaaaa', schemaVersion: '1.0.0', gradingStatus: 'stable' } )

        const gen = await SelectionLockfile.generate( { gradingDataRoot: tempRoot, selectionId } )
        const read = await SelectionLockfile.read( { gradingDataRoot: tempRoot, selectionId } )
        expect( read.errors ).toEqual( [] )
        expect( read.lockfile.selectionHash ).toBe( gen.lockfile.selectionHash )
    } )
} )


describe( 'SelectionLockfile.diff', () => {
    test( 'detects added members', () => {
        const a = { members: [ { schemaId: 'a.b' } ] }
        const b = { members: [ { schemaId: 'a.b' }, { schemaId: 'c.d' } ] }
        const d = SelectionLockfile.diff( { oldLockfile: a, newLockfile: b } )
        expect( d.addedMembers ).toEqual( [ 'c.d' ] )
        expect( d.removedMembers ).toEqual( [] )
    } )

    test( 'detects removed members', () => {
        const a = { members: [ { schemaId: 'a.b' }, { schemaId: 'c.d' } ] }
        const b = { members: [ { schemaId: 'a.b' } ] }
        const d = SelectionLockfile.diff( { oldLockfile: a, newLockfile: b } )
        expect( d.removedMembers ).toEqual( [ 'c.d' ] )
    } )

    test( 'detects changed schemaHash', () => {
        const a = { members: [ { schemaId: 'a.b', schemaHash: 'X' } ] }
        const b = { members: [ { schemaId: 'a.b', schemaHash: 'Y' } ] }
        const d = SelectionLockfile.diff( { oldLockfile: a, newLockfile: b } )
        expect( d.changedMembers ).toEqual( [ 'a.b' ] )
    } )

    test( 'missing oldLockfile yields LCK-001', () => {
        const d = SelectionLockfile.diff( { newLockfile: { members: [] } } )
        expect( d.errors[ 0 ] ).toContain( 'LCK-001' )
    } )
} )


describe( 'SelectionLockfile.validateOverride', () => {
    test( 'accepts whitelisted name + description', () => {
        const r = SelectionLockfile.validateOverride( { override: { name: 'Forecast', description: 'short' } } )
        expect( r.valid ).toBe( true )
        expect( r.errors ).toEqual( [] )
    } )

    test( 'rejects non-whitelisted key with LCK-005', () => {
        const r = SelectionLockfile.validateOverride( { override: { name: 'ok', tags: [ 'x' ] } } )
        expect( r.valid ).toBe( false )
        const has = r.errors.some( ( e ) => e.includes( 'LCK-005' ) )
        expect( has ).toBe( true )
    } )

    test( 'rejects non-string value with LCK-005', () => {
        const r = SelectionLockfile.validateOverride( { override: { name: 42 } } )
        expect( r.valid ).toBe( false )
        expect( r.errors[ 0 ] ).toContain( 'LCK-005' )
    } )

    test( 'rejects empty override with LCK-005', () => {
        const r = SelectionLockfile.validateOverride( { override: {} } )
        expect( r.valid ).toBe( false )
        expect( r.errors[ 0 ] ).toContain( 'LCK-005' )
    } )

    test( 'missing override yields LCK-001', () => {
        const r = SelectionLockfile.validateOverride( {} )
        expect( r.valid ).toBe( false )
        expect( r.errors[ 0 ] ).toContain( 'LCK-001' )
    } )
} )


describe( 'SelectionLockfile.generate with override', () => {
    test( 'records a valid override in the lockfile member state', async () => {
        const selectionId = 'demo-override-ok'
        const members = [ { schemaId: 'a.b', override: { name: 'Renamed' } } ]
        await seedSelection( { selectionId, members } )
        await seedPhaseStatus( { schemaId: 'a.b', schemaHash: 'aaaaaaaa', schemaVersion: '1.0.0', gradingStatus: 'stable' } )

        const result = await SelectionLockfile.generate( { gradingDataRoot: tempRoot, selectionId } )
        expect( result.errors ).toEqual( [] )
        expect( result.lockfile.members[ 0 ].override ).toEqual( { name: 'Renamed' } )
    } )

    test( 'member without override gets override = null', async () => {
        const selectionId = 'demo-override-none'
        await seedSelection( { selectionId, members: [ { schemaId: 'a.b' } ] } )
        await seedPhaseStatus( { schemaId: 'a.b', schemaHash: 'aaaaaaaa', schemaVersion: '1.0.0', gradingStatus: 'stable' } )

        const result = await SelectionLockfile.generate( { gradingDataRoot: tempRoot, selectionId } )
        expect( result.errors ).toEqual( [] )
        expect( result.lockfile.members[ 0 ].override ).toBeNull()
    } )

    test( 'invalid member override rejects generation with LCK-005', async () => {
        const selectionId = 'demo-override-bad'
        await seedSelection( { selectionId, members: [ { schemaId: 'a.b', override: { color: 'red' } } ] } )

        const result = await SelectionLockfile.generate( { gradingDataRoot: tempRoot, selectionId } )
        expect( result.lockfile ).toBeNull()
        expect( result.errors[ 0 ] ).toContain( 'LCK-005' )
    } )
} )
