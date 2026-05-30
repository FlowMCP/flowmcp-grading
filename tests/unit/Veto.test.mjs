import { describe, test, expect } from '@jest/globals'

import { Veto, REJECTED_AGGREGATE_GRADE, REJECTED_NODE_STATUS } from '../../src/Veto.mjs'
import { validAutonomousEntry, vetoExample } from '../helpers/fixtures.mjs'


describe( 'Veto.getTriggers', () => {
    test( 'returns exactly four closed triggers (Memo Z. 279)', () => {
        const result = Veto.getTriggers()
        expect( result.triggers ).toEqual( [
            'malicious-module',
            'api-key-domain-mismatch',
            'illegal-content',
            'ai-security-veto'
        ] )
    } )

    test( 'each trigger is present', () => {
        const result = Veto.getTriggers()
        expect( result.triggers ).toContain( 'malicious-module' )
        expect( result.triggers ).toContain( 'api-key-domain-mismatch' )
        expect( result.triggers ).toContain( 'illegal-content' )
        expect( result.triggers ).toContain( 'ai-security-veto' )
    } )
} )


describe( 'Veto.applyVeto', () => {
    test( 'happy path with triggeredBy=malicious-module', () => {
        const entry = validAutonomousEntry()
        const result = Veto.applyVeto( {
            entry,
            triggeredBy: 'malicious-module',
            grader: { kind: 'human', name: 'reviewer', version: '0.0.1' },
            evidence: { note: 'fixture' }
        } )
        expect( result.errors ).toEqual( [] )
        expect( result.entry.categoricalVeto.triggeredBy ).toBe( 'malicious-module' )
        expect( result.entry.aggregateGrade ).toBe( 'REJECTED' )
    } )

    test( 'invalid trigger yields VET-001', () => {
        const entry = validAutonomousEntry()
        const result = Veto.applyVeto( {
            entry,
            triggeredBy: 'invalid-trigger',
            grader: { kind: 'human', name: 'r', version: '0.0.1' },
            evidence: { note: 'fixture' }
        } )
        const hasErr = result.errors.some( ( e ) => e.includes( 'VET-001' ) )
        expect( hasErr ).toBe( true )
    } )

    test( 'missing evidence yields VET-002', () => {
        const entry = validAutonomousEntry()
        const result = Veto.applyVeto( {
            entry,
            triggeredBy: 'illegal-content',
            grader: { kind: 'human', name: 'r', version: '0.0.1' }
        } )
        const hasErr = result.errors.some( ( e ) => e.includes( 'VET-002' ) )
        expect( hasErr ).toBe( true )
    } )

    test( 'ai-security-veto without reasoning yields VET-003', () => {
        const entry = validAutonomousEntry()
        const result = Veto.applyVeto( {
            entry,
            triggeredBy: 'ai-security-veto',
            grader: { kind: 'llm', name: 'r', version: '0.0.1', llmModel: 'opus-4-7' },
            evidence: { note: 'fixture' }
        } )
        const hasErr = result.errors.some( ( e ) => e.includes( 'VET-003' ) )
        expect( hasErr ).toBe( true )
    } )

    test( 'ai-security-veto with reasoning succeeds', () => {
        const entry = validAutonomousEntry()
        const result = Veto.applyVeto( {
            entry,
            triggeredBy: 'ai-security-veto',
            grader: { kind: 'llm', name: 'r', version: '0.0.1', llmModel: 'opus-4-7' },
            evidence: { note: 'fixture' },
            reasoning: 'detected pattern X in prompt vector'
        } )
        expect( result.errors ).toEqual( [] )
    } )
} )


describe( 'Veto.isVetoed', () => {
    test( 'entry without veto → vetoed=false', () => {
        const entry = validAutonomousEntry()
        const result = Veto.isVetoed( { entry } )
        expect( result.vetoed ).toBe( false )
        expect( result.triggeredBy ).toBeNull()
    } )

    test( 'entry with veto → vetoed=true', () => {
        const entry = validAutonomousEntry()
        entry.categoricalVeto = vetoExample()
        const result = Veto.isVetoed( { entry } )
        expect( result.vetoed ).toBe( true )
        expect( result.triggeredBy ).toBe( 'malicious-module' )
    } )
} )


describe( 'Veto.validateVeto', () => {
    test( 'happy path veto is valid', () => {
        const veto = vetoExample()
        const result = Veto.validateVeto( { veto } )
        expect( result.valid ).toBe( true )
    } )

    test( 'veto with invalid trigger is rejected', () => {
        const veto = vetoExample()
        veto.triggeredBy = 'nonsense'
        const result = Veto.validateVeto( { veto } )
        expect( result.valid ).toBe( false )
        expect( result.errors.some( ( e ) => e.includes( 'VET-001' ) ) ).toBe( true )
    } )
} )


describe( 'Veto.mapAggregateGradeToStatus (REJECTED -> rejected)', () => {
    test( 'REJECTED maps to node status rejected', () => {
        const result = Veto.mapAggregateGradeToStatus( { aggregateGrade: REJECTED_AGGREGATE_GRADE } )
        expect( result.status ).toBe( REJECTED_NODE_STATUS )
        expect( result.status ).toBe( 'rejected' )
        expect( result.errors ).toEqual( [] )
    } )

    test( 'a vetoed entry aggregates to REJECTED and derives status rejected', () => {
        const veto = vetoExample()
        const applied = Veto.applyVeto( {
            entry: validAutonomousEntry(),
            triggeredBy: veto.triggeredBy,
            grader: veto.grader,
            evidence: veto.evidence,
            reasoning: veto.reasoning
        } )
        expect( applied.entry.aggregateGrade ).toBe( 'REJECTED' )
        const mapped = Veto.mapAggregateGradeToStatus( { aggregateGrade: applied.entry.aggregateGrade } )
        expect( mapped.status ).toBe( 'rejected' )
    } )

    test( 'a non-REJECTED grade is left to the downstream rollup (no silent default)', () => {
        const result = Veto.mapAggregateGradeToStatus( { aggregateGrade: 'B' } )
        expect( result.status ).toBeNull()
        expect( result.errors ).toEqual( [] )
    } )

    test( 'missing aggregateGrade is an explicit error, not a default', () => {
        const result = Veto.mapAggregateGradeToStatus( {} )
        expect( result.status ).toBeNull()
        expect( result.errors.some( ( e ) => e.includes( 'GRD-001' ) ) ).toBe( true )
    } )
} )
