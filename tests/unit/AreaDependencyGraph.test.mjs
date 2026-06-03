import { describe, test, expect, beforeAll, afterAll } from '@jest/globals'
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

import { AreaDependencyGraph } from '../../src/AreaDependencyGraph.mjs'


const MODULE_DIR = dirname( fileURLToPath( import.meta.url ) )
const SEED_PATH = join( MODULE_DIR, '..', '..', 'src', 'data', 'area-dependency-graph.json' )

const PROVIDER_AREAS = [
    'single-test',
    'tools-aggregate-schema',
    'tools-aggregate-namespace',
    'namespace-description',
    'namespace-skills',
    'about-namespace'
]


describe( 'AreaDependencyGraph.loadGraph — seeded data file', () => {
    test( 'loads + validates the shipped seed file', () => {
        const { graph, errors } = AreaDependencyGraph.loadGraph( { path: SEED_PATH } )
        expect( errors ).toEqual( [] )
        expect( graph ).not.toBeNull()
        expect( typeof graph.version ).toBe( 'string' )
        expect( Array.isArray( graph.entries ) ).toBe( true )
    } )

    test( 'all 6 provider areas are present', () => {
        const { graph } = AreaDependencyGraph.loadGraph( { path: SEED_PATH } )
        const areas = graph.entries.map( ( e ) => e.area )
        PROVIDER_AREAS.forEach( ( a ) => expect( areas ).toContain( a ) )
    } )

    test( 'missing path raises ADG-001', () => {
        const { graph, errors } = AreaDependencyGraph.loadGraph( {} )
        expect( graph ).toBeNull()
        expect( errors.some( ( e ) => e.startsWith( 'ADG-001' ) ) ).toBe( true )
    } )

    test( 'non-string path raises ADG-002', () => {
        const { errors } = AreaDependencyGraph.loadGraph( { path: 42 } )
        expect( errors.some( ( e ) => e.startsWith( 'ADG-002' ) ) ).toBe( true )
    } )

    test( 'unreadable path raises ADG-003', () => {
        const { errors } = AreaDependencyGraph.loadGraph( { path: '/no/such/file/area-dependency-graph.json' } )
        expect( errors.some( ( e ) => e.startsWith( 'ADG-003' ) ) ).toBe( true )
    } )
} )


describe( 'AreaDependencyGraph.requiredLevelFor / dependsOnFor — seeded values', () => {
    test( 'schema-areas require structural-valid with no dependsOn', () => {
        const { graph } = AreaDependencyGraph.loadGraph( { path: SEED_PATH } )
        const lvl = AreaDependencyGraph.requiredLevelFor( { graph, area: 'single-test' } )
        const dep = AreaDependencyGraph.dependsOnFor( { graph, area: 'tools-aggregate-schema' } )
        expect( lvl.requiredLevel ).toBe( 'structural-valid' )
        expect( dep.dependsOn.kind ).toBe( 'none' )
    } )

    test( 'namespace-areas carry the Provider-Namespace-Gate (deterministic-green @ all-namespace-schemas)', () => {
        const { graph } = AreaDependencyGraph.loadGraph( { path: SEED_PATH } )
        const namespaceAreas = [ 'tools-aggregate-namespace', 'namespace-description', 'namespace-skills' ]
        namespaceAreas.forEach( ( area ) => {
            const lvl = AreaDependencyGraph.requiredLevelFor( { graph, area } )
            const dep = AreaDependencyGraph.dependsOnFor( { graph, area } )
            expect( lvl.requiredLevel ).toBe( 'deterministic-green' )
            expect( dep.dependsOn.kind ).toBe( 'all-namespace-schemas' )
        } )
    } )

    test( 'about-namespace requires structural-valid @ about-resource-present', () => {
        const { graph } = AreaDependencyGraph.loadGraph( { path: SEED_PATH } )
        const lvl = AreaDependencyGraph.requiredLevelFor( { graph, area: 'about-namespace' } )
        const dep = AreaDependencyGraph.dependsOnFor( { graph, area: 'about-namespace' } )
        expect( lvl.requiredLevel ).toBe( 'structural-valid' )
        expect( dep.dependsOn.kind ).toBe( 'about-resource-present' )
    } )

    test( 'selection-areas require stable @ all-member-schemas', () => {
        const { graph } = AreaDependencyGraph.loadGraph( { path: SEED_PATH } )
        const lvl = AreaDependencyGraph.requiredLevelFor( { graph, area: 'about-selection' } )
        const dep = AreaDependencyGraph.dependsOnFor( { graph, area: 'selection-aggregate' } )
        expect( lvl.requiredLevel ).toBe( 'stable' )
        expect( dep.dependsOn.kind ).toBe( 'all-member-schemas' )
    } )

    test( 'unknown area raises ADG-008', () => {
        const { graph } = AreaDependencyGraph.loadGraph( { path: SEED_PATH } )
        const { requiredLevel, errors } = AreaDependencyGraph.requiredLevelFor( { graph, area: 'does-not-exist' } )
        expect( requiredLevel ).toBeNull()
        expect( errors.some( ( e ) => e.startsWith( 'ADG-008' ) ) ).toBe( true )
    } )

    test( 'missing area raises ADG-001', () => {
        const { graph } = AreaDependencyGraph.loadGraph( { path: SEED_PATH } )
        const { errors } = AreaDependencyGraph.dependsOnFor( { graph } )
        expect( errors.some( ( e ) => e.startsWith( 'ADG-001' ) ) ).toBe( true )
    } )
} )


