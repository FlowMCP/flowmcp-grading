import { describe, test, expect } from '@jest/globals'

import { SelectionLockfile, OVERRIDE_WHITELIST } from '../../src/SelectionLockfile.mjs'


// The selection.lock.json LIFECYCLE (generate / read / diff) is DROPPED in v2 —
// the frozen member pins now live in selections/<sel>/index.json.lockSnapshot,
// built by RebuildIndex (see RebuildIndex.test.mjs for the salvaged builder).
// Only validateOverride + OVERRIDE_WHITELIST are salvaged here.
describe( 'SelectionLockfile — dropped lifecycle (v2)', () => {
    test( 'generate / read / diff are removed', () => {
        expect( SelectionLockfile.generate ).toBeUndefined()
        expect( SelectionLockfile.read ).toBeUndefined()
        expect( SelectionLockfile.diff ).toBeUndefined()
    } )

    test( 'OVERRIDE_WHITELIST is exported as [name, description]', () => {
        expect( OVERRIDE_WHITELIST ).toEqual( [ 'name', 'description' ] )
    } )
} )


describe( 'SelectionLockfile.validateOverride', () => {
    test( 'accepts whitelisted name + description', () => {
        const r = SelectionLockfile.validateOverride( { override: { name: 'Forecast', description: 'short' } } )
        expect( r.valid ).toBe( true )
        expect( r.errors ).toEqual( [] )
    } )

    test( 'rejects non-whitelisted key with LCK-005', () => {
        const r = SelectionLockfile.validateOverride( { override: { name: 'ok', tags: [ 'x' ] } } )
        expect( r.valid ).toBe( false )
        const has = r.errors.some( ( e ) => e.includes( 'LCK-005' ) )
        expect( has ).toBe( true )
    } )

    test( 'rejects non-string value with LCK-005', () => {
        const r = SelectionLockfile.validateOverride( { override: { name: 42 } } )
        expect( r.valid ).toBe( false )
        expect( r.errors[ 0 ] ).toContain( 'LCK-005' )
    } )

    test( 'rejects empty override with LCK-005', () => {
        const r = SelectionLockfile.validateOverride( { override: {} } )
        expect( r.valid ).toBe( false )
        expect( r.errors[ 0 ] ).toContain( 'LCK-005' )
    } )

    test( 'missing override yields LCK-001', () => {
        const r = SelectionLockfile.validateOverride( {} )
        expect( r.valid ).toBe( false )
        expect( r.errors[ 0 ] ).toContain( 'LCK-001' )
    } )
} )
