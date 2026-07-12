import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
    RebuildIndex,
    REBUILD_INDEX_VERSION,
    NODE_STATUSES,
    ROLLUP_STATUSES
} from '../../src/RebuildIndex.mjs'


let tempRoot = null


const writeJson = async ( { path, json } ) => {
    await writeFile( path, JSON.stringify( json, null, 4 ), 'utf-8' )
}


beforeAll( async () => {
    tempRoot = await mkdtemp( join( tmpdir(), 'rebuildindex-' ) )
} )


afterAll( async () => {
    if( tempRoot !== null ) {
        await rm( tempRoot, { recursive: true, force: true } )
    }
} )


describe( 'RebuildIndex.resolveLatest (B2 date-before-hash)', () => {
    test( 'picks the newest primitive when date sits before the hash', async () => {
        const dir = join( tempRoot, 'resolve-primitive' )
        await mkdir( dir, { recursive: true } )
        // Newer date, but a hash that sorts EARLIER than the older file's hash.
        // Date-before-hash guarantees sort().at(-1) is still the newest.
        await writeFile( join( dir, 'prices--2026-05-29T10-00-00Z--ffffffff.mjs' ), 'old', 'utf-8' )
        await writeFile( join( dir, 'prices--2026-05-31T10-00-00Z--00000000.mjs' ), 'new', 'utf-8' )

        const result = await RebuildIndex.resolveLatest( { dir, logicalName: 'prices' } )
        expect( result.status ).toBe( true )
        expect( result.file ).toBe( 'prices--2026-05-31T10-00-00Z--00000000.mjs' )
    } )

    test( 'picks the newest grading entry (timestamp last, no hash)', async () => {
        const dir = join( tempRoot, 'resolve-grading' )
        await mkdir( dir, { recursive: true } )
        await writeFile( join( dir, 'single-test--2026-05-30T09-00-00Z.json' ), '{}', 'utf-8' )
        await writeFile( join( dir, 'single-test--2026-05-31T09-00-00Z.json' ), '{}', 'utf-8' )

        const result = await RebuildIndex.resolveLatest( { dir, logicalName: 'single-test' } )
        expect( result.status ).toBe( true )
        expect( result.file ).toBe( 'single-test--2026-05-31T09-00-00Z.json' )
    } )

    test( 'empty result yields explicit no-version (no silent default)', async () => {
        const dir = join( tempRoot, 'resolve-empty' )
        await mkdir( dir, { recursive: true } )
        const result = await RebuildIndex.resolveLatest( { dir, logicalName: 'nothing' } )
        expect( result.status ).toBe( false )
        expect( result.reason ).toBe( 'no-version' )
        expect( result.file ).toBeNull()
    } )

    test( 'missing dir yields no-version, not a throw', async () => {
        const result = await RebuildIndex.resolveLatest( { dir: join( tempRoot, 'does-not-exist' ), logicalName: 'x' } )
        expect( result.status ).toBe( false )
        expect( result.reason ).toBe( 'no-version' )
    } )

    test( 'missing input yields invalid-input', async () => {
        const result = await RebuildIndex.resolveLatest( { dir: join( tempRoot, 'x' ) } )
        expect( result.status ).toBe( false )
        expect( result.reason ).toBe( 'invalid-input' )
        expect( result.errors[ 0 ] ).toContain( 'IDX-001' )
    } )

    test( 'prefix is anchored — does not match a longer logical name', async () => {
        const dir = join( tempRoot, 'resolve-prefix' )
        await mkdir( dir, { recursive: true } )
        await writeFile( join( dir, 'prices-detail--2026-05-31T10-00-00Z--00000000.mjs' ), 'x', 'utf-8' )
        const result = await RebuildIndex.resolveLatest( { dir, logicalName: 'prices' } )
        expect( result.status ).toBe( false )
    } )
} )


