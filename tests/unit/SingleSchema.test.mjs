import { describe, test, expect } from '@jest/globals'

import { SingleSchemaPhases, PROVIDER_AREAS } from '../../src/Phases/SingleSchema.mjs'


const autonomousEntry = () => {
    return {
        schemaId: 'demo.foo',
        selectionId: null,
        gradingTier: 'autonomous',
        grader: { kind: 'script', name: 'unit', version: '0.0.1' },
        gradings: [],
        categoricalVeto: null,
        aggregateGrade: null,
        maxAttainableGrade: 'B',
        options: {}
    }
}


describe( 'SingleSchemaPhases — v2 provider areas', () => {
    test( 'exposes the six provider-side areas (no P1..P7)', () => {
        const { areas } = SingleSchemaPhases.getAreas()
        expect( areas.length ).toBe( 6 )
        expect( areas ).toContain( 'single-test' )
        expect( areas ).toContain( 'about-namespace' )
        // legacy linear phases are gone
        expect( SingleSchemaPhases.runP1 ).toBeUndefined()
        expect( SingleSchemaPhases.runP7 ).toBeUndefined()
    } )

    test( 'getTier reports autonomous', () => {
        expect( SingleSchemaPhases.getTier().tier ).toBe( 'autonomous' )
    } )
} )


describe( 'SingleSchemaPhases.runArea — single-test deterministic gate', () => {
    test( 'HTTP 200 from DataPretest → graded, score pass (no stub)', () => {
        const r = SingleSchemaPhases.runArea( {
            entry: autonomousEntry(),
            schemaPath: '/tmp/demo.mjs',
            area: 'single-test',
            dataPretest: { ok: true, httpStatus: 200, workingTests: 3 }
        } )
        expect( r.status ).toBe( 'graded' )
        const last = r.entry.gradings[ r.entry.gradings.length - 1 ]
        expect( last.score ).toBe( 'pass' )
        expect( last.httpStatus ).toBe( 200 )
    } )

    test( 'HTTP 403 is NEVER pass → score fail, node blocked', () => {
        const r = SingleSchemaPhases.runArea( {
            entry: autonomousEntry(),
            schemaPath: '/tmp/demo.mjs',
            area: 'single-test',
            dataPretest: { ok: false, httpStatus: 403, workingTests: 0 }
        } )
        expect( r.status ).toBe( 'blocked' )
        const last = r.entry.gradings[ r.entry.gradings.length - 1 ]
        expect( last.score ).toBe( 'fail' )
    } )

    test( 'no DataPretest summary → blocked GRD-050 (no silent synthetic 200)', () => {
        const r = SingleSchemaPhases.runArea( {
            entry: autonomousEntry(),
            schemaPath: '/tmp/demo.mjs',
            area: 'single-test'
        } )
        expect( r.status ).toBe( 'blocked' )
        expect( r.errors[ 0 ] ).toContain( 'GRD-050' )
    } )

    test( 'unknown area yields GRD-002', () => {
        const r = SingleSchemaPhases.runArea( {
            entry: autonomousEntry(),
            schemaPath: '/tmp/demo.mjs',
            area: 'not-a-provider-area'
        } )
        expect( r.status ).toBe( 'blocked' )
        expect( r.errors[ 0 ] ).toContain( 'GRD-002' )
    } )

    test( 'group-bound entry rejected with GRD-003', () => {
        const entry = autonomousEntry()
        entry.gradingTier = 'group-bound'
        const r = SingleSchemaPhases.runArea( {
            entry, schemaPath: '/tmp/demo.mjs', area: 'single-test'
        } )
        expect( r.errors[ 0 ] ).toContain( 'GRD-003' )
    } )
} )


describe( 'SingleSchemaPhases.runAll — deterministic-first cascade', () => {
    test( 'single-test runs first; with HTTP 200 it is graded then non-det areas pend', () => {
        const r = SingleSchemaPhases.runAll( {
            entry: autonomousEntry(),
            schemaPath: '/tmp/demo.mjs',
            dataPretest: { ok: true, httpStatus: 200, workingTests: 3 }
        } )
        expect( r.tier ).toBe( 'autonomous' )
        expect( r.areas[ 0 ].area ).toBe( 'single-test' )
        expect( r.areas[ 0 ].status ).toBe( 'graded' )
        expect( PROVIDER_AREAS[ 0 ] ).toBe( 'single-test' )
    } )

    test( 'a blocked single-test halts the cascade (deterministic gate)', () => {
        const r = SingleSchemaPhases.runAll( {
            entry: autonomousEntry(),
            schemaPath: '/tmp/demo.mjs',
            dataPretest: { ok: false, httpStatus: 500, workingTests: 0 }
        } )
        expect( r.areas[ 0 ].status ).toBe( 'blocked' )
        // cascade stopped → only the single-test area was attempted
        expect( r.areas.length ).toBe( 1 )
    } )
} )
