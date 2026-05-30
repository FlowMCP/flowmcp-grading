import { describe, test, expect, beforeAll, afterAll } from '@jest/globals'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ModuleApi } from '../../src/ModuleApi.mjs'
import { HashGenerator } from '../../src/HashGenerator.mjs'


let tempRoot = null
const grader = { kind: 'human', name: 'tester', version: '1.0.0' }


const writeSchemaFile = async ( { path, schema } ) => {
    const body = `export const main = ${JSON.stringify( schema, null, 4 )}\n`
    await writeFile( path, body, 'utf-8' )
}


const hashOf = ( { schema } ) => {
    const r = HashGenerator.computeSchemaHash( { schema } )
    return r.hash
}


beforeAll( async () => {
    tempRoot = await mkdtemp( join( tmpdir(), 'moduleapi-' ) )
} )


afterAll( async () => {
    if( tempRoot !== null ) {
        await rm( tempRoot, { recursive: true, force: true } )
    }
} )


describe( 'ModuleApi.getScopes', () => {
    test( 'returns the two scopes plus area keys', () => {
        const r = ModuleApi.getScopes()
        expect( r.scopes ).toEqual( [ 'schema', 'selection' ] )
        expect( r.schemaAreas.length ).toBe( 6 )
        expect( r.selectionAreas.length ).toBe( 4 )
    } )
} )


describe( 'ModuleApi.readState — validation', () => {
    test( 'missing gradingDataRoot → API-001', async () => {
        const r = await ModuleApi.readState( {} )
        expect( r.errors.some( ( e ) => e.startsWith( 'API-001' ) ) ).toBe( true )
        expect( r.schemaScope ).toBe( null )
    } )

    test( 'non-string indexPath → API-002', async () => {
        const r = await ModuleApi.readState( { gradingDataRoot: tempRoot, indexPath: 42 } )
        expect( r.errors.some( ( e ) => e.startsWith( 'API-002' ) ) ).toBe( true )
    } )
} )


describe( 'ModuleApi.readState — scope separation', () => {
    test( 'empty folder yields scan source and separated zeroed scopes', async () => {
        const root = join( tempRoot, 'empty' )
        await mkdir( root, { recursive: true } )

        const r = await ModuleApi.readState( { gradingDataRoot: root } )
        expect( r.source ).toBe( 'scan' )
        expect( r.schemaScope.namespaces ).toBe( 0 )
        expect( r.schemaScope.singlesTotal ).toBe( 0 )
        expect( r.selectionScope.selectionsTotal ).toBe( 0 )
        expect( r.schemaScope.selectionsTotal ).toBeUndefined()
        expect( r.selectionScope.namespaces ).toBeUndefined()
    } )

    test( 'index present yields index source', async () => {
        const root = join( tempRoot, 'with-index' )
        const projectDir = join( root, 'projects', 'demo' )
        await mkdir( projectDir, { recursive: true } )
        const index = {
            indexVersion: 1,
            projectName: 'demo',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            dataPretest: {},
            singleGradings: {},
            selectionGradings: {}
        }
        await writeFile( join( projectDir, 'index.json' ), JSON.stringify( index, null, 4 ), 'utf-8' )

        const r = await ModuleApi.readState( { gradingDataRoot: root } )
        expect( r.source ).toBe( 'index' )
    } )

    test( 'phase-status singles counted as stable/pending in schemaScope', async () => {
        const root = join( tempRoot, 'phase-status' )
        const psDir = join( root, 'phase-status', 'single' )
        await mkdir( psDir, { recursive: true } )
        await writeFile( join( psDir, 'ns--a.json' ), JSON.stringify( { gradingStatus: 'stable', schemaHash: 'aaaaaaaa' } ), 'utf-8' )
        await writeFile( join( psDir, 'ns--b.json' ), JSON.stringify( { gradingStatus: 'pending', schemaHash: 'bbbbbbbb' } ), 'utf-8' )

        const r = await ModuleApi.readState( { gradingDataRoot: root } )
        expect( r.schemaScope.stable ).toBe( 1 )
        expect( r.schemaScope.pending ).toBe( 1 )
    } )
} )