describe( 'RebuildIndex.mapAggregateGradeToStatus (5-status, no silent default)', () => {
    test( 'REJECTED maps to rejected', () => {
        const result = RebuildIndex.mapAggregateGradeToStatus( { aggregateGrade: 'REJECTED' } )
        expect( result.status ).toBe( 'rejected' )
        expect( result.errors ).toEqual( [] )
    } )

    test( 'A/B/C/F map to graded', () => {
        [ 'A', 'B', 'C', 'F' ]
            .forEach( ( g ) => {
                expect( RebuildIndex.mapAggregateGradeToStatus( { aggregateGrade: g } ).status ).toBe( 'graded' )
            } )
    } )

    test( 'unknown grade errors instead of defaulting', () => {
        const result = RebuildIndex.mapAggregateGradeToStatus( { aggregateGrade: 'Z' } )
        expect( result.status ).toBeNull()
        expect( result.errors[ 0 ] ).toContain( 'IDX-007' )
    } )

    test( 'missing aggregateGrade errors', () => {
        const result = RebuildIndex.mapAggregateGradeToStatus( {} )
        expect( result.status ).toBeNull()
        expect( result.errors[ 0 ] ).toContain( 'IDX-001' )
    } )
} )


describe( 'RebuildIndex.rebuildNamespaceIndex (rollup + 5-status)', () => {
    let nsDir = null

    beforeAll( async () => {
        // providers/defillama/
        //   _gradings/tools-aggregate-namespace--…json  (B)
        //   prices/
        //     schema/prices--…--93baef35.mjs
        //     _gradings/tools-aggregate-schema--…json   (B)
        //     resources/about/_gradings/about-namespace--…json (B)
        //     tools/getFirstPrice/_gradings/single-test--…json (stable, A)
        //   coins/  (no gradings -> pending)
        nsDir = join( tempRoot, 'providers', 'defillama' )

        await mkdir( join( nsDir, '_gradings' ), { recursive: true } )
        await writeJson( {
            path: join( nsDir, '_gradings', 'tools-aggregate-namespace--2026-05-31T11-22-00Z.json' ),
            json: { area: 'tools-aggregate-namespace', grade: 'B' }
        } )
        // namespace-description shares the <ns>/_gradings/ dir with the namespace
        // aggregate, distinguished only by the logicalName prefix.
        await writeJson( {
            path: join( nsDir, '_gradings', 'namespace-description--2026-05-31T11-22-00Z.json' ),
            json: { area: 'namespace-description', grade: 'B' }
        } )

        const pricesDir = join( nsDir, 'prices' )
        await mkdir( join( pricesDir, 'schema' ), { recursive: true } )
        await writeFile( join( pricesDir, 'schema', 'prices--2026-05-30T19-44-23Z--93baef35.mjs' ), 'export const main = {}', 'utf-8' )

        await mkdir( join( pricesDir, '_gradings' ), { recursive: true } )
        await writeJson( {
            path: join( pricesDir, '_gradings', 'tools-aggregate-schema--2026-05-31T11-20-00Z.json' ),
            json: { area: 'tools-aggregate-schema', grade: 'B' }
        } )

        await mkdir( join( pricesDir, 'resources', 'about', '_gradings' ), { recursive: true } )
        await writeJson( {
            path: join( pricesDir, 'resources', 'about', '_gradings', 'about-namespace--2026-05-31T11-20-00Z.json' ),
            json: { area: 'about-namespace', grade: 'B' }
        } )

        await mkdir( join( pricesDir, 'tools', 'getFirstPrice', '_gradings' ), { recursive: true } )
        await writeJson( {
            path: join( pricesDir, 'tools', 'getFirstPrice', '_gradings', 'single-test--2026-05-31T11-05-00Z.json' ),
            json: { area: 'single-test', status: 'stable', grade: 'A' }
        } )

        // namespace-skills is schemaId+skill scoped: <ns>/<schema>/skills/<skill>/_gradings/
        await mkdir( join( pricesDir, 'skills', 'summarisePrices', '_gradings' ), { recursive: true } )
        await writeJson( {
            path: join( pricesDir, 'skills', 'summarisePrices', '_gradings', 'namespace-skills--2026-05-31T11-25-00Z.json' ),
            json: { area: 'namespace-skills', grade: 'B' }
        } )

        await mkdir( join( nsDir, 'coins' ), { recursive: true } )
    } )

    test( 'produces a rollup with status partial and the prices schema graded', async () => {
        const result = await RebuildIndex.rebuildNamespaceIndex( { namespaceDir: nsDir } )
        expect( result.errors ).toEqual( [] )
        expect( result.status ).toBe( true )

        const index = result.index
        expect( index.indexVersion ).toBe( REBUILD_INDEX_VERSION )
        expect( index.namespace ).toBe( 'defillama' )
        expect( ROLLUP_STATUSES ).toContain( index.status )
        expect( index.status ).toBe( 'partial' )

        expect( index.about.status ).toBe( 'graded' )
        expect( index.about.grade ).toBe( 'B' )
        expect( index.namespaceAggregate.status ).toBe( 'graded' )

        // all 6 areas roll up: description node + skills subtree (no data loss)
        expect( index.description.status ).toBe( 'graded' )
        expect( index.description.grade ).toBe( 'B' )
        expect( index.skills[ 'prices.summarisePrices' ].status ).toBe( 'graded' )
        expect( index.skills[ 'prices.summarisePrices' ].grade ).toBe( 'B' )
        expect( index.summary.description ).toBe( 'graded' )
        expect( index.summary.skills ).toBe( 1 )

        expect( index.schemas.prices.status ).toBe( 'graded' )
        expect( index.schemas.prices.snapshot.hash ).toBe( '93baef35' )
        expect( index.schemas.prices.toolsAggregate.boundTo ).toBe( '93baef35' )
        expect( index.schemas.prices.tools.getFirstPrice.status ).toBe( 'stable' )
        expect( NODE_STATUSES ).toContain( index.schemas.prices.tools.getFirstPrice.status )

        expect( index.schemas.coins.status ).toBe( 'pending' )
        const coinsBlocker = index.blockers.find( ( b ) => b.node === 'schemas.coins' )
        expect( coinsBlocker ).toBeDefined()
    } )

    test( 'writes index.json to disk and it is re-readable', async () => {
        const result = await RebuildIndex.rebuildNamespaceIndex( { namespaceDir: nsDir } )
        const raw = await readFile( result.indexPath, 'utf-8' )
        const parsed = JSON.parse( raw )
        expect( parsed.namespace ).toBe( 'defillama' )
    } )

    test( 'maps a REJECTED tool grading to node status rejected', async () => {
        const rejNs = join( tempRoot, 'providers', 'vetoed' )
        const toolGradings = join( rejNs, 'badschema', 'tools', 'evilTool', '_gradings' )
        await mkdir( toolGradings, { recursive: true } )
        await writeJson( {
            path: join( toolGradings, 'single-test--2026-05-31T12-00-00Z.json' ),
            json: { area: 'single-test', aggregateGrade: 'REJECTED' }
        } )
        const result = await RebuildIndex.rebuildNamespaceIndex( { namespaceDir: rejNs } )
        expect( result.status ).toBe( true )
        expect( result.index.schemas.badschema.tools.evilTool.status ).toBe( 'rejected' )
        expect( result.index.schemas.badschema.status ).toBe( 'rejected' )
        expect( result.index.status ).toBe( 'rejected' )
    } )

    test( 'missing namespaceDir yields IDX-006', async () => {
        const result = await RebuildIndex.rebuildNamespaceIndex( { namespaceDir: join( tempRoot, 'providers', 'ghost' ) } )
        expect( result.status ).toBe( false )
        expect( result.errors[ 0 ] ).toContain( 'IDX-006' )
    } )

    // PRD-001 AC-5: a no-grade blocked record flows through #gradingToNode.
    test( 'a blocked/validation-failed namespace-description record rolls up blocked', async () => {
        const blockedNs = join( tempRoot, 'providers', 'blockedns' )
        await mkdir( join( blockedNs, '_gradings' ), { recursive: true } )
        await writeJson( {
            path: join( blockedNs, '_gradings', 'namespace-description--2026-06-02T09-00-00Z.json' ),
            json: { area: 'namespace-description', blocked: true, blockedReason: 'validation-failed' }
        } )

        const result = await RebuildIndex.rebuildNamespaceIndex( { namespaceDir: blockedNs } )
        expect( result.status ).toBe( true )
        // #gradingToNode maps blocked:true -> { status:'blocked', reason }.
        expect( result.index.description.status ).toBe( 'blocked' )
        expect( result.index.description.reason ).toBe( 'validation-failed' )
        // rollup is blocked (no graded/stable, a blocker present).
        expect( result.index.status ).toBe( 'blocked' )
        const blocker = result.index.blockers.find( ( b ) => b.reason === 'validation-failed' )
        expect( blocker ).toBeDefined()
    } )
} )


