import { describe, test, expect, beforeAll } from '@jest/globals'

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath( import.meta.url )
const __dirname = dirname( __filename )

import { SharedLists, SHARED_LIST_FILENAME_REGEX } from '../../src/SharedLists.mjs'
import { HashGenerator } from '../../src/HashGenerator.mjs'


describe( 'SharedLists.hash', () => {
    test( 'identical lists -> identical hash', () => {
        const list = { meta: { name: 'l', version: '1.0.0' }, entries: [ { id: 1 }, { id: 2 } ] }
        const a = SharedLists.hash( { list } )
        const b = SharedLists.hash( { list: JSON.parse( JSON.stringify( list ) ) } )
        expect( a.errors ).toEqual( [] )
        expect( b.errors ).toEqual( [] )
        expect( a.hash ).toBe( b.hash )
    } )

    test( 'edit to entry -> hash changes (bump trigger)', () => {
        const before = { entries: [ { id: 1, label: 'a' } ] }
        const after  = { entries: [ { id: 1, label: 'b' } ] }
        const a = SharedLists.hash( { list: before } )
        const b = SharedLists.hash( { list: after } )
        expect( a.hash ).not.toBe( b.hash )
    } )

    test( 'matches HashGenerator.computeHash result', () => {
        const list = { entries: [ { id: 'x' } ] }
        const a = SharedLists.hash( { list } )
        const b = HashGenerator.computeHash( { value: list } )
        expect( a.hash ).toBe( b.hash )
    } )

    test( 'missing list -> SL-001 error', () => {
        const r = SharedLists.hash( {} )
        expect( r.hash ).toBeNull()
        expect( r.errors[ 0 ] ).toContain( 'SL-001' )
    } )

    test( 'non-object list -> SL-002 error', () => {
        const r = SharedLists.hash( { list: 'not-an-object' } )
        expect( r.hash ).toBeNull()
        expect( r.errors[ 0 ] ).toContain( 'SL-002' )
    } )
} )


describe( 'SharedLists.validateFilename', () => {
    test( 'accepts canonical pattern <hash>--vX.Y.Z.json', () => {
        const r = SharedLists.validateFilename( { filename: 'a1b2c3d4--v1.0.0.json' } )
        expect( r.status ).toBe( true )
        expect( r.hash ).toBe( 'a1b2c3d4' )
        expect( r.version ).toBe( '1.0.0' )
    } )

    test( 'rejects plain JSON name', () => {
        const r = SharedLists.validateFilename( { filename: 'evmChains.json' } )
        expect( r.status ).toBe( false )
        expect( r.messages[ 0 ] ).toContain( 'SL-003' )
    } )

    test( 'rejects truncated hash', () => {
        const r = SharedLists.validateFilename( { filename: 'a1b2--v1.0.0.json' } )
        expect( r.status ).toBe( false )
    } )

    test( 'rejects incomplete semver', () => {
        const r = SharedLists.validateFilename( { filename: 'a1b2c3d4--v1.json' } )
        expect( r.status ).toBe( false )
    } )

    test( 'rejects undefined filename', () => {
        const r = SharedLists.validateFilename( {} )
        expect( r.status ).toBe( false )
        expect( r.messages[ 0 ] ).toContain( 'SL-001' )
    } )

    test( 'regex constant matches public expectation', () => {
        expect( SHARED_LIST_FILENAME_REGEX.test( 'd875b0e8--v1.0.0.json' ) ).toBe( true )
        expect( SHARED_LIST_FILENAME_REGEX.test( 'evmChains.json' ) ).toBe( false )
    } )
} )


describe( 'SharedLists.load', () => {
    let workdir = null
    let listFile = null
    let listHash = null

    beforeAll( async() => {
        workdir = await mkdtemp( join( tmpdir(), 'shared-lists-test-' ) )
        const targetDir = join( workdir, 'shared-lists', 'evmChains' )
        await mkdir( targetDir, { recursive: true } )

        const list = { meta: { name: 'evmChains', version: '1.0.0' }, entries: [ { alias: 'ETH', chainId: 1 } ] }
        const { hash } = HashGenerator.computeHash( { value: list } )
        listHash = hash
        listFile = join( targetDir, `${hash}--v1.0.0.json` )
        await writeFile( listFile, JSON.stringify( list, null, 2 ), 'utf-8' )
    } )

    test( 'loads migrated list', async() => {
        const r = await SharedLists.load( { gradingDataRoot: workdir, listname: 'evmChains' } )
        expect( r.errors ).toEqual( [] )
        expect( r.hash ).toBe( listHash )
        expect( r.version ).toBe( '1.0.0' )
        expect( Array.isArray( r.list.entries ) ).toBe( true )
        expect( r.list.entries[ 0 ].alias ).toBe( 'ETH' )
    } )

    test( 'returns SL-003 when listname missing on disk', async() => {
        const r = await SharedLists.load( { gradingDataRoot: workdir, listname: 'does-not-exist' } )
        expect( r.list ).toBeNull()
        expect( r.errors[ 0 ] ).toContain( 'SL-003' )
    } )

    test( 'requires gradingDataRoot', async() => {
        const r = await SharedLists.load( { listname: 'evmChains' } )
        expect( r.errors[ 0 ] ).toContain( 'SL-001' )
    } )
} )
