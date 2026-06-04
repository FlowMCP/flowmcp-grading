import { describe, test, expect } from '@jest/globals'

import { DeterministicAreaMapper } from '../../src/DeterministicAreaMapper.mjs'


const RECORDED_AT = '2026-06-04T10-00-00Z'

const makePretest = ( { perTool, keyGated = false } ) => {
    return { ok: true, keyGated, perTool, results: [], errors: [] }
}


describe( 'DeterministicAreaMapper.mapSchema', () => {
    test( 'ideal: tool at data-analyzable -> single-test pass (grade B), schema-aggregate pass', () => {
        const pretest = makePretest( {
            perTool: { getWeather: { working: 3, total: 3, bar: 2, parameterless: false, class: 'normal', level: 'data-analyzable' } }
        } )
        const result = DeterministicAreaMapper.mapSchema( {
            namespace: 'brightsky', schemaId: 'weather', main: {}, validate: { status: true }, pretest, recordedAt: RECORDED_AT
        } )
        expect( result.errors ).toEqual( [] )
        const single = result.entries.find( ( entry ) => entry.area === 'single-test' )
        const aggregate = result.entries.find( ( entry ) => entry.area === 'tools-aggregate-schema' )
        expect( single.tool ).toBe( 'getWeather' )
        expect( single.entry.grade ).toBe( 'B' )
        expect( single.entry.gradingMode ).toBe( 'partial' )
        expect( aggregate.entry.grade ).toBe( 'B' )
    } )

    test( 'below bar: tool reachable (1 working) -> single-test fail (grade F)', () => {
        const pretest = makePretest( {
            perTool: { getFng: { working: 1, total: 1, bar: 2, parameterless: false, class: 'needs-tests', level: 'reachable' } }
        } )
        const result = DeterministicAreaMapper.mapSchema( {
            namespace: 'alternative', schemaId: 'fearAndGreed', main: {}, validate: { status: true }, pretest, recordedAt: RECORDED_AT
        } )
        const single = result.entries.find( ( entry ) => entry.area === 'single-test' )
        expect( single.entry.grade ).toBe( 'F' )
    } )

    test( 'parameterless: 1 working at bar 1 (schema-validatable) -> single-test pass', () => {
        const pretest = makePretest( {
            perTool: { getCurrent: { working: 1, total: 1, bar: 1, parameterless: true, class: 'parameterless', level: 'schema-validatable' } }
        } )
        const result = DeterministicAreaMapper.mapSchema( {
            namespace: 'x', schemaId: 's', main: {}, validate: { status: true }, pretest, recordedAt: RECORDED_AT
        } )
        const single = result.entries.find( ( entry ) => entry.area === 'single-test' )
        expect( single.entry.grade ).toBe( 'B' )
    } )

    test( 'key-gated tool is SKIPPED (not evaluable, not a fail)', () => {
        const pretest = makePretest( {
            keyGated: true,
            perTool: { getThing: { working: 0, total: 2, bar: 2, parameterless: false, class: 'key-gated', level: 'unavailable' } }
        } )
        const result = DeterministicAreaMapper.mapSchema( {
            namespace: 'keyed', schemaId: 's', main: {}, validate: { status: true }, pretest, recordedAt: RECORDED_AT
        } )
        const single = result.entries.find( ( entry ) => entry.area === 'single-test' )
        expect( single ).toBeUndefined()
        expect( result.skipped.some( ( s ) => s.tool === 'getThing' ) ).toBe( true )
        // schema-aggregate still produced
        expect( result.entries.find( ( entry ) => entry.area === 'tools-aggregate-schema' ) ).toBeDefined()
    } )

    test( 'structural validation failed -> schema-aggregate fail (grade F)', () => {
        const pretest = makePretest( {
            perTool: { t: { working: 2, total: 2, bar: 2, parameterless: false, class: 'normal', level: 'schema-validatable' } }
        } )
        const result = DeterministicAreaMapper.mapSchema( {
            namespace: 'x', schemaId: 's', main: {}, validate: { status: false }, pretest, recordedAt: RECORDED_AT
        } )
        const aggregate = result.entries.find( ( entry ) => entry.area === 'tools-aggregate-schema' )
        expect( aggregate.entry.grade ).toBe( 'F' )
    } )

    test( 'entries are deterministic (grader.kind script, determinism deterministic)', () => {
        const pretest = makePretest( {
            perTool: { t: { working: 2, total: 2, bar: 2, parameterless: false, class: 'normal', level: 'schema-validatable' } }
        } )
        const result = DeterministicAreaMapper.mapSchema( {
            namespace: 'x', schemaId: 's', main: {}, validate: { status: true }, pretest, recordedAt: RECORDED_AT
        } )
        const single = result.entries.find( ( entry ) => entry.area === 'single-test' )
        expect( single.entry.grader.kind ).toBe( 'script' )
        expect( single.entry.gradings.every( ( g ) => g.determinism === 'deterministic' ) ).toBe( true )
    } )

    test( 'extreme response (>10MB) downgrades an otherwise-green tool below B', () => {
        const pretest = makePretest( {
            perTool: { getBulk: { working: 3, total: 3, bar: 2, parameterless: false, class: 'normal', level: 'data-analyzable', maxResponseBytes: 180000000, large: true, extreme: true } }
        } )
        const result = DeterministicAreaMapper.mapSchema( {
            namespace: 'bis', schemaId: 'bisStatistics', main: {}, validate: { status: true }, pretest, recordedAt: RECORDED_AT
        } )
        const single = result.entries.find( ( entry ) => entry.area === 'single-test' )
        // green pass + extreme fail -> averaged below B
        expect( single.entry.grade ).not.toBe( 'B' )
        expect( single.entry.gradings.some( ( g ) => g.dimension === 'responseSizeWithinLimit' && g.score === 'fail' ) ).toBe( true )
    } )

    test( 'large-but-not-extreme adds NO size grading (bar not diluted)', () => {
        const pretest = makePretest( {
            perTool: { getBig: { working: 3, total: 3, bar: 2, parameterless: false, class: 'normal', level: 'data-analyzable', maxResponseBytes: 2000000, large: true, extreme: false } }
        } )
        const result = DeterministicAreaMapper.mapSchema( {
            namespace: 'x', schemaId: 's', main: {}, validate: { status: true }, pretest, recordedAt: RECORDED_AT
        } )
        const single = result.entries.find( ( entry ) => entry.area === 'single-test' )
        expect( single.entry.grade ).toBe( 'B' )
        expect( single.entry.gradings.some( ( g ) => g.dimension === 'responseSizeWithinLimit' ) ).toBe( false )
    } )

    test( 'missing recordedAt -> hard error (no silent default)', () => {
        const result = DeterministicAreaMapper.mapSchema( {
            namespace: 'x', schemaId: 's', main: {}, validate: { status: true }, pretest: makePretest( { perTool: {} } ), recordedAt: ''
        } )
        expect( result.errors[ 0 ] ).toContain( 'DAM-001' )
    } )
} )