describe( 'RebuildIndex.rebuildSelectionIndex (member manifest + frozen lockSnapshot)', () => {
    let selDir = null
    let providersRoot = null

    beforeAll( async () => {
        providersRoot = join( tempRoot, 'providers' )

        selDir = join( tempRoot, 'selections', 'crypto-pilot' )
        await mkdir( join( selDir, 'selection' ), { recursive: true } )
        await writeJson( {
            path: join( selDir, 'selection', 'crypto-pilot--2026-05-31T10-00-00Z--abcdef12.json' ),
            json: {
                selectionId: 'crypto-pilot',
                namespace: 'crypto',
                name: 'Crypto Pilot',
                version: 'flowmcp/4.0.0',
                whenToUse: 'when grading crypto',
                personaIds: [ 'crypto-trader' ],
                members: [
                    { schemaId: 'defillama.prices' },
                    { schemaId: 'ghostns.coins' }
                ]
            }
        } )

        await mkdir( join( selDir, 'resources', 'about', '_gradings' ), { recursive: true } )
        await writeJson( {
            path: join( selDir, 'resources', 'about', '_gradings', 'about-selection--2026-05-31T10-05-00Z.json' ),
            json: { area: 'about-selection', grade: 'B' }
        } )

        await mkdir( join( selDir, '_gradings' ), { recursive: true } )
        await writeJson( {
            path: join( selDir, '_gradings', 'selection-aggregate--2026-05-31T10-10-00Z.json' ),
            json: { area: 'selection-aggregate', grade: 'B' }
        } )
    } )

    test( 'builds the member-resolution manifest (SEL003)', async () => {
        const result = await RebuildIndex.rebuildSelectionIndex( { selectionDir: selDir, providersRoot } )
        expect( result.errors ).toEqual( [] )
        expect( result.status ).toBe( true )

        const index = result.index
        expect( index.selectionId ).toBe( 'crypto-pilot' )
        expect( index.members[ 'defillama.prices' ] ).toBeDefined()
        // defillama/prices exists in providers/ from the namespace test
        expect( index.members[ 'defillama.prices' ].resolvedArtifact ).toContain( 'defillama/prices/schema/prices--' )
        expect( index.members[ 'defillama.prices' ].status ).toBe( 'graded' )
        // ghostns.coins is not imported -> pending + blocker
        expect( index.members[ 'ghostns.coins' ].status ).toBe( 'pending' )
        const coinsBlocker = index.blockers.find( ( b ) => b.node === 'members.ghostns.coins' )
        expect( coinsBlocker ).toBeDefined()
    } )

    test( 'writes a frozen lockSnapshot on first build with ex-lockfile fields', async () => {
        const result = await RebuildIndex.rebuildSelectionIndex( { selectionDir: selDir, providersRoot } )
        const lock = result.index.lockSnapshot
        expect( lock ).toBeDefined()
        expect( lock.selectionId ).toBe( 'crypto-pilot' )
        expect( typeof lock.generatedAt ).toBe( 'string' )
        expect( Array.isArray( lock.members ) ).toBe( true )
        const pricesMember = lock.members.find( ( m ) => m.schemaId === 'defillama.prices' )
        expect( pricesMember ).toBeDefined()
        expect( NODE_STATUSES ).toContain( pricesMember.gradingStatus )
        expect( pricesMember ).toHaveProperty( 'override' )
    } )

    test( 'preserves the frozen lockSnapshot byte-for-byte across rebuild', async () => {
        const first = await RebuildIndex.rebuildSelectionIndex( { selectionDir: selDir, providersRoot } )
        const frozenAt = first.index.lockSnapshot.generatedAt

        // mutate live state: add a new about grading (changes the live rollup)
        await writeJson( {
            path: join( selDir, 'resources', 'about', '_gradings', 'about-selection--2026-05-31T18-00-00Z.json' ),
            json: { area: 'about-selection', grade: 'A' }
        } )

        const second = await RebuildIndex.rebuildSelectionIndex( { selectionDir: selDir, providersRoot } )
        // live part changed
        expect( second.index.about.grade ).toBe( 'A' )
        // frozen part preserved
        expect( second.index.lockSnapshot.generatedAt ).toBe( frozenAt )
        expect( second.index.lockSnapshot ).toEqual( first.index.lockSnapshot )
    } )
} )