describe( 'AreaDependencyGraph.loadGraph — invalid data branches (no silent skip)', () => {
    let scratch = null

    beforeAll( () => {
        scratch = mkdtempSync( join( tmpdir(), 'adg-test-' ) )
    } )

    afterAll( () => {
        if( scratch !== null ) { rmSync( scratch, { recursive: true, force: true } ) }
    } )

    const writeTmp = ( { name, content } ) => {
        const p = join( scratch, name )
        writeFileSync( p, content, 'utf-8' )
        return p
    }

    test( 'malformed JSON raises ADG-004', () => {
        const p = writeTmp( { name: 'bad.json', content: '{ not json' } )
        const { errors } = AreaDependencyGraph.loadGraph( { path: p } )
        expect( errors.some( ( e ) => e.startsWith( 'ADG-004' ) ) ).toBe( true )
    } )

    test( 'missing version raises ADG-004', () => {
        const p = writeTmp( { name: 'no-version.json', content: JSON.stringify( { entries: [] } ) } )
        const { errors } = AreaDependencyGraph.loadGraph( { path: p } )
        expect( errors.some( ( e ) => e.startsWith( 'ADG-004' ) ) ).toBe( true )
    } )

    test( 'empty entries raises ADG-004', () => {
        const p = writeTmp( { name: 'empty.json', content: JSON.stringify( { version: '1.0.0', entries: [] } ) } )
        const { errors } = AreaDependencyGraph.loadGraph( { path: p } )
        expect( errors.some( ( e ) => e.startsWith( 'ADG-004' ) ) ).toBe( true )
    } )

    test( 'unknown area raises ADG-005', () => {
        const p = writeTmp( {
            name: 'bad-area.json',
            content: JSON.stringify( {
                version: '1.0.0',
                entries: [ { area: 'made-up-area', dependsOn: { kind: 'none' }, requiredLevel: 'structural-valid' } ]
            } )
        } )
        const { errors } = AreaDependencyGraph.loadGraph( { path: p } )
        expect( errors.some( ( e ) => e.startsWith( 'ADG-005' ) ) ).toBe( true )
    } )

    test( 'unknown requiredLevel raises ADG-006', () => {
        const p = writeTmp( {
            name: 'bad-level.json',
            content: JSON.stringify( {
                version: '1.0.0',
                entries: [ { area: 'single-test', dependsOn: { kind: 'none' }, requiredLevel: 'imported' } ]
            } )
        } )
        const { errors } = AreaDependencyGraph.loadGraph( { path: p } )
        expect( errors.some( ( e ) => e.startsWith( 'ADG-006' ) ) ).toBe( true )
    } )

    test( 'unknown dependsOn.kind raises ADG-007', () => {
        const p = writeTmp( {
            name: 'bad-kind.json',
            content: JSON.stringify( {
                version: '1.0.0',
                entries: [ { area: 'single-test', dependsOn: { kind: 'somehow' }, requiredLevel: 'structural-valid' } ]
            } )
        } )
        const { errors } = AreaDependencyGraph.loadGraph( { path: p } )
        expect( errors.some( ( e ) => e.startsWith( 'ADG-007' ) ) ).toBe( true )
    } )

    test( 'missing dependsOn raises ADG-001', () => {
        const p = writeTmp( {
            name: 'no-dep.json',
            content: JSON.stringify( {
                version: '1.0.0',
                entries: [ { area: 'single-test', requiredLevel: 'structural-valid' } ]
            } )
        } )
        const { errors } = AreaDependencyGraph.loadGraph( { path: p } )
        expect( errors.some( ( e ) => e.startsWith( 'ADG-001' ) ) ).toBe( true )
    } )
} )


