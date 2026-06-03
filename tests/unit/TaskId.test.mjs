import { describe, test, expect } from '@jest/globals'

import { TaskId } from '../../src/TaskId.mjs'


describe( 'TaskId.generate — format + determinism', () => {
    test( 'produces <schemaIdSlug>--<8hex>', () => {
        const { taskId, areaSetHash, errors } = TaskId.generate( {
            schemaIdSlug: 'etherscan--balance', areas: [ 'single-test' ]
        } )
        expect( errors ).toEqual( [] )
        expect( areaSetHash ).toMatch( /^[0-9a-f]{8}$/ )
        expect( taskId ).toBe( `etherscan--balance--${areaSetHash}` )
    } )

    test( 'deterministic — two calls yield the identical id', () => {
        const a = TaskId.generate( { schemaIdSlug: 'ns--tool', areas: [ 'about-namespace', 'namespace-skills' ] } )
        const b = TaskId.generate( { schemaIdSlug: 'ns--tool', areas: [ 'about-namespace', 'namespace-skills' ] } )
        expect( a.taskId ).toBe( b.taskId )
    } )

    test( 'order-independent — [A,B] === [B,A]', () => {
        const a = TaskId.generate( { schemaIdSlug: 's', areas: [ 'single-test', 'tools-aggregate-schema' ] } )
        const b = TaskId.generate( { schemaIdSlug: 's', areas: [ 'tools-aggregate-schema', 'single-test' ] } )
        expect( a.areaSetHash ).toBe( b.areaSetHash )
    } )

    test( 'duplicate-free — [A,A,B] === [A,B]', () => {
        const a = TaskId.generate( { schemaIdSlug: 's', areas: [ 'single-test', 'single-test', 'tools-aggregate-schema' ] } )
        const b = TaskId.generate( { schemaIdSlug: 's', areas: [ 'single-test', 'tools-aggregate-schema' ] } )
        expect( a.areaSetHash ).toBe( b.areaSetHash )
    } )

    test( 'different set yields different hash', () => {
        const a = TaskId.generate( { schemaIdSlug: 's', areas: [ 'single-test' ] } )
        const b = TaskId.generate( { schemaIdSlug: 's', areas: [ 'tools-aggregate-schema' ] } )
        expect( a.areaSetHash ).not.toBe( b.areaSetHash )
    } )
} )


describe( 'TaskId.generate — validation (no silent defaults)', () => {
    test( 'missing schemaIdSlug raises TID-001', () => {
        const { errors } = TaskId.generate( { areas: [ 'single-test' ] } )
        expect( errors.some( ( e ) => e.startsWith( 'TID-001' ) && e.includes( 'schemaIdSlug' ) ) ).toBe( true )
    } )

    test( 'empty schemaIdSlug raises TID-003', () => {
        const { errors } = TaskId.generate( { schemaIdSlug: '', areas: [ 'single-test' ] } )
        expect( errors.some( ( e ) => e.startsWith( 'TID-003' ) ) ).toBe( true )
    } )

    test( 'empty areas raises TID-003', () => {
        const { errors } = TaskId.generate( { schemaIdSlug: 's', areas: [] } )
        expect( errors.some( ( e ) => e.startsWith( 'TID-003' ) ) ).toBe( true )
    } )

    test( 'non-array areas raises TID-002', () => {
        const { errors } = TaskId.generate( { schemaIdSlug: 's', areas: 'single-test' } )
        expect( errors.some( ( e ) => e.startsWith( 'TID-002' ) ) ).toBe( true )
    } )

    test( 'unknown area raises TID-004 (no skip)', () => {
        const { taskId, errors } = TaskId.generate( { schemaIdSlug: 's', areas: [ 'single-test', 'not-an-area' ] } )
        expect( taskId ).toBeNull()
        expect( errors.some( ( e ) => e.startsWith( 'TID-004' ) && e.includes( 'not-an-area' ) ) ).toBe( true )
    } )
} )


