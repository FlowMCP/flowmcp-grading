import { describe, test, expect, beforeAll, afterAll } from '@jest/globals'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { FolderScanner } from '../../src/FolderScanner.mjs'
import { HashGenerator } from '../../src/HashGenerator.mjs'


let tempRoot = null


beforeAll( async () => {
    tempRoot = await mkdtemp( join( tmpdir(), 'folderscanner-' ) )
} )


afterAll( async () => {
    if( tempRoot !== null ) {
        await rm( tempRoot, { recursive: true, force: true } )
    }
} )


// Write a valid B2 snapshot whose filename hash matches the recomputed hash.
const writeValidSnapshot = async ( { root, namespace, schemaName, extraKeys } ) => {
    const schemaObject = Object.assign(
        { version: 'flowmcp/4.0.0', namespace, name: schemaName, tools: {} },
        extraKeys === undefined ? {} : extraKeys
    )
    const hash = HashGenerator.computeSchemaHash( { schema: schemaObject } ).hash
    const dir = join( root, 'providers', namespace, schemaName, 'schema' )
    await mkdir( dir, { recursive: true } )
    const fileSource = `export const main = ${JSON.stringify( schemaObject )}`
    await writeFile( join( dir, `${schemaName}--2026-05-30T10-15-00Z--${hash}.mjs` ), fileSource, 'utf-8' )
    return { hash }
}


describe( 'FolderScanner.scan (v2: providers/ + selections/ + shared-lists/)', () => {
    test( 'missing gradingDataRoot → SCN-001', async () => {
        const r = await FolderScanner.scan( { gradingDataRoot: '/no/such/path' } )
        const has = r.issues.some( ( i ) => i.code === 'SCN-001' )
        expect( has ).toBe( true )
    } )

    test( 'empty grading-data/ → empty summary', async () => {
        const root = join( tempRoot, 'empty' )
        await mkdir( root, { recursive: true } )
        const r = await FolderScanner.scan( { gradingDataRoot: root } )
        expect( r.summary.namespaces ).toBe( 0 )
        expect( r.summary.gaps ).toBe( 0 )
    } )

    test( 'a valid provider schema snapshot scans without errors and is counted', async () => {
        const root = join( tempRoot, 'valid-provider' )
        await writeValidSnapshot( { root, namespace: 'demo', schemaName: 'alpha' } )
        const r = await FolderScanner.scan( { gradingDataRoot: root } )
        expect( r.summary.namespaces ).toBe( 1 )
        expect( r.summary.schemas ).toBe( 1 )
        const errs = r.issues.filter( ( i ) => i.severity === 'error' )
        expect( errs.length ).toBe( 0 )
    } )

    test( 'hash mismatch in filename → SCN-005', async () => {
        const root = join( tempRoot, 'hash-mismatch' )
        const dir = join( root, 'providers', 'demo', 'alpha', 'schema' )
        await mkdir( dir, { recursive: true } )
        // filename claims hash deadbeef but content recomputes to something else
        const fileSource = `export const main = { version: 'flowmcp/4.0.0', namespace: 'demo', name: 'alpha', tools: {} }`
        await writeFile( join( dir, 'alpha--2026-05-30T10-15-00Z--deadbeef.mjs' ), fileSource, 'utf-8' )

        const r = await FolderScanner.scan( { gradingDataRoot: root } )
        const has = r.issues.some( ( i ) => i.code === 'SCN-005' )
        expect( has ).toBe( true )
    } )

    test( 'in-source hash leak → SCN-012 (neutral source must not carry schemaHash)', async () => {
        const root = join( tempRoot, 'hash-leak' )
        const dir = join( root, 'providers', 'demo', 'alpha', 'schema' )
        await mkdir( dir, { recursive: true } )
        // A neutral schema must NOT carry schemaHash in the source body.
        const fileSource = `export const main = { version: 'flowmcp/4.0.0', namespace: 'demo', name: 'alpha', schemaHash: 'a1b2c3d4', tools: {} }`
        await writeFile( join( dir, 'alpha--2026-05-30T10-15-00Z--a1b2c3d4.mjs' ), fileSource, 'utf-8' )

        const r = await FolderScanner.scan( { gradingDataRoot: root } )
        const has = r.issues.some( ( i ) => i.code === 'SCN-012' )
        expect( has ).toBe( true )
    } )

    test( 'selection folder without index.json → SCN-008', async () => {
        const root = join( tempRoot, 'dangling-selection' )
        await mkdir( join( root, 'selections', 'demo' ), { recursive: true } )
        const r = await FolderScanner.scan( { gradingDataRoot: root } )
        const has = r.issues.some( ( i ) => i.code === 'SCN-008' )
        expect( has ).toBe( true )
        expect( r.summary.selections ).toBe( 1 )
    } )
} )


describe( 'FolderScanner.checkSelectionFolder', () => {
    test( 'reports SCN-008 when index.json missing', async () => {
        const root = join( tempRoot, 'selfolder-no-index' )
        const selDir = join( root, 'selections', 'demo' )
        await mkdir( selDir, { recursive: true } )

        const r = await FolderScanner.checkSelectionFolder( { gradingDataRoot: root, selectionId: 'demo' } )
        const has = r.issues.some( ( i ) => i.code === 'SCN-008' )
        expect( has ).toBe( true )
    } )

    test( 'index.json present → no SCN-008', async () => {
        const root = join( tempRoot, 'selfolder-ok' )
        const selDir = join( root, 'selections', 'demo' )
        await mkdir( selDir, { recursive: true } )
        await writeFile( join( selDir, 'index.json' ), JSON.stringify( { indexVersion: 2, selectionId: 'demo' } ), 'utf-8' )

        const r = await FolderScanner.checkSelectionFolder( { gradingDataRoot: root, selectionId: 'demo' } )
        expect( r.issues ).toEqual( [] )
    } )
} )