describe( 'RebuildIndex.buildLockSnapshot (salvaged from SelectionLockfile)', () => {
    test( 'reproduces the ex-lockfile fields and validates overrides', () => {
        const result = RebuildIndex.buildLockSnapshot( {
            selectionDef: { selectionId: 'sel-a', selectionVersion: '1.0.0', selectionHash: 'aabbccdd' },
            members: [
                { schemaId: 'ns.a', schemaVersion: '1.0.0', schemaHash: '11223344', gradingStatus: 'stable', override: { name: 'Pretty' } }
            ]
        } )
        expect( result.errors ).toEqual( [] )
        expect( result.lockSnapshot.selectionId ).toBe( 'sel-a' )
        expect( result.lockSnapshot.selectionHash ).toBe( 'aabbccdd' )
        expect( result.lockSnapshot.members[ 0 ].gradingStatus ).toBe( 'stable' )
        expect( result.lockSnapshot.members[ 0 ].override.name ).toBe( 'Pretty' )
    } )

    test( 'rejects an unknown gradingStatus (no silent default)', () => {
        const result = RebuildIndex.buildLockSnapshot( {
            selectionDef: { selectionId: 'sel-b' },
            members: [ { schemaId: 'ns.b', gradingStatus: 'whatever' } ]
        } )
        expect( result.lockSnapshot ).toBeNull()
        expect( result.errors[ 0 ] ).toContain( 'ns.b' )
    } )

    test( 'rejects an invalid override key', () => {
        const result = RebuildIndex.buildLockSnapshot( {
            selectionDef: { selectionId: 'sel-c' },
            members: [ { schemaId: 'ns.c', gradingStatus: 'pending', override: { evil: 'x' } } ]
        } )
        expect( result.lockSnapshot ).toBeNull()
        expect( result.errors[ 0 ] ).toContain( 'LCK-005' )
    } )

    test( 'missing selectionId errors', () => {
        const result = RebuildIndex.buildLockSnapshot( { selectionDef: {}, members: [] } )
        expect( result.lockSnapshot ).toBeNull()
        expect( result.errors[ 0 ] ).toContain( 'LCK-001' )
    } )
} )


