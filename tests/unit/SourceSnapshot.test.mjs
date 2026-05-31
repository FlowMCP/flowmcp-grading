import { describe, test, expect, beforeAll, afterAll } from '@jest/globals'
import { mkdtemp, rm, writeFile, mkdir, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SourceSnapshot } from '../../src/SourceSnapshot.mjs'
import { HashGenerator } from '../../src/HashGenerator.mjs'


let tempRoot = null
let sourcePath = null
const SAMPLE_SCHEMA_SOURCE = `export const main = {
    version: 'flowmcp/4.0.0',
    namespace: 'test',
    name: 'sampleSnapshot',
    tools: {
        foo: { method: 'GET', path: '/foo', description: 'fetch foo' }
    }
}
`

beforeAll( async () => {
    tempRoot = await mkdtemp( join( tmpdir(), 'snapshot-test-' ) )
    sourcePath = join( tempRoot, 'source.mjs' )
    await writeFile( sourcePath, SAMPLE_SCHEMA_SOURCE, 'utf-8' )
} )


afterAll( async () => {
    if( tempRoot !== null ) {
        await rm( tempRoot, { recursive: true, force: true } )
    }
} )


describe( 'SourceSnapshot.parseSnapshotFilename (B2 grammar)', () => {
    test( 'happy path — <name>--<ts>--<hash8>.mjs', () => {
        const r = SourceSnapshot.parseSnapshotFilename( { filename: 'sampleSnapshot--2026-05-30T10-15-00Z--a1b2c3d4.mjs' } )
        expect( r.name ).toBe( 'sampleSnapshot' )
        expect( r.timestamp ).toBe( '2026-05-30T10-15-00Z' )
        expect( r.hash ).toBe( 'a1b2c3d4' )
    } )

    test( 'legacy <hash>--v<X.Y.Z>.mjs is no longer valid → SNP-003', () => {
        const r = SourceSnapshot.parseSnapshotFilename( { filename: 'a1b2c3d4--v1.0.0.mjs' } )
        expect( r.errors[ 0 ] ).toContain( 'SNP-003' )
    } )

    test( 'broken filename yields SNP-003', () => {
        const r = SourceSnapshot.parseSnapshotFilename( { filename: 'broken.mjs' } )
        expect( r.errors[ 0 ] ).toContain( 'SNP-003' )
    } )

    test( 'missing filename yields SNP-001', () => {
        const r = SourceSnapshot.parseSnapshotFilename( {} )
        expect( r.errors[ 0 ] ).toContain( 'SNP-001' )
    } )
} )


describe( 'SourceSnapshot.create (providers/<ns>/<schema>/schema/ + B2 name)', () => {
    test( 'creates file under providers/<ns>/<schema>/schema/<name>--<ts>--<hash>.mjs', async () => {
        const root = join( tempRoot, 'gradingdata-1' )
        const result = await SourceSnapshot.create( {
            sourcePath,
            gradingDataRoot: root,
            namespace: 'test',
            schemaName: 'sampleSnapshot',
            schemaHash: 'a1b2c3d4'
        } )
        expect( result.errors ).toEqual( [] )
        expect( result.created ).toBe( true )
        expect( result.snapshotPath ).toContain( join( root, 'providers', 'test', 'sampleSnapshot', 'schema' ) )

        const filename = result.snapshotPath.split( /[\\/]/ ).pop()
        expect( filename.startsWith( 'sampleSnapshot--' ) ).toBe( true )
        expect( filename.endsWith( '--a1b2c3d4.mjs' ) ).toBe( true )

        const content = await readFile( result.snapshotPath, 'utf-8' )
        expect( content ).toBe( SAMPLE_SCHEMA_SOURCE )
    } )

    test( 'idempotent — second call with identical content + hash returns created: false', async () => {
        const root = join( tempRoot, 'gradingdata-2' )
        const first = await SourceSnapshot.create( {
            sourcePath, gradingDataRoot: root, namespace: 'test', schemaName: 'sampleSnapshot', schemaHash: 'a1b2c3d4'
        } )
        expect( first.errors ).toEqual( [] )

        const second = await SourceSnapshot.create( {
            sourcePath, gradingDataRoot: root, namespace: 'test', schemaName: 'sampleSnapshot', schemaHash: 'a1b2c3d4'
        } )
        expect( second.created ).toBe( false )
        expect( second.errors ).toEqual( [] )
    } )

    test( 'conflict — same hash, different content yields SNP-004', async () => {
        const root = join( tempRoot, 'gradingdata-3' )
        await SourceSnapshot.create( {
            sourcePath, gradingDataRoot: root, namespace: 'test', schemaName: 'sampleSnapshot', schemaHash: 'a1b2c3d4'
        } )

        const altPath = join( tempRoot, 'source-alt.mjs' )
        await writeFile( altPath, SAMPLE_SCHEMA_SOURCE + '\n// different\n', 'utf-8' )

        const conflict = await SourceSnapshot.create( {
            sourcePath: altPath, gradingDataRoot: root, namespace: 'test', schemaName: 'sampleSnapshot', schemaHash: 'a1b2c3d4'
        } )
        expect( conflict.created ).toBe( false )
        expect( conflict.errors[ 0 ] ).toContain( 'SNP-004' )
    } )

    test( 'invalid schemaName yields SNP-003', async () => {
        const result = await SourceSnapshot.create( {
            sourcePath,
            gradingDataRoot: join( tempRoot, 'gradingdata-4' ),
            namespace: 'test',
            schemaName: '1-bad name',
            schemaHash: 'a1b2c3d4'
        } )
        expect( result.errors[ 0 ] ).toContain( 'SNP-003' )
    } )

    test( 'invalid hash format yields SNP-003', async () => {
        const result = await SourceSnapshot.create( {
            sourcePath,
            gradingDataRoot: join( tempRoot, 'gradingdata-5' ),
            namespace: 'test',
            schemaName: 'sampleSnapshot',
            schemaHash: 'ZZZ'
        } )
        expect( result.errors[ 0 ] ).toContain( 'SNP-003' )
    } )

    test( 'missing source path yields SNP-005', async () => {
        const result = await SourceSnapshot.create( {
            sourcePath: join( tempRoot, 'does-not-exist.mjs' ),
            gradingDataRoot: join( tempRoot, 'gradingdata-6' ),
            namespace: 'test',
            schemaName: 'sampleSnapshot',
            schemaHash: 'a1b2c3d4'
        } )
        expect( result.errors[ 0 ] ).toContain( 'SNP-005' )
    } )
} )