describe( 'AreaDependencyGraph.evaluate — ready/gated partition (PRD-006)', () => {
    test( 'schema-areas (kind none) are always ready', () => {
        const { graph } = AreaDependencyGraph.loadGraph( { path: SEED_PATH } )
        const { ready, gated, errors } = AreaDependencyGraph.evaluate( {
            graph,
            derivedLevels: { namespaceLevel: 'structural-valid', aboutPresent: false, memberLevel: 'imported' }
        } )
        expect( errors ).toEqual( [] )
        expect( ready ).toContain( 'single-test' )
        expect( ready ).toContain( 'tools-aggregate-schema' )
        // namespace-areas gated below deterministic-green
        const gatedAreas = gated.map( ( g ) => g.area )
        expect( gatedAreas ).toContain( 'namespace-description' )
        expect( gatedAreas ).toContain( 'namespace-skills' )
        expect( gatedAreas ).toContain( 'tools-aggregate-namespace' )
    } )

    test( 'namespace-areas become ready once namespaceLevel reaches deterministic-green', () => {
        const { graph } = AreaDependencyGraph.loadGraph( { path: SEED_PATH } )
        const { ready } = AreaDependencyGraph.evaluate( {
            graph,
            derivedLevels: { namespaceLevel: 'deterministic-green', aboutPresent: true, memberLevel: 'stable' }
        } )
        expect( ready ).toContain( 'namespace-description' )
        expect( ready ).toContain( 'namespace-skills' )
        expect( ready ).toContain( 'tools-aggregate-namespace' )
    } )

    test( 'about-namespace gated when the About resource is absent', () => {
        const { graph } = AreaDependencyGraph.loadGraph( { path: SEED_PATH } )
        const { gated } = AreaDependencyGraph.evaluate( {
            graph,
            derivedLevels: { namespaceLevel: 'deterministic-green', aboutPresent: false, memberLevel: 'stable' }
        } )
        const aboutGate = gated.find( ( g ) => g.area === 'about-namespace' )
        expect( aboutGate ).toBeDefined()
        expect( aboutGate.reason ).toContain( 'About' )
    } )

    test( 'about-namespace ready when the About resource is present', () => {
        const { graph } = AreaDependencyGraph.loadGraph( { path: SEED_PATH } )
        const { ready } = AreaDependencyGraph.evaluate( {
            graph,
            derivedLevels: { namespaceLevel: 'deterministic-green', aboutPresent: true, memberLevel: 'stable' }
        } )
        expect( ready ).toContain( 'about-namespace' )
    } )

    test( 'selection-areas gated below stable, ready at stable', () => {
        const { graph } = AreaDependencyGraph.loadGraph( { path: SEED_PATH } )
        const below = AreaDependencyGraph.evaluate( {
            graph,
            derivedLevels: { namespaceLevel: 'deterministic-green', aboutPresent: true, memberLevel: 'deterministic-green' }
        } )
        expect( below.gated.map( ( g ) => g.area ) ).toContain( 'selection-aggregate' )

        const atStable = AreaDependencyGraph.evaluate( {
            graph,
            derivedLevels: { namespaceLevel: 'deterministic-green', aboutPresent: true, memberLevel: 'stable' }
        } )
        expect( atStable.ready ).toContain( 'selection-aggregate' )
    } )

    test( 'missing namespaceLevel signal raises ADG-009 (no silent default)', () => {
        const { graph } = AreaDependencyGraph.loadGraph( { path: SEED_PATH } )
        const { errors } = AreaDependencyGraph.evaluate( {
            graph,
            derivedLevels: { aboutPresent: true, memberLevel: 'stable' }
        } )
        expect( errors.some( ( e ) => e.startsWith( 'ADG-009' ) ) ).toBe( true )
    } )

    test( 'non-object derivedLevels raises ADG-002', () => {
        const { graph } = AreaDependencyGraph.loadGraph( { path: SEED_PATH } )
        const { errors } = AreaDependencyGraph.evaluate( { graph, derivedLevels: null } )
        expect( errors.some( ( e ) => e.startsWith( 'ADG-002' ) ) ).toBe( true )
    } )
} )