describe( 'RebuildIndex.validateIndex (indexVersion 2 + rollup vocab)', () => {
    test( 'valid namespace index passes', () => {
        const result = RebuildIndex.validateIndex( {
            index: {
                indexVersion: 2,
                namespace: 'x',
                status: 'partial',
                updatedAt: '2026-05-31T12-00-00Z',
                description: { status: 'pending' },
                skills: {}
            }
        } )
        expect( result.valid ).toBe( true )
    } )

    test( 'rejects a namespace index missing description/skills', () => {
        const result = RebuildIndex.validateIndex( {
            index: { indexVersion: 2, namespace: 'x', status: 'partial', updatedAt: 'x' }
        } )
        expect( result.valid ).toBe( false )
        expect( result.errors.some( ( e ) => e.includes( 'index.description' ) ) ).toBe( true )
        expect( result.errors.some( ( e ) => e.includes( 'index.skills' ) ) ).toBe( true )
    } )

    test( 'accepts an empty skills subtree but rejects a bad skill node status', () => {
        const ok = RebuildIndex.validateIndex( {
            index: {
                indexVersion: 2, namespace: 'x', status: 'partial', updatedAt: 'x',
                description: { status: 'graded' }, skills: {}
            }
        } )
        expect( ok.valid ).toBe( true )
        const bad = RebuildIndex.validateIndex( {
            index: {
                indexVersion: 2, namespace: 'x', status: 'partial', updatedAt: 'x',
                description: { status: 'graded' }, skills: { 'a.b': { status: 'made-up' } }
            }
        } )
        expect( bad.valid ).toBe( false )
        expect( bad.errors.some( ( e ) => e.includes( 'index.skills.a.b' ) ) ).toBe( true )
    } )

    test( 'rejects indexVersion 1', () => {
        const result = RebuildIndex.validateIndex( {
            index: { indexVersion: 1, namespace: 'x', status: 'partial', updatedAt: 'x' }
        } )
        expect( result.valid ).toBe( false )
        expect( result.errors.some( ( e ) => e.includes( 'IDX-003' ) ) ).toBe( true )
    } )

    test( 'rejects a node-status value used as rollup status', () => {
        const result = RebuildIndex.validateIndex( {
            index: { indexVersion: 2, namespace: 'x', status: 'graded', updatedAt: 'x' }
        } )
        expect( result.valid ).toBe( false )
        expect( result.errors.some( ( e ) => e.includes( 'IDX-007' ) ) ).toBe( true )
    } )
} )


