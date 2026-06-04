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


// A schema module that parses cleanly but declares NO namespace, so it fails the
// structural gate (IMP-002) and yields zero usable namespaces → foldername
// fallback. A genuine syntax-error module is avoided because jest's experimental
// ESM loader rethrows a SyntaxError that escapes the import try/catch; the
// no-namespace module exercises the same fallback seam deterministically.
const noNamespaceSource = ( { name } ) => `export const main = {
    version: 'flowmcp/4.0.0',
    name: ${JSON.stringify( name )},
    tools: {
        foo: { method: 'GET', path: '/foo', description: 'fetch foo' }
    }
}
`


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
    test( 'structural gate rejecting all schemas emits a blocked node (PRD-001 AC-1/AC-2), not an abort', async () => {
        // A schema with no tools fails #structuralValidate (IMP-002). With every
        // schema failing the gate, the namespace must still become visible as a
        // `blocked/validation-failed` node — NOT a silent abort (emit-on-failure).
        const noTools = `export const main = { version: 'flowmcp/4.0.0', namespace: 'etherscan', name: 'getA', tools: {} }
`
        await writeFile( join( providerPath, 'getA.mjs' ), noTools, 'utf-8' )
        const result = await GradingImport.run( { providerPath, gradingDataRoot } )
        // AC-1: emits a blocked outcome explicitly; does not abort.
        expect( result.status ).toBe( true )
        expect( result.blocked ).toBe( true )
        // AC-2: reason category is validation-failed; original IMP-002 detail survives.
        expect( result.blockedReason ).toBe( 'validation-failed' )
        expect( result.errors.some( ( e ) => e.includes( 'IMP-002' ) && e.includes( 'tools' ) ) ).toBe( true )
        // AC-5: index.json exists, rollup blocked, non-empty blockers[].
        expect( result.indexPath ).not.toBeNull()
        const index = JSON.parse( await readFile( result.indexPath, 'utf-8' ) )
        expect( index.status ).toBe( 'blocked' )
        expect( index.blockers.length ).toBeGreaterThan( 0 )
    } )

    test( 'an injected CLI gate that always fails is honoured and yields a blocked emit (gate-agnostic seam)', async () => {
        await writeFile( join( providerPath, 'getA.mjs' ), schemaSource( { namespace: 'etherscan', name: 'getA' } ), 'utf-8' )
        const validateGate = () => ( { valid: false, errors: [ 'IMP-002: injected gate rejected' ] } )
        const result = await GradingImport.run( { providerPath, gradingDataRoot, validateGate } )
        // The injected gate fails every schema → emit-on-failure (PRD-001 AC-1d).
        expect( result.status ).toBe( true )
        expect( result.blocked ).toBe( true )
        expect( result.blockedReason ).toBe( 'validation-failed' )
        expect( result.errors.some( ( e ) => e.includes( 'injected gate rejected' ) ) ).toBe( true )
        const index = JSON.parse( await readFile( result.indexPath, 'utf-8' ) )
        expect( index.status ).toBe( 'blocked' )
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


describe( 'GradingImport.run — human-readable name vs path slug (regression: defillama)', () => {
    test( 'schema with a spaced human-readable name imports; folder uses the filename slug', async () => {
        // Real production schemas (e.g. defillama) carry human-readable names
        // with spaces ("DeFi Llama Historical Prices"). The schema FOLDER must be
        // the filename slug (prices), never the human-readable name.
        await writeFile(
            join( providerPath, 'prices.mjs' ),
            schemaSource( { namespace: 'etherscan', name: 'DeFi Llama Historical Prices' } ),
            'utf-8'
        )

        const result = await GradingImport.run( { providerPath, gradingDataRoot } )

        expect( result.status ).toBe( true )
        expect( result.imported.length ).toBe( 1 )
        expect( result.imported[ 0 ].schema ).toBe( 'prices' )
        expect( result.imported[ 0 ].name ).toBe( 'DeFi Llama Historical Prices' )
        // Folder is the slug, not the spaced name.
        expect( await dirExists( join( gradingDataRoot, 'providers', 'etherscan', 'prices' ) ) ).toBe( true )
        expect( await dirExists( join( gradingDataRoot, 'providers', 'etherscan', 'DeFi Llama Historical Prices' ) ) ).toBe( false )
    } )

    test( 'a filename that is not a safe slug is rejected with IMP-003', async () => {
        await writeFile(
            join( providerPath, 'has space.mjs' ),
            schemaSource( { namespace: 'etherscan', name: 'Whatever' } ),
            'utf-8'
        )
        const result = await GradingImport.run( { providerPath, gradingDataRoot } )
        expect( result.status ).toBe( false )
        expect( result.errors.some( ( e ) => e.includes( 'IMP-003' ) && e.includes( 'slug' ) ) ).toBe( true )
    } )
} )


// ----- PRD-002 — foldername-fallback + disagreement + namespace constraint -----

describe( 'GradingImport.run — foldername-fallback (PRD-002)', () => {
    test( 'all-unparsable folder falls back to basename and emits a blocked node', async () => {
        // A folder named `weird-provider` whose only .mjs declares no namespace:
        // it fails the structural gate (IMP-002), zero schemas load, no namespace
        // can be read → fallback to the folder base name; emit a blocked node.
        const weird = join( tempRoot, 'weird-provider' )
        await mkdir( weird, { recursive: true } )
        await writeFile( join( weird, 'broken.mjs' ), noNamespaceSource( { name: 'getX' } ), 'utf-8' )

        const result = await GradingImport.run( { providerPath: weird, gradingDataRoot } )
        expect( result.status ).toBe( true )
        expect( result.blocked ).toBe( true )
        expect( result.fallbackUsed ).toBe( true )
        expect( result.namespace ).toBe( 'weird-provider' )
        // AC-7: index.json.namespace === basename === fallbackName.
        const index = JSON.parse( await readFile( result.indexPath, 'utf-8' ) )
        expect( index.namespace ).toBe( 'weird-provider' )
        expect( index.status ).toBe( 'blocked' )
    } )

    test( 'a valid module declaring no namespace falls back to the folder base name', async () => {
        const noNs = join( tempRoot, 'fallbackns' )
        await mkdir( noNs, { recursive: true } )
        const src = `export const main = { version: 'flowmcp/4.0.0', name: 'getX', tools: { foo: { method: 'GET', path: '/foo', description: 'd' } } }
`
        await writeFile( join( noNs, 'getX.mjs' ), src, 'utf-8' )

        const result = await GradingImport.run( { providerPath: noNs, gradingDataRoot } )
        // The schema has no namespace → it fails the structural gate (IMP-002),
        // zero schemas load, fallback to folder name, blocked emit.
        expect( result.status ).toBe( true )
        expect( result.blocked ).toBe( true )
        expect( result.fallbackUsed ).toBe( true )
        expect( result.namespace ).toBe( 'fallbackns' )
    } )

    test( 'two distinct valid namespaces still abort with IMP-005 (disagreement, not fallback)', async () => {
        await writeFile( join( providerPath, 'getA.mjs' ), schemaSource( { namespace: 'etherscan', name: 'getA' } ), 'utf-8' )
        await writeFile( join( providerPath, 'getB.mjs' ), schemaSource( { namespace: 'polygonscan', name: 'getB' } ), 'utf-8' )

        const result = await GradingImport.run( { providerPath, gradingDataRoot } )
        expect( result.status ).toBe( false )
        expect( result.errors.some( ( e ) => e.includes( 'IMP-005' ) && e.includes( 'single-namespace' ) ) ).toBe( true )
        expect( result.indexPath ).toBeNull()
    } )

    test( 'a folder base name that violates the namespace regex is reported (IMP-006), not silently normalised', async () => {
        // Uppercase + underscore folder name fails /^[a-z][a-z0-9-]*$/.
        const bad = join( tempRoot, 'Weird_Provider' )
        await mkdir( bad, { recursive: true } )
        await writeFile( join( bad, 'broken.mjs' ), noNamespaceSource( { name: 'getX' } ), 'utf-8' )

        const result = await GradingImport.run( { providerPath: bad, gradingDataRoot } )
        expect( result.status ).toBe( false )
        expect( result.errors.some( ( e ) => e.includes( 'IMP-006' ) ) ).toBe( true )
        // No silent normalisation: no Weird_Provider / weird-provider folder created.
        expect( await dirExists( join( gradingDataRoot, 'providers', 'Weird_Provider' ) ) ).toBe( false )
        expect( await dirExists( join( gradingDataRoot, 'providers', 'weird-provider' ) ) ).toBe( false )
    } )
} )


describe( 'GradingImport.assertFolderNamespaceConsistency — §09 invariant (single seam)', () => {
    test( 'folder name equal to declared namespace is valid', () => {
        const r = GradingImport.assertFolderNamespaceConsistency( { folderName: 'etherscan', declaredNamespace: 'etherscan', fallbackUsed: false } )
        expect( r.valid ).toBe( true )
        expect( r.errors ).toEqual( [] )
    } )

    test( 'folder name differing from declared namespace (no fallback) is an IMP-007 violation', () => {
        const r = GradingImport.assertFolderNamespaceConsistency( { folderName: 'tmp-ns', declaredNamespace: 'realns', fallbackUsed: false } )
        expect( r.valid ).toBe( false )
        expect( r.errors.some( ( e ) => e.includes( 'IMP-007' ) ) ).toBe( true )
    } )

    test( 'the fallback case is the explicit exception (folder IS the namespace by construction)', () => {
        const r = GradingImport.assertFolderNamespaceConsistency( { folderName: 'weird-provider', declaredNamespace: 'realns', fallbackUsed: true } )
        expect( r.valid ).toBe( true )
    } )
} )


describe( 'GradingImport.run — rename-later (PRD-002 AC-4)', () => {
    test( 'a fallback folder is renamed once when a real namespace is later declared', async () => {
        const src = join( tempRoot, 'tmp-ns' )
        await mkdir( src, { recursive: true } )
        // First import: schema with no namespace → fallback folder providers/tmp-ns.
        await writeFile( join( src, 'getA.mjs' ), noNamespaceSource( { name: 'getA' } ), 'utf-8' )
        const first = await GradingImport.run( { providerPath: src, gradingDataRoot } )
        expect( first.status ).toBe( true )
        expect( first.fallbackUsed ).toBe( true )
        expect( await dirExists( join( gradingDataRoot, 'providers', 'tmp-ns' ) ) ).toBe( true )

        // Second import: replace with a schema that parses and declares `realns`.
        await rm( join( src, 'getA.mjs' ), { force: true } )
        await writeFile( join( src, 'getA.mjs' ), schemaSource( { namespace: 'realns', name: 'getA' } ), 'utf-8' )
        const second = await GradingImport.run( { providerPath: src, gradingDataRoot } )
        expect( second.status ).toBe( true )
        expect( second.renamedFrom ).toBe( 'tmp-ns' )
        // Island folder renamed; tmp-ns is gone, realns exists.
        expect( await dirExists( join( gradingDataRoot, 'providers', 'tmp-ns' ) ) ).toBe( false )
        expect( await dirExists( join( gradingDataRoot, 'providers', 'realns' ) ) ).toBe( true )
        const index = JSON.parse( await readFile( second.indexPath, 'utf-8' ) )
        expect( index.namespace ).toBe( 'realns' )

        // Third import (names already reconciled on the island, providerPath still
        // tmp-ns but no providers/tmp-ns folder remains): no-op, idempotent.
        const third = await GradingImport.run( { providerPath: src, gradingDataRoot } )
        expect( third.status ).toBe( true )
        expect( third.renamedFrom ).toBeNull()
        expect( await dirExists( join( gradingDataRoot, 'providers', 'realns' ) ) ).toBe( true )
    } )

    test( 'rename-later refuses to clobber an existing differing target (IMP-008)', async () => {
        const src = join( tempRoot, 'tmp-ns' )
        await mkdir( src, { recursive: true } )
        await writeFile( join( src, 'getA.mjs' ), noNamespaceSource( { name: 'getA' } ), 'utf-8' )
        const first = await GradingImport.run( { providerPath: src, gradingDataRoot } )
        expect( first.fallbackUsed ).toBe( true )

        // Pre-create a conflicting providers/realns folder with different content.
        await mkdir( join( gradingDataRoot, 'providers', 'realns' ), { recursive: true } )
        await writeFile( join( gradingDataRoot, 'providers', 'realns', 'sentinel.txt' ), 'do not clobber', 'utf-8' )

        await rm( join( src, 'getA.mjs' ), { force: true } )
        await writeFile( join( src, 'getA.mjs' ), schemaSource( { namespace: 'realns', name: 'getA' } ), 'utf-8' )
        const second = await GradingImport.run( { providerPath: src, gradingDataRoot } )
        expect( second.status ).toBe( false )
        expect( second.errors.some( ( e ) => e.includes( 'IMP-008' ) ) ).toBe( true )
        // The fallback folder and the conflicting target are both untouched.
        expect( await dirExists( join( gradingDataRoot, 'providers', 'tmp-ns' ) ) ).toBe( true )
        const sentinel = await readFile( join( gradingDataRoot, 'providers', 'realns', 'sentinel.txt' ), 'utf-8' )
        expect( sentinel ).toBe( 'do not clobber' )
    } )
} )


// ----- PRD-001 — integrity invariant: blocked never stable -----

describe( 'GradingImport — blocked-never-stable integrity (PRD-001 AC-6)', () => {
    test( 'an all-blocked namespace rolls up blocked and never operational/stable, idempotently', async () => {
        const noTools = `export const main = { version: 'flowmcp/4.0.0', namespace: 'etherscan', name: 'getA', tools: {} }
`
        await writeFile( join( providerPath, 'getA.mjs' ), noTools, 'utf-8' )

        const first = await GradingImport.run( { providerPath, gradingDataRoot } )
        expect( first.blocked ).toBe( true )
        const index1 = JSON.parse( await readFile( first.indexPath, 'utf-8' ) )
        expect( index1.status ).toBe( 'blocked' )
        expect( index1.status ).not.toBe( 'operational' )
        expect( index1.status ).not.toBe( 'stable' )
        // The description node (carrier of the blocked record) stays blocked.
        expect( index1.description.status ).toBe( 'blocked' )

        // Re-import (rebuild) is idempotent: still blocked, never promoted.
        const second = await GradingImport.run( { providerPath, gradingDataRoot } )
        expect( second.blocked ).toBe( true )
        const index2 = JSON.parse( await readFile( second.indexPath, 'utf-8' ) )
        expect( index2.status ).toBe( 'blocked' )
        expect( index2.description.status ).toBe( 'blocked' )
    } )
} )


describe( 'GradingImport.run — sharedLists snapshot', () => {
    const listSource = ( { version } ) => `export const list = {
    meta: { name: 'evmChains', version: ${JSON.stringify( version )} },
    entries: [ { name: 'Ethereum', alchemyNetworkSlug: 'eth-mainnet', etherscanAlias: 'ETHEREUM_MAINNET', isTestnet: false } ]
}
`
    const sharedListsExtra = `sharedLists: [ { ref: 'evmChains', version: '3.1.0' } ]`


    test( 'copies the referenced _lists file into providers/<ns>/<schema>/_lists/ so the island is self-contained', async () => {
        // Source layout: tempRoot/_lists/evm-chains.mjs is found by the up-walk
        // from tempRoot/etherscan/getA.mjs (mirrors the real schemas/v4.0.0 layout).
        await mkdir( join( tempRoot, '_lists' ), { recursive: true } )
        await writeFile( join( tempRoot, '_lists', 'evm-chains.mjs' ), listSource( { version: '3.1.0' } ), 'utf-8' )
        await writeFile( join( providerPath, 'getA.mjs' ), schemaSource( { namespace: 'etherscan', name: 'getA', extra: sharedListsExtra } ), 'utf-8' )

        const result = await GradingImport.run( { providerPath, gradingDataRoot } )
        expect( result.status ).toBe( true )
        expect( result.errors ).toEqual( [] )

        const islandList = join( gradingDataRoot, 'providers', 'etherscan', 'getA', '_lists', 'evm-chains.mjs' )
        const copied = await readFile( islandList, 'utf-8' )
        expect( copied ).toContain( "name: 'evmChains'" )

        // The _lists sibling lives at the schema-folder level and is NOT promoted
        // to a schema by the namespace-level scan (it would break the index).
        const indexJson = JSON.parse( await readFile( result.indexPath, 'utf-8' ) )
        expect( Object.keys( indexJson.schemas ) ).toContain( 'getA' )
        expect( Object.keys( indexJson.schemas ) ).not.toContain( '_lists' )
    } )


    test( 'is idempotent — a second import does not rewrite an identical island list', async () => {
        await mkdir( join( tempRoot, '_lists' ), { recursive: true } )
        await writeFile( join( tempRoot, '_lists', 'evm-chains.mjs' ), listSource( { version: '3.1.0' } ), 'utf-8' )
        await writeFile( join( providerPath, 'getA.mjs' ), schemaSource( { namespace: 'etherscan', name: 'getA', extra: sharedListsExtra } ), 'utf-8' )

        const first = await GradingImport.run( { providerPath, gradingDataRoot } )
        expect( first.status ).toBe( true )
        const islandList = join( gradingDataRoot, 'providers', 'etherscan', 'getA', '_lists', 'evm-chains.mjs' )
        const mtime1 = ( await stat( islandList ) ).mtimeMs

        const second = await GradingImport.run( { providerPath, gradingDataRoot } )
        expect( second.status ).toBe( true )
        const mtime2 = ( await stat( islandList ) ).mtimeMs
        expect( mtime2 ).toBe( mtime1 )
    } )


    test( 'surfaces IMP-009 (no silent default) when a declared shared list is absent at the source', async () => {
        // The schema declares sharedLists but there is NO _lists dir anywhere above
        // the source file → the dependency cannot be snapshotted.
        await writeFile( join( providerPath, 'getA.mjs' ), schemaSource( { namespace: 'etherscan', name: 'getA', extra: sharedListsExtra } ), 'utf-8' )

        const result = await GradingImport.run( { providerPath, gradingDataRoot } )
        expect( result.status ).toBe( false )
        const hasImp009 = result.errors.some( ( e ) => e.includes( 'IMP-009' ) )
        expect( hasImp009 ).toBe( true )
    } )
} )
