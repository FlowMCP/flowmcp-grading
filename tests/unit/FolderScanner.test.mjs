import { describe, test, expect, beforeAll, afterAll } from '@jest/globals'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { FolderScanner } from '../../src/FolderScanner.mjs'


let tempRoot = null


beforeAll( async () => {
    tempRoot = await mkdtemp( join( tmpdir(), 'folderscanner-' ) )
} )


afterAll( async () => {
    if( tempRoot !== null ) {
        await rm( tempRoot, { recursive: true, force: true } )
    }
} )


describe( 'FolderScanner.scan', () => {
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

    test( 'namespace without namespace.json → SCN-002', async () => {
        const root = join( tempRoot, 'missing-ns-json' )
        const nsDir = join( root, 'schemas', 'demo' )
        await mkdir( nsDir, { recursive: true } )
        const r = await FolderScanner.scan( { gradingDataRoot: root } )
        const has = r.issues.some( ( i ) => i.code === 'SCN-002' )
        expect( has ).toBe( true )
    } )

    test( 'orphan snapshot → SCN-004', async () => {
        const root = join( tempRoot, 'orphan' )
        const nsDir = join( root, 'schemas', 'demo' )
        await mkdir( nsDir, { recursive: true } )
        await writeFile( join( nsDir, 'namespace.json' ), JSON.stringify( { members: [ { schemaHash: 'aaaaaaaa' } ] } ), 'utf-8' )
        await writeFile( join( nsDir, 'bbbbbbbb--v1.0.0.mjs' ), 'export const main = { version: "4.0.0" }', 'utf-8' )

        const r = await FolderScanner.scan( { gradingDataRoot: root } )
        const has = r.issues.some( ( i ) => i.code === 'SCN-004' )
        expect( has ).toBe( true )
    } )

    test( 'dangling single-folder → SCN-007', async () => {
        const root = join( tempRoot, 'dangling-single' )
        // create only a single-folder, no namespace
        await mkdir( join( root, 'single', 'nope--tool' ), { recursive: true } )
        const r = await FolderScanner.scan( { gradingDataRoot: root } )
        const has = r.issues.some( ( i ) => i.code === 'SCN-007' )
        expect( has ).toBe( true )
    } )

    test( 'selection without selection.json → SCN-008', async () => {
        const root = join( tempRoot, 'dangling-selection' )
        await mkdir( join( root, 'selection', 'demo' ), { recursive: true } )
        const r = await FolderScanner.scan( { gradingDataRoot: root } )
        const has = r.issues.some( ( i ) => i.code === 'SCN-008' )
        expect( has ).toBe( true )
    } )
} )


describe( 'FolderScanner.checkSelectionFolder', () => {
    test( 'reports SCN-009 when lockfile missing', async () => {
        const root = join( tempRoot, 'selfolder-lockmissing' )
        const selDir = join( root, 'selection', 'demo' )
        await mkdir( selDir, { recursive: true } )
        await writeFile( join( selDir, 'selection.json' ), JSON.stringify( { members: [] } ), 'utf-8' )

        const r = await FolderScanner.checkSelectionFolder( { gradingDataRoot: root, selectionId: 'demo' } )
        const has = r.issues.some( ( i ) => i.code === 'SCN-009' )
        expect( has ).toBe( true )
    } )
} )
