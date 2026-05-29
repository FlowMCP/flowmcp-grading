import { describe, test, expect } from '@jest/globals'

import { Grading } from '../../src/Grading.mjs'
import { validAutonomousEntry, validGroupBoundEntry, sampleGrading } from '../helpers/fixtures.mjs'


describe( 'Grading.getVersion', () => {
    test( 'returns gradingSystem/1.0.0', () => {
        const result = Grading.getVersion()
        expect( result.version ).toBe( 'gradingSystem/1.0.0' )
    } )
} )


describe( 'Grading.createEntry', () => {
    test( 'happy path autonomous', () => {
        const result = Grading.createEntry( {
            schemaId: 'demo',
            selectionId: null,
            gradingTier: 'autonomous',
            grader: { kind: 'script', name: 'unit', version: '0.0.1' },
            options: {}
        } )
        expect( result.errors ).toEqual( [] )
        expect( result.entry.gradingTier ).toBe( 'autonomous' )
        expect( result.entry.maxAttainableGrade ).toBe( 'B' )
    } )

    test( 'happy path group-bound', () => {
        const result = Grading.createEntry( {
            schemaId: 'demo',
            selectionId: 'sel-1',
            gradingTier: 'group-bound',
            grader: { kind: 'script', name: 'unit', version: '0.0.1' },
            options: {}
        } )
        expect( result.errors ).toEqual( [] )
        expect( result.entry.maxAttainableGrade ).toBe( 'A' )
    } )

    test( 'group-bound without selectionId yields GRD-004', () => {
        const result = Grading.createEntry( {
            schemaId: 'demo',
            selectionId: null,
            gradingTier: 'group-bound',
            grader: { kind: 'script', name: 'unit', version: '0.0.1' },
            options: {}
        } )
        const hasErr = result.errors.some( ( e ) => e.includes( 'GRD-004' ) )
        expect( hasErr ).toBe( true )
    } )

    test( 'graderIdentity.kind=llm without llmModel yields GRD-007', () => {
        const result = Grading.createEntry( {
            schemaId: 'demo',
            selectionId: null,
            gradingTier: 'autonomous',
            grader: { kind: 'llm', name: 'unit', version: '0.0.1' },
            options: {}
        } )
        const hasErr = result.errors.some( ( e ) => e.includes( 'GRD-007' ) )
        expect( hasErr ).toBe( true )
    } )
} )


describe( 'Grading.addGrading', () => {
    test( 'happy path — entry appended, no consolidation', () => {
        const entry = validAutonomousEntry()
        const grading = sampleGrading( { score: 'pass', dimension: 'apiAvailability', weight: 1.0 } )
        const result = Grading.addGrading( { entry, grading } )
        expect( result.errors ).toEqual( [] )
        expect( result.entry.gradings.length ).toBe( 1 )
        expect( result.entry.gradings[ 0 ].dimension ).toBe( 'apiAvailability' )
    } )

    test( 'non-deterministic without personaIds yields GRD-005', () => {
        const entry = validAutonomousEntry()
        const grading = {
            dimension: 'descriptionNeutrality',
            score: 'pass',
            determinism: 'non-deterministic',
            selectionContext: {}
        }
        const result = Grading.addGrading( { entry, grading } )
        const hasErr = result.errors.some( ( e ) => e.includes( 'GRD-005' ) )
        expect( hasErr ).toBe( true )
    } )

    test( 'non-deterministic with personaIds passes', () => {
        const entry = validAutonomousEntry()
        const grading = {
            dimension: 'descriptionNeutrality',
            score: 'pass',
            determinism: 'non-deterministic',
            selectionContext: { personaIds: [ 'persona-1' ] }
        }
        const result = Grading.addGrading( { entry, grading } )
        expect( result.errors ).toEqual( [] )
    } )
} )


describe( 'Grading.computeAggregateGrade', () => {
    test( 'categoricalVeto != null yields REJECTED', () => {
        const entry = validAutonomousEntry()
        entry.categoricalVeto = {
            triggeredBy: 'malicious-module',
            evidence: { note: 'fixture' }
        }
        const result = Grading.computeAggregateGrade( { entry } )
        expect( result.aggregateGrade ).toBe( 'REJECTED' )
    } )

    test( 'autonomous tier → maxAttainableGrade=B', () => {
        const entry = validAutonomousEntry()
        const result = Grading.computeAggregateGrade( { entry } )
        expect( result.maxAttainableGrade ).toBe( 'B' )
    } )

    test( 'group-bound tier → maxAttainableGrade=A', () => {
        const entry = validGroupBoundEntry()
        const result = Grading.computeAggregateGrade( { entry } )
        expect( result.maxAttainableGrade ).toBe( 'A' )
    } )
} )


describe( 'Grading.applyRegradingTrigger', () => {
    test( 'creates new entry, old entry untouched', () => {
        const entry = validAutonomousEntry()
        const oldGradingsLen = entry.gradings.length
        const result = Grading.applyRegradingTrigger( {
            entry,
            regradingTrigger: 'apiBreakingChange'
        } )
        expect( result.errors ).toEqual( [] )
        expect( result.newEntry.previousGradingId ).not.toBeNull()
        expect( entry.gradings.length ).toBe( oldGradingsLen )
    } )

    test( 'previousGradingId is set on new entry', () => {
        const entry = validAutonomousEntry()
        const result = Grading.applyRegradingTrigger( {
            entry,
            regradingTrigger: 'tosUpdate'
        } )
        expect( typeof result.newEntry.previousGradingId ).toBe( 'string' )
        expect( result.newEntry.regradingTrigger ).toBe( 'tosUpdate' )
    } )
} )


describe( 'Grading.checkAging', () => {
    test( 'entry older than 14 days → dimension marked stale', () => {
        const entry = validAutonomousEntry()
        entry.gradings = [
            {
                dimension: 'apiAvailability',
                score: 'pass',
                recordedAt: '2026-01-01T00:00:00.000Z'
            }
        ]
        const result = Grading.checkAging( {
            entry,
            now: '2026-02-01T00:00:00.000Z'
        } )
        expect( result.agedDimensions ).toContain( 'apiAvailability' )
        expect( result.entry.gradings[ 0 ].score ).toBe( 'stale' )
    } )

    test( 'entry older than 180 days → GRD-WARN-001', () => {
        const entry = validAutonomousEntry()
        entry.gradings = [
            {
                dimension: 'apiAvailability',
                score: 'pass',
                recordedAt: '2025-01-01T00:00:00.000Z'
            }
        ]
        const result = Grading.checkAging( {
            entry,
            now: '2026-01-01T00:00:00.000Z'
        } )
        const hasWarn = result.errors.some( ( e ) => e.includes( 'GRD-WARN-001' ) )
        expect( hasWarn ).toBe( true )
    } )
} )
