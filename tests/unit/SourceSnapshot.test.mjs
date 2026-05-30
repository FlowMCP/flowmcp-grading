import { describe, test, expect, beforeAll, afterAll } from '@jest/globals'
import { mkdtemp, rm, writeFile, mkdir, readFile, appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SourceSnapshot } from '../../src/SourceSnapshot.mjs'
import { HashGenerator } from '../../src/HashGenerator.mjs'


let tempRoot = null
let sourcePath = null
const SAMPLE_SCHEMA_SOURCE = `export const main = {
    version: '4.0.0',
    schemaVersion: '1.0.0',
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


describe( 'SourceSnapshot.parseSnapshotFilename', () => {
    test( 'happy path', () => {
        const r = SourceSnapshot.parseSnapshotFilename( { filename: 'a1b2c3d4--v1.0.0.mjs' } )
        expect( r.hash ).toBe( 'a1b2c3d4' )
        expect( r.schemaVersion ).toBe( '1.0.0' )
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


describe( 'SourceSnapshot.create', () => {
    test( 'creates file under <root>/schemas/<ns>/<hash>--v<X.Y.Z>.mjs', async () => {
        const root = join( tempRoot, 'gradingdata-1' )
        const result = await SourceSnapshot.create( {
            sourcePath,
            gradingDataRoot: root,
            namespace: 'test',
            schemaVersion: '1.0.0',
            schemaHash: 'a1b2c3d4'
        } )
        expect( result.errors ).toEqual( [] )
        expect( result.created ).toBe( true )
        expect( result.snapshotPath ).toBe( join( root, 'schemas', 'test', 'a1b2c3d4--v1.0.0.mjs' ) )

        const content = await readFile( result.snapshotPath, 'utf-8' )
        expect( content ).toBe( SAMPLE_SCHEMA_SOURCE )
    } )

    test( 'idempotent — second call with identical content returns created: false', async () => {
        const root = join( tempRoot, 'gradingdata-2' )
        const first = await SourceSnapshot.create( {
            sourcePath, gradingDataRoot: root, namespace: 'test', schemaVersion: '1.0.0', schemaHash: 'a1b2c3d4'
        } )
        expect( first.errors ).toEqual( [] )

        const second = await SourceSnapshot.create( {
            sourcePath, gradingDataRoot: root, namespace: 'test', schemaVersion: '1.0.0', schemaHash: 'a1b2c3d4'
        } )
        expect( second.created ).toBe( false )
        expect( second.errors ).toEqual( [] )
    } )

    test( 'conflict — different content yields SNP-004', async () => {
        const root = join( tempRoot, 'gradingdata-3' )
        await SourceSnapshot.create( {
            sourcePath, gradingDataRoot: root, namespace: 'test', schemaVersion: '1.0.0', schemaHash: 'a1b2c3d4'
        } )

        // Mutate the source
        const altPath = join( tempRoot, 'source-alt.mjs' )
        await writeFile( altPath, SAMPLE_SCHEMA_SOURCE + '\n// different\n', 'utf-8' )

        const conflict = await SourceSnapshot.create( {
            sourcePath: altPath, gradingDataRoot: root, namespace: 'test', schemaVersion: '1.0.0', schemaHash: 'a1b2c3d4'
        } )
        expect( conflict.created ).toBe( false )
        expect( conflict.errors[ 0 ] ).toContain( 'SNP-004' )
    } )

    test( 'invalid semver yields SNP-003', async () => {
        const result = await SourceSnapshot.create( {
            sourcePath,
            gradingDataRoot: join( tempRoot, 'gradingdata-4' ),
            namespace: 'test',
            schemaVersion: 'not-semver',
            schemaHash: 'a1b2c3d4'
        } )
        expect( result.errors[ 0 ] ).toContain( 'SNP-003' )
    } )

    test( 'invalid hash format yields SNP-003', async () => {
        const result = await SourceSnapshot.create( {
            sourcePath,
            gradingDataRoot: join( tempRoot, 'gradingdata-5' ),
            namespace: 'test',
            schemaVersion: '1.0.0',
            schemaHash: 'ZZZ'
        } )
        expect( result.errors[ 0 ] ).toContain( 'SNP-003' )
    } )

    test( 'missing source path yields SNP-005', async () => {
        const result = await SourceSnapshot.create( {
            sourcePath: join( tempRoot, 'does-not-exist.mjs' ),
            gradingDataRoot: join( tempRoot, 'gradingdata-6' ),
            namespace: 'test',
            schemaVersion: '1.0.0',
            schemaHash: 'a1b2c3d4'
        } )
        expect( result.errors[ 0 ] ).toContain( 'SNP-005' )
    } )
} )


describe( 'SourceSnapshot.listForNamespace', () => {
    test( 'returns sorted snapshots', async () => {
        const root = join( tempRoot, 'gradingdata-list' )
        const nsDir = join( root, 'schemas', 'test' )
        await mkdir( nsDir, { recursive: true } )
        await writeFile( join( nsDir, 'aaaaaaaa--v1.0.0.mjs' ), 'export const main = { version: "4.0.0" }' )
        await writeFile( join( nsDir, 'bbbbbbbb--v1.0.0.mjs' ), 'export const main = { version: "4.0.0" }' )

        const result = await SourceSnapshot.listForNamespace( { gradingDataRoot: root, namespace: 'test' } )
        expect( result.errors ).toEqual( [] )
        expect( result.snapshots.length ).toBe( 2 )
        expect( result.snapshots[ 0 ].hash ).toBe( 'aaaaaaaa' )
        expect( result.snapshots[ 1 ].hash ).toBe( 'bbbbbbbb' )
    } )

    test( 'empty when directory does not exist', async () => {
        const r = await SourceSnapshot.listForNamespace( { gradingDataRoot: '/no/such/path', namespace: 'x' } )
        expect( r.snapshots ).toEqual( [] )
    } )
} )


describe( 'SourceSnapshot.verify', () => {
    test( 'valid snapshot — recomputed hash matches filename', async () => {
        const root = join( tempRoot, 'gradingdata-verify' )
        const nsDir = join( root, 'schemas', 'test' )
        await mkdir( nsDir, { recursive: true } )

        // Build a real schema file whose hash will be computed
        const schemaObject = {
            version: '4.0.0',
            schemaVersion: '1.0.0',
            namespace: 'verify',
            name: 'sample',
            tools: {}
        }
        const hashResult = HashGenerator.computeSchemaHash( { schema: schemaObject } )
        const filename = `${hashResult.hash}--v1.0.0.mjs`
        const fileSource = `export const main = ${JSON.stringify( schemaObject )}`
        const fullPath = join( nsDir, filename )
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