describe( 'AreaDependencyGraph.classifyArea — deterministic vs non-deterministic (PRD-010)', () => {
    let scratch = null

    beforeAll( () => {
        scratch = mkdtempSync( join( tmpdir(), 'adg-classify-' ) )
    } )

    afterAll( () => {
        if( scratch !== null ) { rmSync( scratch, { recursive: true, force: true } ) }
    } )

    const writeTmp = ( { name, content } ) => {
        const p = join( scratch, name )
        writeFileSync( p, content, 'utf-8' )
        return p
    }

    test( 'schema-areas are deterministic (CLI can finish them for free)', () => {
        const { graph } = AreaDependencyGraph.loadGraph( { path: SEED_PATH } )
        const single = AreaDependencyGraph.classifyArea( { graph, area: 'single-test' } )
        const tools = AreaDependencyGraph.classifyArea( { graph, area: 'tools-aggregate-schema' } )
        expect( single.errors ).toEqual( [] )
        expect( single.classification ).toBe( 'deterministic' )
        expect( tools.classification ).toBe( 'deterministic' )
    } )

    test( 'namespace-areas are non-deterministic (need an LLM scoring round)', () => {
        const { graph } = AreaDependencyGraph.loadGraph( { path: SEED_PATH } )
        const desc = AreaDependencyGraph.classifyArea( { graph, area: 'namespace-description' } )
        const skills = AreaDependencyGraph.classifyArea( { graph, area: 'namespace-skills' } )
        expect( desc.classification ).toBe( 'non-deterministic' )
        expect( skills.classification ).toBe( 'non-deterministic' )
    } )

    test( 'unknown area raises ADG-008 (no silent default)', () => {
        const { graph } = AreaDependencyGraph.loadGraph( { path: SEED_PATH } )
        const { classification, errors } = AreaDependencyGraph.classifyArea( { graph, area: 'made-up-area' } )
        expect( classification ).toBeNull()
        expect( errors.some( ( e ) => e.startsWith( 'ADG-008' ) ) ).toBe( true )
    } )

    test( 'an entry without a classification raises ADG-010 / ADG-001 on load', () => {
        const p = writeTmp( {
            name: 'no-classification.json',
            content: JSON.stringify( {
                version: '1.0.0',
                entries: [ { area: 'single-test', dependsOn: { kind: 'none' }, requiredLevel: 'structural-valid' } ]
            } )
        } )
        const { errors } = AreaDependencyGraph.loadGraph( { path: p } )
        expect( errors.some( ( e ) => e.startsWith( 'ADG-001' ) ) ).toBe( true )
    } )

    test( 'an entry with an unknown classification raises ADG-010 on load', () => {
        const p = writeTmp( {
            name: 'bad-classification.json',
            content: JSON.stringify( {
                version: '1.0.0',
                entries: [ { area: 'single-test', dependsOn: { kind: 'none' }, requiredLevel: 'structural-valid', classification: 'maybe' } ]
            } )
        } )
        const { errors } = AreaDependencyGraph.loadGraph( { path: p } )
        expect( errors.some( ( e ) => e.startsWith( 'ADG-010' ) ) ).toBe( true )
    } )
} )
