import { describe, test, expect, beforeAll, afterAll } from '@jest/globals'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PreConditionCheck } from '../../src/PreConditionCheck.mjs'


let tempRoot = null

beforeAll( async () => {
    tempRoot = await mkdtemp( join( tmpdir(), 'precondition-' ) )
} )

afterAll( async () => {
    if( tempRoot !== null ) {
        await rm( tempRoot, { recursive: true, force: true } )
    }
} )


describe( 'PreConditionCheck.checkLockfile', () => {
    test( 'all stable → passed: true', () => {
        const lockfile = {
            members: [
                { schemaId: 'a.b', gradingStatus: 'stable' },
                { schemaId: 'c.d', gradingStatus: 'stable' }
            ]
        }
        const r = PreConditionCheck.checkLockfile( { lockfile } )
        expect( r.passed ).toBe( true )
        expect( r.blockedMembers ).toEqual( [] )
    } )

    test( 'one pending → passed: false', () => {
        const lockfile = {
            members: [
                { schemaId: 'a.b', gradingStatus: 'stable' },
                { schemaId: 'c.d', gradingStatus: 'pending' }
            ]
        }
        const r = PreConditionCheck.checkLockfile( { lockfile } )
        expect( r.passed ).toBe( false )
        expect( r.blockedMembers.length ).toBe( 1 )
        expect( r.missingSingleGradings ).toContain( 'c.d' )
        expect( r.errors[ 0 ] ).toContain( 'PRE-004' )
    } )

    test( 'empty members → PRE-WARN-001', () => {
        const r = PreConditionCheck.checkLockfile( { lockfile: { members: [] } } )
        expect( r.passed ).toBe( true )
        expect( r.errors[ 0 ] ).toContain( 'PRE-WARN-001' )
    } )

    test( 'malformed lockfile yields PRE-003', () => {
        const r = PreConditionCheck.checkLockfile( { lockfile: { something: 'else' } } )
        expect( r.passed ).toBe( false )
        expect( r.errors[ 0 ] ).toContain( 'PRE-003' )
    } )

    test( 'missing lockfile yields PRE-001', () => {
        const r = PreConditionCheck.checkLockfile( {} )
        expect( r.errors[ 0 ] ).toContain( 'PRE-001' )
    } )
} )


describe( 'PreConditionCheck.check (async)', () => {
    test( 'reads lockfile from disk → passed when stable', async () => {
        const selectionId = 'demo-pre'
        const lockfilePath = join( tempRoot, 'selection', selectionId )
        await mkdir( lockfilePath, { recursive: true } )
        const lockfile = {
            selectionId,
            members: [ { schemaId: 'a.b', gradingStatus: 'stable' } ]
        }
        await writeFile( join( lockfilePath, 'selection.lock.json' ), JSON.stringify( lockfile ), 'utf-8' )

        const r = await PreConditionCheck.check( { gradingDataRoot: tempRoot, selectionId } )
        expect( r.passed ).toBe( true )
    } )

    test( 'missing lockfile yields PRE-002', async () => {
        const r = await PreConditionCheck.check( { gradingDataRoot: tempRoot, selectionId: 'no-such' } )
        expect( r.errors[ 0 ] ).toContain( 'PRE-002' )
    } )

    test( 'missing required field yields PRE-001', async () => {
        const r = await PreConditionCheck.check( {} )
        expect( r.errors[ 0 ] ).toContain( 'PRE-001' )
    } )
} )
