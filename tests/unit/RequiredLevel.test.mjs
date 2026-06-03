import { describe, test, expect } from '@jest/globals'

import { RequiredLevel, LEVEL_LADDER } from '../../src/RequiredLevel.mjs'


const okPretest = { ok: true }
const failPretest = { ok: false }


describe( 'RequiredLevel.getLadder', () => {
    test( 'returns the fixed 4-level ladder in order', () => {
        const { ladder, errors } = RequiredLevel.getLadder()
        expect( errors ).toEqual( [] )
        expect( ladder ).toEqual( [ 'imported', 'structural-valid', 'deterministic-green', 'stable' ] )
    } )

    test( 'returns a copy — caller cannot mutate the frozen const', () => {
        const { ladder } = RequiredLevel.getLadder()
        ladder.push( 'tampered' )
        expect( LEVEL_LADDER ).toEqual( [ 'imported', 'structural-valid', 'deterministic-green', 'stable' ] )
    } )
} )


describe( 'RequiredLevel.derive — level boundaries', () => {
    test( 'stable iff gradingStatus === stable', () => {
        const { level, errors } = RequiredLevel.derive( {
            imported: true, structuralValid: true, dataPretest: okPretest, detGreen: true, gradingStatus: 'stable'
        } )
        expect( errors ).toEqual( [] )
        expect( level ).toBe( 'stable' )
    } )

    test( 'deterministic-green requires structuralValid + dataPretest.ok + detGreen', () => {
        const { level, errors } = RequiredLevel.derive( {
            imported: true, structuralValid: true, dataPretest: okPretest, detGreen: true, gradingStatus: 'graded'
        } )
        expect( errors ).toEqual( [] )
        expect( level ).toBe( 'deterministic-green' )
    } )

    test( 'detGreen false (HTTP non-200) does NOT reach deterministic-green', () => {
        const { level } = RequiredLevel.derive( {
            imported: true, structuralValid: true, dataPretest: okPretest, detGreen: false, gradingStatus: 'graded'
        } )
        expect( level ).toBe( 'structural-valid' )
    } )

    test( 'dataPretest not ok does NOT reach deterministic-green', () => {
        const { level } = RequiredLevel.derive( {
            imported: true, structuralValid: true, dataPretest: failPretest, detGreen: true, gradingStatus: 'graded'
        } )
        expect( level ).toBe( 'structural-valid' )
    } )

    test( 'structural-valid when only structuralValid is true', () => {
        const { level } = RequiredLevel.derive( {
            imported: true, structuralValid: true, dataPretest: failPretest, detGreen: false, gradingStatus: 'pending'
        } )
        expect( level ).toBe( 'structural-valid' )
    } )

    test( 'imported when only imported is true', () => {
        const { level } = RequiredLevel.derive( {
            imported: true, structuralValid: false, dataPretest: failPretest, detGreen: false, gradingStatus: 'pending'
        } )
        expect( level ).toBe( 'imported' )
    } )

    test( 'null + RLV-004 when not even imported', () => {
        const { level, errors } = RequiredLevel.derive( {
            imported: false, structuralValid: false, dataPretest: failPretest, detGreen: false, gradingStatus: 'pending'
        } )
        expect( level ).toBeNull()
        expect( errors[ 0 ] ).toMatch( /^RLV-004:/ )
    } )

    test( 'stable wins even when det signals are false', () => {
        const { level } = RequiredLevel.derive( {
            imported: false, structuralValid: false, dataPretest: failPretest, detGreen: false, gradingStatus: 'stable'
        } )
        expect( level ).toBe( 'stable' )
    } )
} )


describe( 'RequiredLevel.derive — input validation (no silent defaults)', () => {
    test( 'missing imported raises RLV-001', () => {
        const { level, errors } = RequiredLevel.derive( {
            structuralValid: true, dataPretest: okPretest, detGreen: true, gradingStatus: 'graded'
        } )
        expect( level ).toBeNull()
        expect( errors.some( ( e ) => e.startsWith( 'RLV-001' ) && e.includes( 'imported' ) ) ).toBe( true )
    } )

    test( 'non-boolean structuralValid raises RLV-002', () => {
        const { errors } = RequiredLevel.derive( {
            imported: true, structuralValid: 'yes', dataPretest: okPretest, detGreen: true, gradingStatus: 'graded'
        } )
        expect( errors.some( ( e ) => e.startsWith( 'RLV-002' ) && e.includes( 'structuralValid' ) ) ).toBe( true )
    } )

    test( 'missing dataPretest raises RLV-001', () => {
        const { errors } = RequiredLevel.derive( {
            imported: true, structuralValid: true, detGreen: true, gradingStatus: 'graded'
        } )
        expect( errors.some( ( e ) => e.startsWith( 'RLV-001' ) && e.includes( 'dataPretest' ) ) ).toBe( true )
    } )

    test( 'non-string gradingStatus raises RLV-002', () => {
        const { errors } = RequiredLevel.derive( {
            imported: true, structuralValid: true, dataPretest: okPretest, detGreen: true, gradingStatus: 5
        } )
        expect( errors.some( ( e ) => e.startsWith( 'RLV-002' ) && e.includes( 'gradingStatus' ) ) ).toBe( true )
    } )
} )


