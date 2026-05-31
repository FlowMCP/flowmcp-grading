import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import { mkdtemp, rm, writeFile, mkdir, readdir, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { GradingImport } from '../../src/GradingImport.mjs'


// All filesystem activity is confined to an OS temp dir created per test.
// NEVER writes to ~/.flowmcp or any user home (test isolation).
let tempRoot = null
let providerPath = null
let gradingDataRoot = null


const schemaSource = ( { namespace, name, extra } ) => {
    const ext = extra === undefined ? '' : `,\n    ${extra}`
    return `export const main = {
    version: 'flowmcp/4.0.0',
    namespace: ${JSON.stringify( namespace )},
    name: ${JSON.stringify( name )},
    tools: {
        foo: { method: 'GET', path: '/foo', description: 'fetch foo' }
    }${ext}
}
`
}


beforeEach( async () => {
    tempRoot = await mkdtemp( join( tmpdir(), 'grading-import-' ) )
    providerPath = join( tempRoot, 'etherscan' )
    gradingDataRoot = join( tempRoot, 'grading-data' )
    await mkdir( providerPath, { recursive: true } )
} )


afterEach( async () => {
    if( tempRoot !== null ) {
        await rm( tempRoot, { recursive: true, force: true } )
    }
} )


const dirExists = async ( path ) => {
    try { return ( await stat( path ) ).isDirectory() }
    catch { return false }
}


describe( 'GradingImport.run — single-namespace assertion', () => {
    test( 'aborts when the folder declares two namespaces', async () => {
        await writeFile( join( providerPath, 'getA.mjs' ), schemaSource( { namespace: 'etherscan', name: 'getA' } ), 'utf-8' )
        await writeFile( join( providerPath, 'getB.mjs' ), schemaSource( { namespace: 'polygonscan', name: 'getB' } ), 'utf-8' )

        const result = await GradingImport.run( { providerPath, gradingDataRoot } )
        expect( result.status ).toBe( false )
        const hasAssert = result.errors.some( ( e ) => e.includes( 'IMP-005' ) && e.includes( 'single-namespace' ) )
        expect( hasAssert ).toBe( true )
        // No silent skip: it must not have created the index.
        expect( result.indexPath ).toBeNull()
    } )

    test( 'single namespace passes the assertion', async () => {
        await writeFile( join( providerPath, 'getA.mjs' ), schemaSource( { namespace: 'etherscan', name: 'getA' } ), 'utf-8' )
        const result = await GradingImport.run( { providerPath, gradingDataRoot } )
        expect( result.status ).toBe( true )
        expect( result.namespace ).toBe( 'etherscan' )
    } )
} )


describe( 'GradingImport.run — no-overwrite snapshots', () => {
    test( 'identical hash on a second import → skip (no new snapshot)', async () => {
        await writeFile( join( providerPath, 'getA.mjs' ), schemaSource( { namespace: 'etherscan', name: 'getA' } ), 'utf-8' )

        const first = await GradingImport.run( { providerPath, gradingDataRoot } )
        expect( first.status ).toBe( true )
        expect( first.imported.length ).toBe( 1 )

        const schemaDir = join( gradingDataRoot, 'providers', 'etherscan', 'getA', 'schema' )
        const afterFirst = await readdir( schemaDir )
        expect( afterFirst.length ).toBe( 1 )

        const second = await GradingImport.run( { providerPath, gradingDataRoot } )
        expect( second.status ).toBe( true )
        expect( second.skipped.length ).toBe( 1 )
        expect( second.imported.length ).toBe( 0 )

        const afterSecond = await readdir( schemaDir )
        expect( afterSecond.length ).toBe( 1 )
        // The original snapshot file is byte-for-byte unchanged (never overwritten).
        expect( afterSecond ).toEqual( afterFirst )
    } )

    test( 'changed content (new hash) → a new snapshot ALONGSIDE the old one', async () => {
        const sourceFile = join( providerPath, 'getA.mjs' )
        await writeFile( sourceFile, schemaSource( { namespace: 'etherscan', name: 'getA' } ), 'utf-8' )
        const first = await GradingImport.run( { providerPath, gradingDataRoot } )
        const firstHash = first.imported[ 0 ].hash

        // Change the schema content → new hash.
        await writeFile( sourceFile, schemaSource( { namespace: 'etherscan', name: 'getA', extra: `description: 'now with a description'` } ), 'utf-8' )
        const second = await GradingImport.run( { providerPath, gradingDataRoot } )
        expect( second.status ).toBe( true )
        expect( second.imported.length ).toBe( 1 )
        expect( second.imported[ 0 ].hash ).not.toBe( firstHash )

        const schemaDir = join( gradingDataRoot, 'providers', 'etherscan', 'getA', 'schema' )
        const files = await readdir( schemaDir )
        expect( files.length ).toBe( 2 )
        // Both hashes are present side by side — old not overwritten.
        const hashes = files.map( ( f ) => f.match( /--([0-9a-f]{8})\.mjs$/ )[ 1 ] )
        expect( hashes ).toContain( firstHash )
        expect( hashes ).toContain( second.imported[ 0 ].hash )
    } )
} )


describe( 'GradingImport.run — inline-skill normalisation (SEL004/F23)', () => {
    test( 'inline skill lands in skills/<skill>/ with provenance', async () => {
        const inlineExtra = `skills: [ { name: 'priceEntry', type: 'namespace', content: 'Use foo to fetch the price. Limitations: rate limited.' } ]`
        await writeFile( join( providerPath, 'getA.mjs' ), schemaSource( { namespace: 'etherscan', name: 'getA', extra: inlineExtra } ), 'utf-8' )

        const result = await GradingImport.run( { providerPath, gradingDataRoot } )
        expect( result.status ).toBe( true )
        expect( result.normalizedSkills.length ).toBe( 1 )

        const record = result.normalizedSkills[ 0 ]
        expect( record.skillName ).toBe( 'priceEntry' )
        expect( record.provenance.normalizedFrom ).toBe( 'inline' )
        expect( record.provenance.inlineBodyKey ).toBe( 'content' )

        const skillDir = join( gradingDataRoot, 'providers', 'etherscan', 'getA', 'skills', 'priceEntry' )
        expect( await dirExists( skillDir ) ).toBe( true )
        const files = await readdir( skillDir )
        expect( files.length ).toBe( 1 )
        expect( files[ 0 ] ).toMatch( /^priceEntry--\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z--[0-9a-f]{8}\.mjs$/ )

        const body = await readFile( join( skillDir, files[ 0 ] ), 'utf-8' )
        expect( body ).toContain( 'export const provenance' )
        expect( body ).toContain( 'normalizedFrom' )
        // The neutral body of the skill is captured, not the inline marker.
        expect( body ).toContain( 'rate limited' )
    } )
} )


describe( 'GradingImport.run — index.json rebuilt', () => {
    test( 'writes a derived index.json after import', async () => {
        await writeFile( join( providerPath, 'getA.mjs' ), schemaSource( { namespace: 'etherscan', name: 'getA' } ), 'utf-8' )
        const result = await GradingImport.run( { providerPath, gradingDataRoot } )
        expect( result.status ).toBe( true )
        expect( result.indexPath ).toBe( join( gradingDataRoot, 'providers', 'etherscan', 'index.json' ) )

        const raw = await readFile( result.indexPath, 'utf-8' )
        const index = JSON.parse( raw )
        expect( index.namespace ).toBe( 'etherscan' )
        expect( index.indexVersion ).toBe( 2 )
        expect( Object.keys( index.schemas ) ).toContain( 'getA' )
    } )
} )


describe( 'GradingImport.run — validate gate seam + input validation', () => {
    test( 'structural gate rejects a schema with no tools', async () => {
        const noTools = `export const main = { version: 'flowmcp/4.0.0', namespace: 'etherscan', name: 'getA', tools: {} }
`
        await writeFile( join( providerPath, 'getA.mjs' ), noTools, 'utf-8' )
        const result = await GradingImport.run( { providerPath, gradingDataRoot } )
        expect( result.status ).toBe( false )
        expect( result.errors.some( ( e ) => e.includes( 'IMP-002' ) && e.includes( 'tools' ) ) ).toBe( true )
    } )

    test( 'an injected CLI gate is honoured (seam for live flowmcp validate)', async () => {
        await writeFile( join( providerPath, 'getA.mjs' ), schemaSource( { namespace: 'etherscan', name: 'getA' } ), 'utf-8' )
        const validateGate = () => ( { valid: false, errors: [ 'IMP-002: injected gate rejected' ] } )
        const result = await GradingImport.run( { providerPath, gradingDataRoot, validateGate } )
        expect( result.status ).toBe( false )
        expect( result.errors[ 0 ] ).toContain( 'injected gate rejected' )
    } )

    test( 'missing providerPath yields IMP-001', async () => {
        const result = await GradingImport.run( { gradingDataRoot } )
        expect( result.status ).toBe( false )
        expect( result.errors[ 0 ] ).toContain( 'IMP-001' )
    } )

    test( 'empty folder yields IMP-001 (no .mjs found)', async () => {
        const result = await GradingImport.run( { providerPath, gradingDataRoot } )
        expect( result.status ).toBe( false )
        expect( result.errors.some( ( e ) => e.includes( 'IMP-001' ) ) ).toBe( true )
    } )
} )