describe( 'ModuleApi.addSchema', () => {
    test( 'missing required field → API-001', async () => {
        const r = await ModuleApi.addSchema( { gradingDataRoot: tempRoot, namespace: 'ns' } )
        expect( r.errors.some( ( e ) => e.startsWith( 'API-001' ) ) ).toBe( true )
    } )

    test( 'creates a frozen snapshot', async () => {
        const root = join( tempRoot, 'add-create' )
        await mkdir( root, { recursive: true } )
        const schema = { namespace: 'demo', tools: { a: { description: 'x' } } }
        const schemaPath = join( root, 'src-schema.mjs' )
        await writeSchemaFile( { path: schemaPath, schema } )

        const r = await ModuleApi.addSchema( {
            gradingDataRoot: root, namespace: 'demo', schemaPath,
            schemaId: 'demo.a', schemaVersion: '1.0.0', grader
        } )
        expect( r.errors ).toEqual( [] )
        expect( r.alreadyPresent ).toBe( false )
        expect( r.snapshot.hash ).toBe( hashOf( { schema } ) )
    } )

    test( 'no-overwrite — identical hash returns alreadyPresent, no write', async () => {
        const root = join( tempRoot, 'add-noop' )
        await mkdir( root, { recursive: true } )
        const schema = { namespace: 'demo', tools: { a: { description: 'x' } } }
        const schemaPath = join( root, 'src-schema.mjs' )
        await writeSchemaFile( { path: schemaPath, schema } )

        const first = await ModuleApi.addSchema( {
            gradingDataRoot: root, namespace: 'demo', schemaPath,
            schemaId: 'demo.a', schemaVersion: '1.0.0', grader
        } )
        expect( first.alreadyPresent ).toBe( false )

        const second = await ModuleApi.addSchema( {
            gradingDataRoot: root, namespace: 'demo', schemaPath,
            schemaId: 'demo.a', schemaVersion: '1.0.0', grader
        } )
        expect( second.alreadyPresent ).toBe( true )
        expect( second.errors ).toEqual( [] )
    } )
} )


describe( 'ModuleApi.upgradeSchema', () => {
    test( 'toVersion not higher than fromVersion → API-003', async () => {
        const root = join( tempRoot, 'upg-version' )
        await mkdir( root, { recursive: true } )
        const schemaPath = join( root, 's.mjs' )
        await writeSchemaFile( { path: schemaPath, schema: { tools: {} } } )

        const r = await ModuleApi.upgradeSchema( {
            gradingDataRoot: root, namespace: 'demo', schemaId: 'demo.a', schemaPath,
            fromVersion: '1.0.0', toVersion: '1.0.0', grader
        } )
        expect( r.errors.some( ( e ) => e.startsWith( 'API-003' ) ) ).toBe( true )
    } )

    test( 'missing fromVersion snapshot → API-003', async () => {
        const root = join( tempRoot, 'upg-missing' )
        await mkdir( root, { recursive: true } )
        const schemaPath = join( root, 's.mjs' )
        await writeSchemaFile( { path: schemaPath, schema: { tools: { a: {} } } } )

        const r = await ModuleApi.upgradeSchema( {
            gradingDataRoot: root, namespace: 'demo', schemaId: 'demo.a', schemaPath,
            fromVersion: '1.0.0', toVersion: '2.0.0', grader
        } )
        expect( r.errors.some( ( e ) => e.startsWith( 'API-003' ) ) ).toBe( true )
    } )

    test( 'new snapshot has new hash, old snapshot untouched, diff returned, regrade marked', async () => {
        const root = join( tempRoot, 'upg-ok' )
        await mkdir( root, { recursive: true } )

        const oldSchema = { namespace: 'demo', tools: { a: { description: 'old' } } }
        const oldPath = join( root, 'old.mjs' )
        await writeSchemaFile( { path: oldPath, schema: oldSchema } )
        const added = await ModuleApi.addSchema( {
            gradingDataRoot: root, namespace: 'demo', schemaPath: oldPath,
            schemaId: 'demo.a', schemaVersion: '1.0.0', grader
        } )
        const oldHash = added.snapshot.hash

        const newSchema = { namespace: 'demo', tools: { a: { description: 'old' }, b: { description: 'new tool added' } } }
        const newPath = join( root, 'new.mjs' )
        await writeSchemaFile( { path: newPath, schema: newSchema } )

        const r = await ModuleApi.upgradeSchema( {
            gradingDataRoot: root, namespace: 'demo', schemaId: 'demo.a', schemaPath: newPath,
            fromVersion: '1.0.0', toVersion: '1.1.0', grader
        } )
        expect( r.errors ).toEqual( [] )
        expect( r.snapshot.hash ).toBe( hashOf( { schema: newSchema } ) )
        expect( r.snapshot.hash ).not.toBe( oldHash )
        expect( r.diff.regradeMarked ).toBe( true )
        expect( typeof r.diff.bump ).toBe( 'string' )

        // old snapshot still present
        const state = await ModuleApi.readState( { gradingDataRoot: root } )
        expect( state.schemaScope.schemas ).toBe( 2 )
    } )
} )