describe( 'RebuildIndex re-grade hash-invalidation (PRD-006 Kap. 6.5)', () => {
    test( 'a changed schemaHash falls the schema node to pending on the next rebuild', async () => {
        const nsDir = join( tempRoot, 'providers', 'hashinval' )
        const schemaDir = join( nsDir, 'prices' )
        await mkdir( join( schemaDir, 'schema' ), { recursive: true } )
        // Original snapshot bound to hash aaaaaaaa.
        await writeFile( join( schemaDir, 'schema', 'prices--2026-05-30T19-44-23Z--aaaaaaaa.mjs' ), 'export const main = {}', 'utf-8' )
        await mkdir( join( schemaDir, '_gradings' ), { recursive: true } )
        await writeJson( {
            path: join( schemaDir, '_gradings', 'tools-aggregate-schema--2026-05-31T11-20-00Z.json' ),
            json: { area: 'tools-aggregate-schema', grade: 'B' }
        } )

        const first = await RebuildIndex.rebuildNamespaceIndex( { namespaceDir: nsDir } )
        expect( first.status ).toBe( true )
        expect( first.index.schemas.prices.snapshot.hash ).toBe( 'aaaaaaaa' )
        expect( first.index.schemas.prices.toolsAggregate.boundTo ).toBe( 'aaaaaaaa' )
        expect( first.index.schemas.prices.status ).toBe( 'graded' )

        // A doctor fix produces a NEWER snapshot with a DIFFERENT hash; the prior
        // grade is now bound to a stale hash.
        await writeFile( join( schemaDir, 'schema', 'prices--2026-06-01T08-00-00Z--bbbbbbbb.mjs' ), 'export const main = { changed: true }', 'utf-8' )

        const second = await RebuildIndex.rebuildNamespaceIndex( { namespaceDir: nsDir } )
        expect( second.status ).toBe( true )
        expect( second.index.schemas.prices.status ).toBe( 'pending' )
        expect( second.index.schemas.prices.reason ).toBe( 'schema changed, regrade required' )
    } )

    test( 'an unchanged schemaHash keeps the bound grade on rebuild', async () => {
        const nsDir = join( tempRoot, 'providers', 'hashstable' )
        const schemaDir = join( nsDir, 'prices' )
        await mkdir( join( schemaDir, 'schema' ), { recursive: true } )
        await writeFile( join( schemaDir, 'schema', 'prices--2026-05-30T19-44-23Z--cccccccc.mjs' ), 'export const main = {}', 'utf-8' )
        await mkdir( join( schemaDir, '_gradings' ), { recursive: true } )
        await writeJson( {
            path: join( schemaDir, '_gradings', 'tools-aggregate-schema--2026-05-31T11-20-00Z.json' ),
            json: { area: 'tools-aggregate-schema', grade: 'B' }
        } )

        await RebuildIndex.rebuildNamespaceIndex( { namespaceDir: nsDir } )
        const second = await RebuildIndex.rebuildNamespaceIndex( { namespaceDir: nsDir } )
        expect( second.index.schemas.prices.status ).toBe( 'graded' )
        expect( second.index.schemas.prices.toolsAggregate.boundTo ).toBe( 'cccccccc' )
    } )
} )


