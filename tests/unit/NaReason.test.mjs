import { describe, test, expect } from '@jest/globals'

import { NaReason, ALLOWED_NA_REASONS } from '../../src/NaReason.mjs'


describe( 'NaReason.getAllowed', () => {
    test( 'returns 6 closed-set values', () => {
        const { allowed } = NaReason.getAllowed()
        expect( allowed ).toHaveLength( 6 )
        expect( allowed ).toEqual( expect.arrayContaining( [
            'not-applicable-to-tool-type',
            'requires-private-data',
            'blocked-by-precondition',
            'out-of-scope-resource',
            'out-of-scope-prompt',
            'out-of-scope-procedure'
        ] ) )
    } )

    test( 'export ALLOWED_NA_REASONS matches getter', () => {
        const { allowed } = NaReason.getAllowed()
        expect( allowed.slice().sort() ).toEqual( ALLOWED_NA_REASONS.slice().sort() )
    } )
} )


describe( 'NaReason.isAllowed', () => {
    test( 'accepts every closed-set value', () => {
        ALLOWED_NA_REASONS
            .forEach( ( value ) => {
                const r = NaReason.isAllowed( { naReason: value } )
                expect( r.allowed ).toBe( true )
            } )
    } )

    test( 'rejects free-text reason', () => {
        const r = NaReason.isAllowed( { naReason: 'we-felt-like-it' } )
        expect( r.allowed ).toBe( false )
    } )

    test( 'rejects non-string types', () => {
        expect( NaReason.isAllowed( { naReason: null } ).allowed ).toBe( false )
        expect( NaReason.isAllowed( { naReason: 7 } ).allowed ).toBe( false )
        expect( NaReason.isAllowed( {} ).allowed ).toBe( false )
    } )
} )


describe( 'NaReason.validate', () => {
    test( 'grade A without naReason — PASS', () => {
        const r = NaReason.validate( { grade: 'A' } )
        expect( r.status ).toBe( true )
        expect( r.messages ).toEqual( [] )
    } )

    test( 'grade B without naReason — PASS', () => {
        const r = NaReason.validate( { grade: 'B' } )
        expect( r.status ).toBe( true )
    } )

    test( 'grade n/a with closed-set value — PASS', () => {
        const r = NaReason.validate( {
            grade: 'n/a',
            naReason: 'not-applicable-to-tool-type'
        } )
        expect( r.status ).toBe( true )
        expect( r.messages ).toEqual( [] )
    } )

    test( 'grade n/a with free-text — FAIL (NA-001)', () => {
        const r = NaReason.validate( {
            grade: 'n/a',
            naReason: 'because-the-grader-felt-like-it'
        } )
        expect( r.status ).toBe( false )
        expect( r.messages[ 0 ] ).toContain( 'NA-001' )
    } )

    test( 'grade n/a without naReason — FAIL (NA-001)', () => {
        const r = NaReason.validate( { grade: 'n/a' } )
        expect( r.status ).toBe( false )
        expect( r.messages[ 0 ] ).toContain( 'NA-001' )
    } )

    test( 'missing grade — FAIL (NA-001)', () => {
        const r = NaReason.validate( {} )
        expect( r.status ).toBe( false )
        expect( r.messages[ 0 ] ).toContain( 'NA-001' )
    } )

    test( 'non-string grade — FAIL (NA-001)', () => {
        const r = NaReason.validate( { grade: 42 } )
        expect( r.status ).toBe( false )
        expect( r.messages[ 0 ] ).toContain( 'NA-001' )
    } )

    test( 'every closed-set value passes', () => {
        ALLOWED_NA_REASONS
            .forEach( ( value ) => {
                const r = NaReason.validate( { grade: 'n/a', naReason: value } )
                expect( r.status ).toBe( true )
            } )
    } )
} )
