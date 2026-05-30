import { describe, test, expect } from '@jest/globals'

import { ErrorCodes, ERROR_CODE_TABLE } from '../../src/ErrorCodes.mjs'


describe( 'ErrorCodes.getCode', () => {
    test( 'happy path: GRD-001 is found', () => {
        const result = ErrorCodes.getCode( { code: 'GRD-001' } )
        expect( result.found ).toBe( true )
        expect( result.entry.code ).toBe( 'GRD-001' )
        expect( result.entry.severity ).toBe( 'ERROR' )
    } )

    test( 'unknown code returns found=false', () => {
        const result = ErrorCodes.getCode( { code: 'GRD-999' } )
        expect( result.found ).toBe( false )
        expect( result.entry ).toBeNull()
    } )

    test( 'missing param triggers validation error', () => {
        const result = ErrorCodes.getCode( {} )
        expect( result.found ).toBe( false )
        expect( result.errors[ 0 ] ).toContain( 'GRD-001' )
    } )
} )


describe( 'ErrorCodes.formatMessage', () => {
    test( 'replaces template tokens', () => {
        const result = ErrorCodes.formatMessage( {
            code: 'GRD-001',
            context: { field: 'schemaId' }
        } )
        expect( result.message ).toBe( 'Required field missing: schemaId' )
    } )

    test( 'missing context keys leave placeholder', () => {
        const result = ErrorCodes.formatMessage( {
            code: 'GRD-002',
            context: { field: 'x' }
        } )
        expect( result.message ).toContain( '{expected}' )
        expect( result.message ).toContain( 'x' )
    } )

    test( 'unknown code yields error', () => {
        const result = ErrorCodes.formatMessage( {
            code: 'XYZ-000',
            context: {}
        } )
        expect( result.message ).toBeNull()
        expect( result.errors[ 0 ] ).toContain( 'GRD-002' )
    } )
} )


describe( 'ErrorCodes.listByPrefix', () => {
    test( 'returns only GRD-* codes', () => {
        const result = ErrorCodes.listByPrefix( { prefix: 'GRD' } )
        const allGrd = result.codes.every( ( c ) => c.startsWith( 'GRD' ) )
        expect( allGrd ).toBe( true )
        expect( result.codes.length ).toBeGreaterThanOrEqual( 8 )
    } )

    test( 'returns only VET-* codes', () => {
        const result = ErrorCodes.listByPrefix( { prefix: 'VET' } )
        const allVet = result.codes.every( ( c ) => c.startsWith( 'VET' ) )
        expect( allVet ).toBe( true )
        expect( result.codes.length ).toBeGreaterThanOrEqual( 5 )
    } )

    test( 'unknown prefix returns errors', () => {
        const result = ErrorCodes.listByPrefix( { prefix: 'ZZZ' } )
        expect( result.codes ).toEqual( [] )
        expect( result.errors.length ).toBeGreaterThan( 0 )
    } )

    test( 'returns the SKC family (SKC-001/002/003)', () => {
        const result = ErrorCodes.listByPrefix( { prefix: 'SKC' } )
        expect( result.codes.sort() ).toEqual( [ 'SKC-001', 'SKC-002', 'SKC-003' ] )
    } )
} )


describe( 'ErrorCodes.listBySeverity', () => {
    test( 'returns only ERROR severity codes', () => {
        const result = ErrorCodes.listBySeverity( { severity: 'ERROR' } )
        expect( result.codes.length ).toBeGreaterThan( 0 )
    } )

    test( 'returns only INFO severity codes', () => {
        const result = ErrorCodes.listBySeverity( { severity: 'INFO' } )
        expect( result.codes.length ).toBeGreaterThan( 0 )
    } )

    test( 'invalid severity returns errors', () => {
        const result = ErrorCodes.listBySeverity( { severity: 'CRITICAL' } )
        expect( result.codes ).toEqual( [] )
        expect( result.errors.length ).toBeGreaterThan( 0 )
    } )
} )


describe( 'ErrorCodes.validateCodeFormat', () => {
    test( 'GRD-001 is valid', () => {
        const result = ErrorCodes.validateCodeFormat( { code: 'GRD-001' } )
        expect( result.valid ).toBe( true )
    } )

    test( 'GRD-WARN-001 is valid', () => {
        const result = ErrorCodes.validateCodeFormat( { code: 'GRD-WARN-001' } )
        expect( result.valid ).toBe( true )
    } )

    test( 'invalid format rejected', () => {
        const result = ErrorCodes.validateCodeFormat( { code: 'invalid' } )
        expect( result.valid ).toBe( false )
        expect( result.errors.length ).toBeGreaterThan( 0 )
    } )

    test( 'SKC-001 is a valid PREFIX-NUMBER code', () => {
        const result = ErrorCodes.validateCodeFormat( { code: 'SKC-001' } )
        expect( result.valid ).toBe( true )
    } )

    test( 'SKC codes resolve via getCode with ERROR severity', () => {
        const codes = [ 'SKC-001', 'SKC-002', 'SKC-003' ]
        codes
            .forEach( ( code ) => {
                const lookup = ErrorCodes.getCode( { code } )
                expect( lookup.found ).toBe( true )
                expect( lookup.entry.severity ).toBe( 'ERROR' )
            } )
    } )
} )


describe( 'ERROR_CODE_TABLE constant', () => {
    test( 'is frozen', () => {
        expect( Object.isFrozen( ERROR_CODE_TABLE ) ).toBe( true )
        expect( Object.isFrozen( ERROR_CODE_TABLE.GRD ) ).toBe( true )
    } )

    test( 'has minimum inventory', () => {
        expect( Object.keys( ERROR_CODE_TABLE.GRD ).length ).toBeGreaterThanOrEqual( 8 )
        expect( Object.keys( ERROR_CODE_TABLE.SCO ).length ).toBeGreaterThanOrEqual( 6 )
        expect( Object.keys( ERROR_CODE_TABLE.VET ).length ).toBeGreaterThanOrEqual( 5 )
    } )
} )
