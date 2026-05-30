import { describe, test, expect, beforeAll, afterAll } from '@jest/globals'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ProjectIndex, INDEX_VERSION } from '../../src/ProjectIndex.mjs'


let tempRoot = null


beforeAll( async () => {
    tempRoot = await mkdtemp( join( tmpdir(), 'projectindex-' ) )
} )


afterAll( async () => {
    if( tempRoot !== null ) {
        await rm( tempRoot, { recursive: true, force: true } )
    }
} )


describe( 'ProjectIndex.init', () => {
    test( 'creates a fresh index with the default skeleton', async () => {
        const result = await ProjectIndex.init( { gradingDataRoot: tempRoot, projectName: 'fresh-project' } )
        expect( result.errors ).toEqual( [] )
        expect( result.created ).toBe( true )
        expect( result.index.indexVersion ).toBe( INDEX_VERSION )
        expect( result.index.projectName ).toBe( 'fresh-project' )
        expect( result.index.dataPretest ).toEqual( {} )
        expect( result.index.singleGradings ).toEqual( {} )
        expect( result.index.selectionGradings ).toEqual( {} )

        const raw = await readFile( result.indexPath, 'utf-8' )
        const parsed = JSON.parse( raw )
        expect( parsed.projectName ).toBe( 'fresh-project' )
    } )

    test( 'no-overwrite: second init returns existing index with IDX-WARN-001', async () => {
        const first = await ProjectIndex.init( { gradingDataRoot: tempRoot, projectName: 'reuse-project' } )
        expect( first.created ).toBe( true )

        const write = await ProjectIndex.write( {
            gradingDataRoot: tempRoot,
            projectName: 'reuse-project',
            index: Object.assign( {}, first.index, { dataPretest: { status: 'passed' } } )
        } )
        expect( write.errors ).toEqual( [] )

        const second = await ProjectIndex.init( { gradingDataRoot: tempRoot, projectName: 'reuse-project' } )
        expect( second.created ).toBe( false )
        expect( second.errors[ 0 ] ).toContain( 'IDX-WARN-001' )
        expect( second.index.dataPretest.status ).toBe( 'passed' )
    } )

    test( 'missing projectName yields IDX-001', async () => {
        const result = await ProjectIndex.init( { gradingDataRoot: tempRoot } )
        expect( result.index ).toBeNull()
        expect( result.errors[ 0 ] ).toContain( 'IDX-001' )
    } )
} )


describe( 'ProjectIndex.read / write', () => {
    test( 'roundtrip: write then read returns same projectName + refreshed updatedAt', async () => {
        const init = await ProjectIndex.init( { gradingDataRoot: tempRoot, projectName: 'roundtrip-project' } )
        const updated = Object.assign( {}, init.index, {
            singleGradings: { 'weather--getForecast': { schemaHash: '1a2b3c4d', gradingStatus: 'stable' } }
        } )

        const write = await ProjectIndex.write( { gradingDataRoot: tempRoot, projectName: 'roundtrip-project', index: updated } )
        expect( write.errors ).toEqual( [] )

        const read = await ProjectIndex.read( { gradingDataRoot: tempRoot, projectName: 'roundtrip-project' } )
        expect( read.errors ).toEqual( [] )
        expect( read.index.projectName ).toBe( 'roundtrip-project' )
        expect( read.index.singleGradings[ 'weather--getForecast' ].schemaHash ).toBe( '1a2b3c4d' )
        expect( typeof read.index.updatedAt ).toBe( 'string' )
    } )

    test( 'read of a non-existent index yields IDX-006', async () => {
        const read = await ProjectIndex.read( { gradingDataRoot: tempRoot, projectName: 'never-created' } )
        expect( read.index ).toBeNull()
        expect( read.errors[ 0 ] ).toContain( 'IDX-006' )
    } )

    test( 'write rejects projectName mismatch with IDX-005', async () => {
        const init = await ProjectIndex.init( { gradingDataRoot: tempRoot, projectName: 'mismatch-a' } )
        const wrong = Object.assign( {}, init.index, { projectName: 'mismatch-b' } )
        const write = await ProjectIndex.write( { gradingDataRoot: tempRoot, projectName: 'mismatch-a', index: wrong } )
        expect( write.index ).toBeNull()
        expect( write.errors[ 0 ] ).toContain( 'IDX-005' )
    } )
} )


describe( 'ProjectIndex.validateIndex', () => {
    test( 'valid index passes', () => {
        const index = {
            indexVersion: INDEX_VERSION,
            projectName: 'x',
            createdAt: '2026-05-30T10:00:00.000Z',
            updatedAt: '2026-05-30T10:00:00.000Z',
            dataPretest: {},
            singleGradings: {},
            selectionGradings: {}
        }
        const result = ProjectIndex.validateIndex( { index } )
        expect( result.valid ).toBe( true )
        expect( result.errors ).toEqual( [] )
    } )

    test( 'unsupported indexVersion yields IDX-003', () => {
        const index = {
            indexVersion: 99,
            projectName: 'x',
            dataPretest: {},
            singleGradings: {},
            selectionGradings: {}
        }
        const result = ProjectIndex.validateIndex( { index } )
        expect( result.valid ).toBe( false )
        const has = result.errors.some( ( e ) => e.includes( 'IDX-003' ) )
        expect( has ).toBe( true )
    } )

    test( 'missing top-level section yields IDX-001', () => {
        const index = {
            indexVersion: INDEX_VERSION,
            projectName: 'x',
            dataPretest: {},
            singleGradings: {}
        }
        const result = ProjectIndex.validateIndex( { index } )
        expect( result.valid ).toBe( false )
        const has = result.errors.some( ( e ) => e.includes( 'selectionGradings' ) )
        expect( has ).toBe( true )
    } )

    test( 'non-object section yields IDX-002', () => {
        const index = {
            indexVersion: INDEX_VERSION,
            projectName: 'x',
            dataPretest: [],
            singleGradings: {},
            selectionGradings: {}
        }
        const result = ProjectIndex.validateIndex( { index } )
        expect( result.valid ).toBe( false )
        const has = result.errors.some( ( e ) => e.includes( 'IDX-002' ) )
        expect( has ).toBe( true )
    } )
} )


describe( 'ProjectIndex.indexPath', () => {
    test( 'builds projects/<name>/index.json under the root', () => {
        const result = ProjectIndex.indexPath( { gradingDataRoot: tempRoot, projectName: 'p' } )
        expect( result.errors ).toEqual( [] )
        expect( result.path.endsWith( join( 'projects', 'p', 'index.json' ) ) ).toBe( true )
    } )
} )