describe( 'RebuildIndex testDepth dimension', () => {
    test( 'projects DataPretest summary.json perTool.level onto the tool node as testDepth', async () => {
        const nsDir = join( tempRoot, 'providers', 'depthns' )
        const schemaDir = join( nsDir, 'prices' )

        await mkdir( join( schemaDir, 'schema' ), { recursive: true } )
        await writeFile( join( schemaDir, 'schema', 'prices--2026-05-30T19-44-23Z--dddddddd.mjs' ), 'export const main = {}', 'utf-8' )

        // A deterministic single-test grading so the tool node is built.
        await mkdir( join( schemaDir, 'tools', 'getFirstPrice', '_gradings' ), { recursive: true } )
        await writeJson( {
            path: join( schemaDir, 'tools', 'getFirstPrice', '_gradings', 'single-test--2026-05-31T11-05-00Z.json' ),
            json: { area: 'single-test', status: 'stable', grade: 'A' }
        } )

        // The DataPretest summary carries the per-tool Test-Leiter rung.
        await writeJson( {
            path: join( schemaDir, 'summary.json' ),
            json: { namespace: 'depthns', schemaFile: 'prices', ok: true, perTool: { getFirstPrice: { working: 2, total: 2, level: 'schema-validatable' } } }
        } )

        const result = await RebuildIndex.rebuildNamespaceIndex( { namespaceDir: nsDir } )
        expect( result.errors ).toEqual( [] )
        const toolNode = result.index.schemas.prices.tools.getFirstPrice
        // testDepth is a DETERMINISTIC dimension surfaced alongside the grade — it
        // does not alter the node status (the grade still drives the rollup).
        expect( toolNode.testDepth ).toBe( 'schema-validatable' )
        expect( toolNode.status ).toBe( 'stable' )
    } )


    test( 'omits testDepth (no guess) when no DataPretest summary exists', async () => {
        const nsDir = join( tempRoot, 'providers', 'nodepthns' )
        const schemaDir = join( nsDir, 'prices' )

        await mkdir( join( schemaDir, 'schema' ), { recursive: true } )
        await writeFile( join( schemaDir, 'schema', 'prices--2026-05-30T19-44-23Z--eeeeeeee.mjs' ), 'export const main = {}', 'utf-8' )
        await mkdir( join( schemaDir, 'tools', 'getFirstPrice', '_gradings' ), { recursive: true } )
        await writeJson( {
            path: join( schemaDir, 'tools', 'getFirstPrice', '_gradings', 'single-test--2026-05-31T11-05-00Z.json' ),
            json: { area: 'single-test', status: 'stable', grade: 'A' }
        } )

        const result = await RebuildIndex.rebuildNamespaceIndex( { namespaceDir: nsDir } )
        const toolNode = result.index.schemas.prices.tools.getFirstPrice
        expect( Object.prototype.hasOwnProperty.call( toolNode, 'testDepth' ) ).toBe( false )
    } )
} )