describe( 'RequiredLevel.meets — ordered ladder', () => {
    test( 'equal level satisfies the requirement', () => {
        const { ok, errors } = RequiredLevel.meets( { level: 'deterministic-green', requiredLevel: 'deterministic-green' } )
        expect( errors ).toEqual( [] )
        expect( ok ).toBe( true )
    } )

    test( 'higher level satisfies a lower requirement', () => {
        const { ok } = RequiredLevel.meets( { level: 'stable', requiredLevel: 'structural-valid' } )
        expect( ok ).toBe( true )
    } )

    test( 'lower level does not satisfy a higher requirement', () => {
        const { ok } = RequiredLevel.meets( { level: 'structural-valid', requiredLevel: 'deterministic-green' } )
        expect( ok ).toBe( false )
    } )

    test( 'imported never meets stable', () => {
        const { ok } = RequiredLevel.meets( { level: 'imported', requiredLevel: 'stable' } )
        expect( ok ).toBe( false )
    } )

    test( 'unknown level raises RLV-003', () => {
        const { ok, errors } = RequiredLevel.meets( { level: 'bogus', requiredLevel: 'stable' } )
        expect( ok ).toBe( false )
        expect( errors.some( ( e ) => e.startsWith( 'RLV-003' ) ) ).toBe( true )
    } )

    test( 'missing requiredLevel raises RLV-001', () => {
        const { errors } = RequiredLevel.meets( { level: 'stable' } )
        expect( errors.some( ( e ) => e.startsWith( 'RLV-001' ) && e.includes( 'requiredLevel' ) ) ).toBe( true )
    } )
} )


describe( 'RequiredLevel.deriveSchemaLevel — signal-gathering wrapper (PRD-006)', () => {
    test( 'snapshotPresent only -> imported', () => {
        const { level, errors } = RequiredLevel.deriveSchemaLevel( {
            snapshotPresent: true, structuralValid: false, dataPretest: failPretest, detGreen: false, gradingStatus: 'pending'
        } )
        expect( errors ).toEqual( [] )
        expect( level ).toBe( 'imported' )
    } )

    test( 'structuralValid -> structural-valid', () => {
        const { level, errors } = RequiredLevel.deriveSchemaLevel( {
            snapshotPresent: true, structuralValid: true, dataPretest: failPretest, detGreen: false, gradingStatus: 'pending'
        } )
        expect( errors ).toEqual( [] )
        expect( level ).toBe( 'structural-valid' )
    } )

    test( 'pretest ok + detGreen + structural -> deterministic-green', () => {
        const { level, errors } = RequiredLevel.deriveSchemaLevel( {
            snapshotPresent: true, structuralValid: true, dataPretest: okPretest, detGreen: true, gradingStatus: 'pending'
        } )
        expect( errors ).toEqual( [] )
        expect( level ).toBe( 'deterministic-green' )
    } )

    test( 'HTTP 4xx (pretest not ok) does NOT reach deterministic-green', () => {
        const { level } = RequiredLevel.deriveSchemaLevel( {
            snapshotPresent: true, structuralValid: true, dataPretest: { ok: false }, detGreen: true, gradingStatus: 'pending'
        } )
        expect( level ).toBe( 'structural-valid' )
    } )

    test( 'missing snapshotPresent raises RLV-001', () => {
        const { errors } = RequiredLevel.deriveSchemaLevel( {
            structuralValid: true, dataPretest: okPretest, detGreen: true, gradingStatus: 'pending'
        } )
        expect( errors.some( ( e ) => e.startsWith( 'RLV-001' ) && e.includes( 'snapshotPresent' ) ) ).toBe( true )
    } )
} )


describe( 'RequiredLevel.deriveNamespaceLevel — fold to the weakest schema (PRD-006)', () => {
    test( 'all deterministic-green -> deterministic-green', () => {
        const { level, errors } = RequiredLevel.deriveNamespaceLevel( {
            schemaLevels: [ 'deterministic-green', 'deterministic-green' ]
        } )
        expect( errors ).toEqual( [] )
        expect( level ).toBe( 'deterministic-green' )
    } )

    test( 'one schema below pulls the namespace down (weakest wins)', () => {
        const { level } = RequiredLevel.deriveNamespaceLevel( {
            schemaLevels: [ 'deterministic-green', 'structural-valid', 'stable' ]
        } )
        expect( level ).toBe( 'structural-valid' )
    } )

    test( 'empty schema list raises RLV-004', () => {
        const { errors } = RequiredLevel.deriveNamespaceLevel( { schemaLevels: [] } )
        expect( errors.some( ( e ) => e.startsWith( 'RLV-004' ) ) ).toBe( true )
    } )

    test( 'unknown level raises RLV-003', () => {
        const { errors } = RequiredLevel.deriveNamespaceLevel( { schemaLevels: [ 'made-up' ] } )
        expect( errors.some( ( e ) => e.startsWith( 'RLV-003' ) ) ).toBe( true )
    } )
} )
