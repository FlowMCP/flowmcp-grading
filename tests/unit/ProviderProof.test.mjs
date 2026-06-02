import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import { mkdtemp, rm, writeFile, mkdir, readFile, readdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Ajv from 'ajv'

import { ProviderProof, PROVIDER_PROOF_VERSION, PROVIDER_PROOF_FILENAME } from '../../src/ProviderProof.mjs'


// All filesystem activity is confined to an OS temp dir created per test.
// NEVER writes to ~/.flowmcp or any user home (test isolation).
let tempRoot = null
let providerDir = null


const gradedIndex = () => {
    return {
        indexVersion: 2,
        namespace: 'openmeteo',
        updatedAt: '2026-06-02T00-00-00.000Z',
        status: 'operational',
        grade: 'A',
        summary: { schemas: 1, tools: 1 },
        about: { status: 'graded', grade: 'A' },
        description: { status: 'graded', grade: 'A' },
        skills: {},
        namespaceAggregate: { status: 'graded', grade: 'A', ref: 'providers/openmeteo/_gradings/x.json' },
        schemas: {
            openMeteoForecast: { status: 'stable', grade: 'A', tools: {}, toolsAggregate: { status: 'stable' } }
        },
        blockers: []
    }
}


const blockedOnlyIndex = () => {
    return {
        indexVersion: 2,
        namespace: 'openmeteo',
        updatedAt: '2026-06-02T00-00-00.000Z',
        status: 'blocked',
        grade: 'F',
        summary: { schemas: 0 },
        about: { status: 'pending' },
        description: { status: 'pending' },
        skills: {},
        namespaceAggregate: { status: 'blocked', reason: 'validation-failed' },
        schemas: {
            openMeteoAirQuality: { status: 'blocked', reason: 'validation-failed: bad schema' }
        },
        blockers: [
            { node: 'schemas.openMeteoAirQuality', reason: 'validation-failed: bad schema' }
        ]
    }
}


beforeEach( async () => {
    tempRoot = await mkdtemp( join( tmpdir(), 'flowmcp-providerproof-' ) )
    providerDir = join( tempRoot, 'providers', 'openmeteo' )
    await mkdir( providerDir, { recursive: true } )
} )


afterEach( async () => {
    if( tempRoot !== null ) { await rm( tempRoot, { recursive: true, force: true } ) }
    tempRoot = null
    providerDir = null
} )


const readProof = async ( dir ) => {
    const content = await readFile( join( dir, PROVIDER_PROOF_FILENAME ), 'utf-8' )
    return JSON.parse( content )
}


describe( 'ProviderProof.write', () => {
    test( 'T1 — graded namespace produces a complete proof with grade', async () => {
        const result = await ProviderProof.write( { namespaceIndex: gradedIndex(), providerDir } )

        expect( result.status ).toBe( true )
        expect( result.errors ).toEqual( [] )
        expect( result.proofPath ).toBe( join( providerDir, 'grade.json' ) )

        const proof = await readProof( providerDir )
        expect( proof.proofVersion ).toBe( PROVIDER_PROOF_VERSION )
        expect( proof.namespace ).toBe( 'openmeteo' )
        expect( proof.status ).toBe( 'operational' )
        expect( proof.namespaceAggregate.grade ).toBe( 'A' )
        expect( proof.schemas.openMeteoForecast.status ).toBe( 'stable' )
        expect( proof.schemas.openMeteoForecast.grade ).toBe( 'A' )
        expect( typeof proof.generatedAt ).toBe( 'string' )
    } )


    test( 'T2 — emit-on-failure: blocked-only namespace still produces a proof', async () => {
        const result = await ProviderProof.write( { namespaceIndex: blockedOnlyIndex(), providerDir } )

        expect( result.status ).toBe( true )
        const proof = await readProof( providerDir )
        expect( proof.status ).toBe( 'blocked' )
        expect( proof.schemas.openMeteoAirQuality.status ).toBe( 'blocked' )
        expect( proof.schemas.openMeteoAirQuality.reason ).toContain( 'validation-failed' )
        expect( proof.blockers.length ).toBeGreaterThan( 0 )
        expect( proof.blockers[ 0 ].node ).toBe( 'schemas.openMeteoAirQuality' )
    } )


    test( 'T3a — namespaceAggregate copied verbatim when graded', async () => {
        const idx = gradedIndex()
        await ProviderProof.write( { namespaceIndex: idx, providerDir } )
        const proof = await readProof( providerDir )

        expect( proof.namespaceAggregate.status ).toBe( idx.namespaceAggregate.status )
        expect( proof.namespaceAggregate.grade ).toBe( idx.namespaceAggregate.grade )
        expect( proof.namespaceAggregate.ref ).toBe( idx.namespaceAggregate.ref )
    } )


    test( 'T3b — namespaceAggregate grade omitted when blocked/pending', async () => {
        await ProviderProof.write( { namespaceIndex: blockedOnlyIndex(), providerDir } )
        const proof = await readProof( providerDir )

        expect( proof.namespaceAggregate.status ).toBe( 'blocked' )
        expect( proof.namespaceAggregate.grade ).toBeUndefined()
    } )


    test( 'T-projection — producer never recomputes grade (projection only)', async () => {
        // Feed an aggregate whose grade is deliberately inconsistent with the
        // per-schema grades. A projection copies it verbatim; a recompute would
        // "fix" it. We assert the verbatim copy => no recomputation.
        const idx = gradedIndex()
        idx.namespaceAggregate = { status: 'graded', grade: 'D' }
        idx.schemas.openMeteoForecast.grade = 'A'

        await ProviderProof.write( { namespaceIndex: idx, providerDir } )
        const proof = await readProof( providerDir )

        expect( proof.namespaceAggregate.grade ).toBe( 'D' )
        expect( proof.schemas.openMeteoForecast.grade ).toBe( 'A' )
    } )


    test( 'T4 — monitoring backref null on first write', async () => {
        await ProviderProof.write( { namespaceIndex: gradedIndex(), providerDir } )
        const proof = await readProof( providerDir )

        expect( proof.monitoring ).toBeDefined()
        expect( proof.monitoring.githubIssue ).toBeNull()
        expect( proof.monitoring.boardColumn ).toBeNull()
    } )


    test( 'T5 — monitoring backref preserved on re-run (idempotency)', async () => {
        // Pre-seed grade.json with sync-written non-null backrefs.
        const seeded = {
            proofVersion: 1,
            namespace: 'openmeteo',
            generatedAt: '2026-06-01T00:00:00.000Z',
            status: 'pending',
            namespaceAggregate: { status: 'pending' },
            schemas: {},
            blockers: [],
            monitoring: { githubIssue: 4242, boardColumn: 'Blocked' }
        }
        await writeFile( join( providerDir, 'grade.json' ), JSON.stringify( seeded, null, 4 ), 'utf-8' )

        const result = await ProviderProof.write( { namespaceIndex: gradedIndex(), providerDir } )
        expect( result.status ).toBe( true )

        const proof = await readProof( providerDir )
        // Backref preserved...
        expect( proof.monitoring.githubIssue ).toBe( 4242 )
        expect( proof.monitoring.boardColumn ).toBe( 'Blocked' )
        // ...while the rest is recomputed from the fresh index.
        expect( proof.status ).toBe( 'operational' )
        expect( proof.schemas.openMeteoForecast.status ).toBe( 'stable' )
    } )


    test( 'T5b — partial preservation: keep non-null, default null for the other', async () => {
        const seeded = {
            proofVersion: 1,
            namespace: 'openmeteo',
            generatedAt: '2026-06-01T00:00:00.000Z',
            status: 'pending',
            namespaceAggregate: { status: 'pending' },
            schemas: {},
            blockers: [],
            monitoring: { githubIssue: 7, boardColumn: null }
        }
        await writeFile( join( providerDir, 'grade.json' ), JSON.stringify( seeded, null, 4 ), 'utf-8' )

        await ProviderProof.write( { namespaceIndex: gradedIndex(), providerDir } )
        const proof = await readProof( providerDir )

        expect( proof.monitoring.githubIssue ).toBe( 7 )
        expect( proof.monitoring.boardColumn ).toBeNull()
    } )


    test( 'T6 — validation rejects bad input (no file written)', async () => {
        const noNamespace = gradedIndex()
        delete noNamespace.namespace
        const r1 = await ProviderProof.write( { namespaceIndex: noNamespace, providerDir } )
        expect( r1.status ).toBe( false )
        expect( r1.errors.some( ( e ) => e.startsWith( 'PRF-001' ) ) ).toBe( true )

        const noBlockers = gradedIndex()
        delete noBlockers.blockers
        const r2 = await ProviderProof.write( { namespaceIndex: noBlockers, providerDir } )
        expect( r2.status ).toBe( false )
        expect( r2.errors.some( ( e ) => e.startsWith( 'PRF-002' ) ) ).toBe( true )

        const r3 = await ProviderProof.write( { namespaceIndex: gradedIndex(), providerDir: 123 } )
        expect( r3.status ).toBe( false )
        expect( r3.errors.some( ( e ) => e.startsWith( 'PRF-002' ) ) ).toBe( true )

        const r4 = await ProviderProof.write( { namespaceIndex: gradedIndex(), providerDir: '' } )
        expect( r4.status ).toBe( false )
        expect( r4.errors.some( ( e ) => e.startsWith( 'PRF-003' ) ) ).toBe( true )

        const r5 = await ProviderProof.write( { namespaceIndex: null, providerDir } )
        expect( r5.status ).toBe( false )
        expect( r5.errors.some( ( e ) => e.startsWith( 'PRF-001' ) ) ).toBe( true )

        // No grade.json written for any of the rejected calls.
        const entries = await readdir( providerDir )
        expect( entries ).not.toContain( 'grade.json' )
    } )


    test( 'T7 — only grade.json is written (no island / schema mutation)', async () => {
        // Seed an unrelated marker file; assert it is untouched and ONLY grade.json appears.
        await writeFile( join( providerDir, 'marker.txt' ), 'keep', 'utf-8' )
        await ProviderProof.write( { namespaceIndex: gradedIndex(), providerDir } )

        const entries = ( await readdir( providerDir ) ).sort()
        expect( entries ).toEqual( [ 'grade.json', 'marker.txt' ] )
        const marker = await readFile( join( providerDir, 'marker.txt' ), 'utf-8' )
        expect( marker ).toBe( 'keep' )
    } )


    test( 'T8 — produced proof validates against the monitoring backref schema', async () => {
        await ProviderProof.write( { namespaceIndex: blockedOnlyIndex(), providerDir } )
        const proof = await readProof( providerDir )

        // Canonical shape is published by flowmcp-spec grading/3.0.0 ($defs.monitoring).
        // Validate against the live spec when the sibling repo is checked out (local dev);
        // otherwise fall back to this committed snapshot so the unit suite stays
        // self-contained in CI (where only this repo is checked out). Never skipped.
        const snapshotMonitoringSchema = {
            type: 'object',
            properties: {
                githubIssue: { type: [ 'integer', 'null' ] },
                boardColumn: { type: [ 'string', 'null' ] }
            },
            additionalProperties: false
        }
        const schemaPath = new URL(
            '../../../flowmcp-spec/grading/3.0.0/index.schema.json',
            import.meta.url
        )
        const monitoringSchema = await readFile( schemaPath, 'utf-8' )
            .then( ( raw ) => JSON.parse( raw ).$defs.monitoring )
            .catch( () => snapshotMonitoringSchema )

        expect( monitoringSchema ).toBeDefined()

        const ajv = new Ajv( { strict: false } )
        const validate = ajv.compile( monitoringSchema )
        const ok = validate( proof.monitoring )
        expect( ok ).toBe( true )

        // null placeholders are schema-legal.
        expect( validate( { githubIssue: null, boardColumn: null } ) ).toBe( true )
        // sync-written values are schema-legal.
        expect( validate( { githubIssue: 4242, boardColumn: 'Blocked' } ) ).toBe( true )
    } )
} )
