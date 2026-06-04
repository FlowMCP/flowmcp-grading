import { describe, test, expect, beforeAll, afterAll } from '@jest/globals'
import { mkdtemp, rm, readdir, readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { DeterministicAreaMapper } from '../../src/DeterministicAreaMapper.mjs'
import { AreaScorer } from '../../src/harness/AreaScorer.mjs'
import { RebuildIndex } from '../../src/RebuildIndex.mjs'
import { ProviderProof } from '../../src/ProviderProof.mjs'


// End-to-end proof of the deterministic full-structure wiring WITHOUT the CLI / network:
// mapper -> AreaScorer.writeEntry -> RebuildIndex.rebuildNamespaceIndex ->
// ProviderProof.write, on a throwaway temp island. Asserts the three previously
// missing levels (_gradings/, index.json, grade.json) appear, are spec-shaped,
// and that a re-grade is additive (audit-trail), never an overwrite.

const NS = 'brightsky'
const SCHEMA = 'bright-sky'

const writeEntries = async ( { providersRoot, recordedAt, validateStatus = true } ) => {
    const pretest = {
        ok: true,
        keyGated: false,
        perTool: {
            getCurrentWeather: { working: 3, total: 3, bar: 2, parameterless: false, class: 'normal', level: 'data-analyzable' },
            getWeather: { working: 1, total: 1, bar: 2, parameterless: false, class: 'needs-tests', level: 'reachable' }
        },
        results: [], errors: []
    }
    const mapped = DeterministicAreaMapper.mapSchema( {
        namespace: NS, schemaId: SCHEMA, main: {}, validate: { status: validateStatus }, pretest, recordedAt
    } )
    expect( mapped.errors ).toEqual( [] )
    const written = []
    await mapped.entries.reduce( ( promise, item ) => promise.then( async () => {
        const { dir, errors } = AreaScorer.resolveGradingsDir( {
            providersRoot, ns: NS, schemaId: SCHEMA, tool: item.tool === null ? undefined : item.tool, area: item.area
        } )
        expect( errors ).toEqual( [] )
        const res = await AreaScorer.writeEntry( { entry: item.entry, gradingsDir: dir, area: item.area, timestamp: recordedAt } )
        if( res.written === true ) { written.push( res.path ) }
    } ), Promise.resolve() )
    return { written, entryCount: mapped.entries.length }
}


describe( 'deterministic full-structure wiring (mapper -> writeEntry -> rebuild -> proof)', () => {
    let root
    let providersRoot
    let exportRoot

    beforeAll( async () => {
        root = await mkdtemp( join( tmpdir(), 'det-wiring-' ) )
        providersRoot = join( root, 'island', 'providers' )
        exportRoot = join( root, 'export' )
    } )

    afterAll( async () => {
        if( root !== undefined ) { await rm( root, { recursive: true, force: true } ) }
    } )

    test( 'first grade writes _gradings/, index.json and grade.json', async () => {
        const { written, entryCount } = await writeEntries( { providersRoot, recordedAt: '2026-06-04T10-00-00Z' } )
        // 2 tools -> 2 single-test entries + 1 tools-aggregate-schema entry = 3
        expect( entryCount ).toBe( 3 )
        expect( written.length ).toBe( 3 )

        // _gradings/ present at tool level and schema level
        const toolGradings = join( providersRoot, NS, SCHEMA, 'tools', 'getCurrentWeather', '_gradings' )
        const schemaGradings = join( providersRoot, NS, SCHEMA, '_gradings' )
        expect( existsSync( toolGradings ) ).toBe( true )
        expect( existsSync( schemaGradings ) ).toBe( true )
        expect( ( await readdir( toolGradings ) ).some( ( f ) => f.startsWith( 'single-test--' ) ) ).toBe( true )
        expect( ( await readdir( schemaGradings ) ).some( ( f ) => f.startsWith( 'tools-aggregate-schema--' ) ) ).toBe( true )

        // rebuild namespace index.json
        const namespaceDir = join( providersRoot, NS )
        const rebuilt = await RebuildIndex.rebuildNamespaceIndex( { namespaceDir } )
        expect( rebuilt.status ).toBe( true )
        expect( existsSync( join( namespaceDir, 'index.json' ) ) ).toBe( true )
        expect( rebuilt.index.indexVersion ).toBe( 2 )
        // the graded tool surfaces a grade in the rollup
        const graded = rebuilt.index.schemas?.[ SCHEMA ]?.tools?.getCurrentWeather
        expect( graded ).toBeDefined()
        expect( [ 'graded', 'stable' ] ).toContain( graded.status )
        expect( typeof graded.grade ).toBe( 'string' )

        // provider-proof grade.json
        const providerDir = join( exportRoot, 'providers', NS )
        const proof = await ProviderProof.write( { namespaceIndex: rebuilt.index, providerDir } )
        expect( proof.status ).toBe( true )
        expect( existsSync( join( providerDir, 'grade.json' ) ) ).toBe( true )
        const grade = JSON.parse( await readFile( join( providerDir, 'grade.json' ), 'utf8' ) )
        expect( typeof grade.proofVersion ).toBe( 'number' )   // integer per fixed index.schema.json
        expect( grade.namespace ).toBe( NS )
    } )

    test( 're-grade with a later timestamp is ADDITIVE (audit trail), never an overwrite', async () => {
        const toolGradings = join( providersRoot, NS, SCHEMA, 'tools', 'getCurrentWeather', '_gradings' )
        const before = ( await readdir( toolGradings ) ).filter( ( f ) => f.startsWith( 'single-test--' ) )
        await writeEntries( { providersRoot, recordedAt: '2026-06-04T11-00-00Z' } )
        const after = ( await readdir( toolGradings ) ).filter( ( f ) => f.startsWith( 'single-test--' ) )
        expect( after.length ).toBe( before.length + 1 )    // additive
        // index still rebuilds cleanly and picks the newest (resolveLatest)
        const rebuilt = await RebuildIndex.rebuildNamespaceIndex( { namespaceDir: join( providersRoot, NS ) } )
        expect( rebuilt.status ).toBe( true )
    } )

    test( 'same-timestamp re-write is a benign NO-OVERWRITE (ASC-010), not data loss', async () => {
        const toolGradings = join( providersRoot, NS, SCHEMA, 'tools', 'getCurrentWeather', '_gradings' )
        const before = ( await readdir( toolGradings ) ).length
        // reuse an already-written timestamp
        const { dir } = AreaScorer.resolveGradingsDir( { providersRoot, ns: NS, schemaId: SCHEMA, tool: 'getCurrentWeather', area: 'single-test' } )
        const entry = { area: 'single-test', grade: 'B', aggregateGrade: 'B', gradings: [] }
        const res = await AreaScorer.writeEntry( { entry, gradingsDir: dir, area: 'single-test', timestamp: '2026-06-04T10-00-00Z' } )
        expect( res.written ).toBe( false )
        expect( res.errors.some( ( e ) => e.includes( 'ASC-010' ) ) ).toBe( true )
        const after = ( await readdir( toolGradings ) ).length
        expect( after ).toBe( before )   // nothing added, nothing lost
    } )
} )