describe( 'SourceSnapshot.listForNamespace (schema-level B2 layout)', () => {
    test( 'returns snapshots across schema folders', async () => {
        const root = join( tempRoot, 'gradingdata-list' )
        const aDir = join( root, 'providers', 'test', 'alpha', 'schema' )
        const bDir = join( root, 'providers', 'test', 'beta', 'schema' )
        await mkdir( aDir, { recursive: true } )
        await mkdir( bDir, { recursive: true } )
        await writeFile( join( aDir, 'alpha--2026-05-30T10-15-00Z--aaaaaaaa.mjs' ), 'export const main = { version: "flowmcp/4.0.0" }' )
        await writeFile( join( bDir, 'beta--2026-05-30T11-15-00Z--bbbbbbbb.mjs' ), 'export const main = { version: "flowmcp/4.0.0" }' )

        const result = await SourceSnapshot.listForNamespace( { gradingDataRoot: root, namespace: 'test' } )
        expect( result.errors ).toEqual( [] )
        expect( result.snapshots.length ).toBe( 2 )
        const hashes = result.snapshots.map( ( s ) => s.hash ).sort()
        expect( hashes ).toEqual( [ 'aaaaaaaa', 'bbbbbbbb' ] )
    } )

    test( 'empty when directory does not exist', async () => {
        const r = await SourceSnapshot.listForNamespace( { gradingDataRoot: '/no/such/path', namespace: 'x' } )
        expect( r.snapshots ).toEqual( [] )
    } )
} )


describe( 'SourceSnapshot.verify', () => {
    test( 'valid snapshot — recomputed hash matches filename hash', async () => {
        const root = join( tempRoot, 'gradingdata-verify' )
        const schemaDir = join( root, 'providers', 'verify', 'sample', 'schema' )
        await mkdir( schemaDir, { recursive: true } )

        const schemaObject = {
            version: 'flowmcp/4.0.0',
            namespace: 'verify',
            name: 'sample',
            tools: {}
        }
        const hashResult = HashGenerator.computeSchemaHash( { schema: schemaObject } )
        const filename = `sample--2026-05-30T10-15-00Z--${hashResult.hash}.mjs`
        const fileSource = `export const main = ${JSON.stringify( schemaObject )}`
        const fullPath = join( schemaDir, filename )
        await writeFile( fullPath, fileSource, 'utf-8' )

        const verifyResult = await SourceSnapshot.verify( { snapshotPath: fullPath } )
        expect( verifyResult.errors ).toEqual( [] )
        expect( verifyResult.valid ).toBe( true )
        expect( verifyResult.expectedHash ).toBe( hashResult.hash )
    } )

    test( 'missing snapshotPath yields SNP-001', async () => {
        const r = await SourceSnapshot.verify( {} )
        expect( r.errors[ 0 ] ).toContain( 'SNP-001' )
    } )
} )