describe( 'ModuleApi.stats', () => {
    test( 'missing scope → API-001', async () => {
        const r = await ModuleApi.stats( { gradingDataRoot: tempRoot } )
        expect( r.errors.some( ( e ) => e.startsWith( 'API-001' ) ) ).toBe( true )
    } )

    test( 'invalid scope → API-004', async () => {
        const r = await ModuleApi.stats( { gradingDataRoot: tempRoot, scope: 'both' } )
        expect( r.errors.some( ( e ) => e.startsWith( 'API-004' ) ) ).toBe( true )
    } )

    test( 'schema scope returns schema counts only', async () => {
        const root = join( tempRoot, 'stats-schema' )
        const psDir = join( root, 'phase-status', 'single' )
        await mkdir( psDir, { recursive: true } )
        await writeFile( join( psDir, 'ns--a.json' ), JSON.stringify( { gradingStatus: 'stable' } ), 'utf-8' )

        const r = await ModuleApi.stats( { gradingDataRoot: root, scope: 'schema' } )
        expect( r.scope ).toBe( 'schema' )
        expect( r.counts.stable ).toBe( 1 )
        expect( r.counts.selectionsTotal ).toBeUndefined()
        expect( typeof r.gradeDistribution ).toBe( 'object' )
    } )

    test( 'grade distribution counts aggregateGrade from index', async () => {
        const root = join( tempRoot, 'stats-dist' )
        const projectDir = join( root, 'projects', 'demo' )
        await mkdir( projectDir, { recursive: true } )
        const index = {
            indexVersion: 1,
            projectName: 'demo',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            dataPretest: {},
            singleGradings: {
                'ns--a': { aggregateGrade: 'A' },
                'ns--b': { aggregateGrade: 'A' },
                'ns--c': { aggregateGrade: 'B' }
            },
            selectionGradings: {}
        }
        await writeFile( join( projectDir, 'index.json' ), JSON.stringify( index, null, 4 ), 'utf-8' )

        const r = await ModuleApi.stats( { gradingDataRoot: root, scope: 'schema' } )
        expect( r.gradeDistribution.A ).toBe( 2 )
        expect( r.gradeDistribution.B ).toBe( 1 )
    } )
} )


