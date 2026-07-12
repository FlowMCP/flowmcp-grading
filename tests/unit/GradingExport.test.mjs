import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import { mkdtemp, rm, writeFile, mkdir, readdir, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SourceSnapshot } from '../../src/SourceSnapshot.mjs'
import { RebuildIndex } from '../../src/RebuildIndex.mjs'
import { GradingExport } from '../../src/GradingExport.mjs'


// All filesystem activity is confined to an OS temp dir created per test.
// NEVER writes to ~/.flowmcp or any user home (test isolation).
let tempRoot = null
let gradingDataRoot = null


const schemaSource = ( { namespace, name } ) => {
    return `export const main = {
    version: 'flowmcp/4.0.0',
    namespace: ${JSON.stringify( namespace )},
    name: ${JSON.stringify( name )},
    tools: {
        foo: { method: 'GET', path: '/foo', description: 'fetch foo' }
    }
}
`
}


// Build a minimal namespace island directly from the live primitives the retired
// island-import path used to compose: one source snapshot per schema +
// rebuildNamespaceIndex for the index.json. No dependency on any import writer.
const seedNamespaceIsland = async () => {
    const sourceFile = join( tempRoot, 'getA.mjs' )
    await writeFile( sourceFile, schemaSource( { namespace: 'etherscan', name: 'getA' } ), 'utf-8' )

    const snap = await SourceSnapshot.create( {
        sourcePath: sourceFile,
        gradingDataRoot,
        namespace: 'etherscan',
        schemaName: 'getA',
        schemaHash: 'a1b2c3d4'
    } )
    expect( snap.created ).toBe( true )

    const namespaceDir = join( gradingDataRoot, 'providers', 'etherscan' )
    const idx = await RebuildIndex.rebuildNamespaceIndex( { namespaceDir } )
    expect( idx.status ).toBe( true )
    return namespaceDir
}


const pathExists = async ( path ) => {
    try { await stat( path ); return true }
    catch { return false }
}


beforeEach( async () => {
    tempRoot = await mkdtemp( join( tmpdir(), 'grading-export-' ) )
    gradingDataRoot = join( tempRoot, 'grading-data' )
} )


afterEach( async () => {
    if( tempRoot !== null ) {
        await rm( tempRoot, { recursive: true, force: true } )
    }
} )


describe( 'GradingExport.run — index.json is the primary hand-off', () => {
    test( 'writes index.json into a fresh export folder', async () => {
        const target = await seedNamespaceIsland()
        const exportDir = join( tempRoot, 'export-out' )

        const result = await GradingExport.run( { target, exportDir } )
        expect( result.status ).toBe( true )
        expect( result.flow ).toBe( 'namespace' )
        expect( result.indexExportPath ).toBe( join( exportDir, 'index.json' ) )

        const exported = JSON.parse( await readFile( result.indexExportPath, 'utf-8' ) )
        const source = JSON.parse( await readFile( join( target, 'index.json' ), 'utf-8' ) )
        expect( exported ).toEqual( source )
    } )
} )


describe( 'GradingExport.run — source is never overwritten', () => {
    test( 'a pre-existing export folder is a conflict (no overwrite)', async () => {
        const target = await seedNamespaceIsland()
        const exportDir = join( tempRoot, 'export-out' )
        await mkdir( exportDir, { recursive: true } )

        const result = await GradingExport.run( { target, exportDir } )
        expect( result.status ).toBe( false )
        expect( result.errors[ 0 ] ).toContain( 'EXP-003' )
    } )

    test( 'the island source snapshots are untouched after export', async () => {
        const target = await seedNamespaceIsland()
        const schemaDir = join( target, 'getA', 'schema' )
        const before = await readdir( schemaDir )
        const beforeContent = await readFile( join( schemaDir, before[ 0 ] ), 'utf-8' )

        const exportDir = join( tempRoot, 'export-out' )
        await GradingExport.run( { target, exportDir, includeSchemas: true } )

        const after = await readdir( schemaDir )
        expect( after ).toEqual( before )
        const afterContent = await readFile( join( schemaDir, before[ 0 ] ), 'utf-8' )
        expect( afterContent ).toBe( beforeContent )
    } )
} )


describe( 'GradingExport.run — optional stripped schema .mjs', () => {
    test( 'includeSchemas writes the schema under its clean logical name', async () => {
        const target = await seedNamespaceIsland()
        const exportDir = join( tempRoot, 'export-out' )

        const result = await GradingExport.run( { target, exportDir, includeSchemas: true } )
        expect( result.status ).toBe( true )
        expect( result.schemaExports.length ).toBe( 1 )

        const schemasOut = join( exportDir, 'schemas' )
        const files = await readdir( schemasOut )
        // Clean name — no internal --<ts>--<hash8> suffix.
        expect( files ).toContain( 'getA.mjs' )
        const matchInternal = files.some( ( f ) => /--\d{4}-\d{2}-\d{2}T/.test( f ) )
        expect( matchInternal ).toBe( false )
    } )

    test( 'without includeSchemas only index.json is handed off', async () => {
        const target = await seedNamespaceIsland()
        const exportDir = join( tempRoot, 'export-out' )

        const result = await GradingExport.run( { target, exportDir } )
        expect( result.status ).toBe( true )
        expect( result.schemaExports.length ).toBe( 0 )
        expect( await pathExists( join( exportDir, 'schemas' ) ) ).toBe( false )
    } )
} )


describe( 'GradingExport.run — flow detection + input validation', () => {
    test( 'a target without index.json yields EXP-005', async () => {
        const bare = join( gradingDataRoot, 'providers', 'empty', 'getX' )
        await mkdir( bare, { recursive: true } )
        const target = join( gradingDataRoot, 'providers', 'empty' )
        const result = await GradingExport.run( { target, exportDir: join( tempRoot, 'out' ) } )
        expect( result.status ).toBe( false )
        expect( result.errors[ 0 ] ).toContain( 'EXP-005' )
    } )

    test( 'missing target yields EXP-001', async () => {
        const result = await GradingExport.run( { exportDir: join( tempRoot, 'out' ) } )
        expect( result.status ).toBe( false )
        expect( result.errors[ 0 ] ).toContain( 'EXP-001' )
    } )
} )
