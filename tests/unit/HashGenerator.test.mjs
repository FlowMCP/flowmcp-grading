import { describe, test, expect } from '@jest/globals'

import { HashGenerator } from '../../src/HashGenerator.mjs'
import { minimalSchema, minimalSchemaReorderedTools, minimalSchemaRenamedTool, sampleSelection } from '../helpers/sample-schemas.mjs'


describe( 'HashGenerator.canonicalize', () => {
    test( 'deterministic — same input yields same JSON', () => {
        const a = HashGenerator.canonicalize( { value: { b: 1, a: 2 } } )
        const b = HashGenerator.canonicalize( { value: { a: 2, b: 1 } } )
        expect( a.errors ).toEqual( [] )
        expect( b.errors ).toEqual( [] )
        expect( a.json ).toBe( b.json )
    } )

    test( 'arrays keep order — semantic difference matters', () => {
        const a = HashGenerator.canonicalize( { value: { arr: [ 3, 1, 2 ] } } )
        const b = HashGenerator.canonicalize( { value: { arr: [ 1, 2, 3 ] } } )
        expect( a.json ).not.toBe( b.json )
    } )

    test( 'undefined object-properties are skipped', () => {
        const r = HashGenerator.canonicalize( { value: { a: 1, b: undefined } } )
        expect( r.json ).toBe( '{"a":1}' )
    } )

    test( 'null is preserved', () => {
        const r = HashGenerator.canonicalize( { value: { a: null } } )
        expect( r.json ).toBe( '{"a":null}' )
    } )

    test( 'missing value yields HSH-001', () => {
        const r = HashGenerator.canonicalize( {} )
        expect( r.json ).toBeNull()
        expect( r.errors[ 0 ] ).toContain( 'HSH-001' )
    } )

    test( 'function in object yields HSH-004', () => {
        const r = HashGenerator.canonicalize( { value: { fn: () => 1 } } )
        expect( r.errors[ 0 ] ).toContain( 'HSH-004' )
    } )
} )


describe( 'HashGenerator.computeHash', () => {
    test( 'returns 8-hex-char hash', () => {
        const r = HashGenerator.computeHash( { value: { a: 1 } } )
        expect( r.errors ).toEqual( [] )
        expect( r.hash ).toMatch( /^[0-9a-f]{8}$/ )
    } )

    test( 'empty object hashes deterministically', () => {
        const a = HashGenerator.computeHash( { value: {} } )
        const b = HashGenerator.computeHash( { value: {} } )
        expect( a.hash ).toBe( b.hash )
    } )
} )


describe( 'HashGenerator.computeSchemaHash', () => {
    test( 'object-key order does not affect hash', () => {
        const a = HashGenerator.computeSchemaHash( { schema: minimalSchema() } )
        const b = HashGenerator.computeSchemaHash( { schema: minimalSchemaReorderedTools() } )
        expect( a.hash ).toBe( b.hash )
    } )

    test( 'tool rename changes hash', () => {
        const a = HashGenerator.computeSchemaHash( { schema: minimalSchema() } )
        const b = HashGenerator.computeSchemaHash( { schema: minimalSchemaRenamedTool() } )
        expect( a.hash ).not.toBe( b.hash )
    } )

    test( 'schemaHash field is excluded from hash input', () => {
        const schema = minimalSchema()
        const withoutHash = HashGenerator.computeSchemaHash( { schema } )
        const schemaWithSelfHash = { ...schema, schemaHash: 'deadbeef' }
        const withHash = HashGenerator.computeSchemaHash( { schema: schemaWithSelfHash } )
        expect( withoutHash.hash ).toBe( withHash.hash )
    } )

    test( 'missing schema yields HSH-001', () => {
        const r = HashGenerator.computeSchemaHash( {} )
        expect( r.errors[ 0 ] ).toContain( 'HSH-001' )
    } )
} )


describe( 'HashGenerator.computeSelectionHash', () => {
    test( 'selectionHash field is excluded from hash input', () => {
        const sel = sampleSelection()
        const a = HashGenerator.computeSelectionHash( { selection: sel } )
        const b = HashGenerator.computeSelectionHash( { selection: { ...sel, selectionHash: 'beadcafe' } } )
        expect( a.hash ).toBe( b.hash )
    } )
} )


describe( 'HashGenerator.computeNamespaceHash', () => {
    test( 'deterministic over members + aboutHash', () => {
        const a = HashGenerator.computeNamespaceHash( { members: [ { schemaId: 'a' } ], aboutHash: 'xx' } )
        const b = HashGenerator.computeNamespaceHash( { members: [ { schemaId: 'a' } ], aboutHash: 'xx' } )
        expect( a.hash ).toBe( b.hash )
    } )

    test( 'missing members yields HSH-001', () => {
        const r = HashGenerator.computeNamespaceHash( { aboutHash: 'xx' } )
        expect( r.errors[ 0 ] ).toContain( 'HSH-001' )
    } )

    test( 'missing aboutHash yields HSH-001', () => {
        const r = HashGenerator.computeNamespaceHash( { members: [] } )
        expect( r.errors[ 0 ] ).toContain( 'HSH-001' )
    } )
} )


describe( 'HashGenerator.isValidHash', () => {
    test( 'valid 8-hex passes', () => {
        const r = HashGenerator.isValidHash( { hash: 'a1b2c3d4' } )
        expect( r.valid ).toBe( true )
    } )

    test( 'invalid format fails', () => {
        const r = HashGenerator.isValidHash( { hash: 'ZZZZ' } )
        expect( r.valid ).toBe( false )
    } )
} )