describe( 'ModuleApi.assertFullScopeRule', () => {
    const fullSchemaEntry = () => ( {
        schemaId: 'demo.a',
        gradingMode: 'full',
        aggregateGrade: 'A',
        gradings: [
            { dimension: 'schemaStructureValid' },
            { dimension: 'apiAvailability' },
            { dimension: 'descriptionNeutrality' },
            { dimension: 'parametersTyping' },
            { dimension: 'whenToUseClarity' },
            { dimension: 'aboutConventionCompliance' }
        ]
    } )

    const fullSelectionEntry = () => ( {
        schemaId: 'selection:demo',
        gradingMode: 'full',
        aggregateGrade: 'A',
        gradings: [
            { dimension: 'memberConsistency' },
            { dimension: 'lockfileConsistency' },
            { dimension: 'skillReferenceValidity' },
            { dimension: 'personaReferenceCoherence' }
        ]
    } )

    test( 'missing scope → API-001', () => {
        const r = ModuleApi.assertFullScopeRule( { entry: fullSchemaEntry() } )
        expect( r.errors.some( ( e ) => e.startsWith( 'API-001' ) ) ).toBe( true )
    } )

    test( 'invalid scope → API-004', () => {
        const r = ModuleApi.assertFullScopeRule( { entry: fullSchemaEntry(), scope: 'both' } )
        expect( r.errors.some( ( e ) => e.startsWith( 'API-004' ) ) ).toBe( true )
    } )

    test( 'schema-full covering all 6 areas is valid', () => {
        const r = ModuleApi.assertFullScopeRule( { entry: fullSchemaEntry(), scope: 'schema' } )
        expect( r.valid ).toBe( true )
        expect( r.expectedAreas.length ).toBe( 6 )
        expect( r.presentAreas.length ).toBe( 6 )
    } )

    test( 'schema entry missing an area is invalid', () => {
        const entry = fullSchemaEntry()
        entry.gradings = entry.gradings.slice( 0, 3 )
        const r = ModuleApi.assertFullScopeRule( { entry, scope: 'schema' } )
        expect( r.valid ).toBe( false )
        expect( r.violations.length ).toBeGreaterThan( 0 )
    } )

    test( 'selection-full covering all 4 areas is valid', () => {
        const r = ModuleApi.assertFullScopeRule( { entry: fullSelectionEntry(), scope: 'selection' } )
        expect( r.valid ).toBe( true )
        expect( r.expectedAreas.length ).toBe( 4 )
    } )

    test( 'mixed scope (10-in-one-run) → API-005, no combined grading', () => {
        const entry = fullSchemaEntry()
        entry.gradings = entry.gradings.concat( fullSelectionEntry().gradings )
        const r = ModuleApi.assertFullScopeRule( { entry, scope: 'schema' } )
        expect( r.errors.some( ( e ) => e.startsWith( 'API-005' ) ) ).toBe( true )
        expect( r.valid ).toBe( false )
    } )

    test( 'partial entry as first violates first-must-be-full via PartialGrading', () => {
        const entry = fullSchemaEntry()
        entry.gradingMode = 'partial'
        const r = ModuleApi.assertFullScopeRule( { entry, scope: 'schema' } )
        const hasSeqViolation = r.violations.some( ( v ) => v.rule === 'first-must-be-full' )
        expect( hasSeqViolation ).toBe( true )
    } )
} )


describe( 'ModuleApi.assertSelectionRespectsSchemaFull', () => {
    test( 'missing selectionId → API-001', async () => {
        const r = await ModuleApi.assertSelectionRespectsSchemaFull( { gradingDataRoot: tempRoot } )
        expect( r.errors.some( ( e ) => e.startsWith( 'API-001' ) ) ).toBe( true )
    } )

    test( 'all members stable → may proceed and respects existing schema-full (no regrade)', async () => {
        const root = join( tempRoot, 'respect-ok' )
        const selDir = join( root, 'selection', 'sel-1' )
        await mkdir( selDir, { recursive: true } )
        const lockfile = {
            selectionId: 'sel-1',
            members: [
                { schemaId: 'ns.a', gradingStatus: 'stable' },
                { schemaId: 'ns.b', gradingStatus: 'stable' }
            ]
        }
        await writeFile( join( selDir, 'selection.lock.json' ), JSON.stringify( lockfile, null, 4 ), 'utf-8' )

        const r = await ModuleApi.assertSelectionRespectsSchemaFull( { gradingDataRoot: root, selectionId: 'sel-1' } )
        expect( r.mayProceed ).toBe( true )
        expect( r.respectsSchemaFull ).toBe( true )
        expect( r.blockedMembers ).toEqual( [] )
    } )

    test( 'a pending member blocks the selection', async () => {
        const root = join( tempRoot, 'respect-blocked' )
        const selDir = join( root, 'selection', 'sel-2' )
        await mkdir( selDir, { recursive: true } )
        const lockfile = {
            selectionId: 'sel-2',
            members: [
                { schemaId: 'ns.a', gradingStatus: 'stable' },
                { schemaId: 'ns.b', gradingStatus: 'pending' }
            ]
        }
        await writeFile( join( selDir, 'selection.lock.json' ), JSON.stringify( lockfile, null, 4 ), 'utf-8' )

        const r = await ModuleApi.assertSelectionRespectsSchemaFull( { gradingDataRoot: root, selectionId: 'sel-2' } )
        expect( r.mayProceed ).toBe( false )
        expect( r.blockedMembers.length ).toBe( 1 )
    } )
} )