describe( 'TaskId.parse — last-separator split', () => {
    test( 'recovers slug + hash for a simple slug', () => {
        const gen = TaskId.generate( { schemaIdSlug: 'etherscan', areas: [ 'single-test' ] } )
        const { schemaIdSlug, areaSetHash, errors } = TaskId.parse( { taskId: gen.taskId } )
        expect( errors ).toEqual( [] )
        expect( schemaIdSlug ).toBe( 'etherscan' )
        expect( areaSetHash ).toBe( gen.areaSetHash )
    } )

    test( 'splits on the LAST -- so a slug that itself contains -- is recovered', () => {
        const gen = TaskId.generate( { schemaIdSlug: 'flowmcp-community--etherscan--balance', areas: [ 'single-test' ] } )
        const { schemaIdSlug, areaSetHash } = TaskId.parse( { taskId: gen.taskId } )
        expect( schemaIdSlug ).toBe( 'flowmcp-community--etherscan--balance' )
        expect( areaSetHash ).toBe( gen.areaSetHash )
    } )

    test( 'no separator raises TID-006', () => {
        const { errors } = TaskId.parse( { taskId: 'noseparatorhere' } )
        expect( errors.some( ( e ) => e.startsWith( 'TID-006' ) ) ).toBe( true )
    } )

    test( 'malformed (non-8-hex) tail raises TID-007', () => {
        const { errors } = TaskId.parse( { taskId: 'etherscan--zzzz' } )
        expect( errors.some( ( e ) => e.startsWith( 'TID-007' ) ) ).toBe( true )
    } )

    test( 'tail that is too long raises TID-007', () => {
        const { errors } = TaskId.parse( { taskId: 'etherscan--0123456789' } )
        expect( errors.some( ( e ) => e.startsWith( 'TID-007' ) ) ).toBe( true )
    } )

    test( 'missing taskId raises TID-001', () => {
        const { errors } = TaskId.parse( {} )
        expect( errors.some( ( e ) => e.startsWith( 'TID-001' ) ) ).toBe( true )
    } )
} )


describe( 'TaskId.matchesAreaSet — Phase 2 verification primitive', () => {
    test( 'true for the emitting set', () => {
        const gen = TaskId.generate( { schemaIdSlug: 'ns--tool', areas: [ 'about-namespace', 'namespace-skills' ] } )
        const { ok, errors } = TaskId.matchesAreaSet( { taskId: gen.taskId, areas: [ 'namespace-skills', 'about-namespace' ] } )
        expect( errors ).toEqual( [] )
        expect( ok ).toBe( true )
    } )

    test( 'false for a different set', () => {
        const gen = TaskId.generate( { schemaIdSlug: 'ns--tool', areas: [ 'about-namespace' ] } )
        const { ok } = TaskId.matchesAreaSet( { taskId: gen.taskId, areas: [ 'namespace-skills' ] } )
        expect( ok ).toBe( false )
    } )

    test( 'round-trip generate -> parse -> matchesAreaSet', () => {
        const areas = [ 'single-test', 'tools-aggregate-schema', 'namespace-description' ]
        const gen = TaskId.generate( { schemaIdSlug: 'flowmcp-community--ns--tool', areas } )
        const parsed = TaskId.parse( { taskId: gen.taskId } )
        expect( parsed.schemaIdSlug ).toBe( 'flowmcp-community--ns--tool' )
        const match = TaskId.matchesAreaSet( { taskId: gen.taskId, areas } )
        expect( match.ok ).toBe( true )
    } )

    test( 'propagates a parse error on a malformed taskId', () => {
        const { ok, errors } = TaskId.matchesAreaSet( { taskId: 'etherscan--zzzz', areas: [ 'single-test' ] } )
        expect( ok ).toBe( false )
        expect( errors.some( ( e ) => e.startsWith( 'TID-007' ) ) ).toBe( true )
    } )
} )
