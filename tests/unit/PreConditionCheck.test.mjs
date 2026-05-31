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

    test( 'graded (not stable) → passed: false (5-status gate, only stable passes)', () => {
        const lockfile = {
            members: [
                { schemaId: 'a.b', gradingStatus: 'stable' },
                { schemaId: 'c.d', gradingStatus: 'graded' }
            ]
        }
        const r = PreConditionCheck.checkLockfile( { lockfile } )
        expect( r.passed ).toBe( false )
        expect( r.missingSingleGradings ).toContain( 'c.d' )
    } )

    test( 'rejected member → passed: false', () => {
        const lockfile = {
            members: [ { schemaId: 'a.b', gradingStatus: 'rejected' } ]
        }
        const r = PreConditionCheck.checkLockfile( { lockfile } )
        expect( r.passed ).toBe( false )
    } )

    test( 'malformed lockSnapshot yields PRE-003', () => {
        const r = PreConditionCheck.checkLockfile( { lockfile: { something: 'else' } } )
        expect( r.passed ).toBe( false )
        expect( r.errors[ 0 ] ).toContain( 'PRE-003' )
    } )

    test( 'missing lockSnapshot yields PRE-001', () => {
        const r = PreConditionCheck.checkLockfile( {} )
        expect( r.errors[ 0 ] ).toContain( 'PRE-001' )
    } )
} )


describe( 'PreConditionCheck.check (async — reads index.json.lockSnapshot)', () => {
    test( 'reads lockSnapshot from selections/<sel>/index.json → passed when all stable', async () => {
        const selectionId = 'demo-pre'
        const indexDir = join( tempRoot, 'selections', selectionId )
        await mkdir( indexDir, { recursive: true } )
        const index = {
            indexVersion: 2,
            selectionId,
            lockSnapshot: {
                selectionId,
                members: [ { schemaId: 'a.b', gradingStatus: 'stable' } ]
            }
        }
        await writeFile( join( indexDir, 'index.json' ), JSON.stringify( index ), 'utf-8' )

        const r = await PreConditionCheck.check( { gradingDataRoot: tempRoot, selectionId } )
        expect( r.passed ).toBe( true )
    } )

    test( 'index.json present but no lockSnapshot yields PRE-002', async () => {
        const selectionId = 'no-snapshot'
        const indexDir = join( tempRoot, 'selections', selectionId )
        await mkdir( indexDir, { recursive: true } )
        await writeFile( join( indexDir, 'index.json' ), JSON.stringify( { indexVersion: 2, selectionId } ), 'utf-8' )

        const r = await PreConditionCheck.check( { gradingDataRoot: tempRoot, selectionId } )
        expect( r.errors[ 0 ] ).toContain( 'PRE-002' )
    } )

    test( 'missing index.json yields PRE-002', async () => {
        const r = await PreConditionCheck.check( { gradingDataRoot: tempRoot, selectionId: 'no-such' } )
        expect( r.errors[ 0 ] ).toContain( 'PRE-002' )
    } )

    test( 'missing required field yields PRE-001', async () => {
        const r = await PreConditionCheck.check( {} )
        expect( r.errors[ 0 ] ).toContain( 'PRE-001' )
    } )
} )
