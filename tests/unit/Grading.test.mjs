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


// Loop fields on createEntry
describe( 'Grading.createEntry: iteration', () => {
    const baseInput = {
        schemaId: 'demo',
        selectionId: null,
        gradingTier: 'autonomous',
        grader: { kind: 'script', name: 'unit', version: '0.0.1' },
        options: {}
    }

    test( 'iteration: 0 akzeptiert', () => {
        const result = Grading.createEntry( Object.assign( {}, baseInput, { iteration: 0 } ) )
        expect( result.errors ).toEqual( [] )
        expect( result.entry.iteration ).toBe( 0 )
    } )

    test( 'iteration: 3 akzeptiert', () => {
        const result = Grading.createEntry( Object.assign( {}, baseInput, { iteration: 3 } ) )
        expect( result.errors ).toEqual( [] )
        expect( result.entry.iteration ).toBe( 3 )
    } )

    test( 'iteration: -1 wirft GRD-030', () => {
        const result = Grading.createEntry( Object.assign( {}, baseInput, { iteration: -1 } ) )
        const hasErr = result.errors.some( ( e ) => e.includes( 'GRD-030' ) )
        expect( hasErr ).toBe( true )
    } )

    test( 'iteration: \'a\' (non-integer) wirft GRD-030', () => {
        const result = Grading.createEntry( Object.assign( {}, baseInput, { iteration: 'a' } ) )
        const hasErr = result.errors.some( ( e ) => e.includes( 'GRD-030' ) )
        expect( hasErr ).toBe( true )
    } )

    test( 'iteration: 11 (above max) wirft GRD-030', () => {
        const result = Grading.createEntry( Object.assign( {}, baseInput, { iteration: 11 } ) )
        const hasErr = result.errors.some( ( e ) => e.includes( 'GRD-030' ) )
        expect( hasErr ).toBe( true )
    } )

    test( 'iteration omitted → entry has no iteration field (no silent default)', () => {
        const result = Grading.createEntry( Object.assign( {}, baseInput ) )
        expect( result.errors ).toEqual( [] )
        expect( 'iteration' in result.entry ).toBe( false )
    } )
} )


describe( 'Grading.createEntry: improvementHints', () => {
    const baseInput = {
        schemaId: 'demo',
        selectionId: null,
        gradingTier: 'autonomous',
        grader: { kind: 'script', name: 'unit', version: '0.0.1' },
        options: {}
    }

    test( 'empty array akzeptiert', () => {
        const result = Grading.createEntry( Object.assign( {}, baseInput, { improvementHints: [] } ) )
        expect( result.errors ).toEqual( [] )
        expect( result.entry.improvementHints ).toEqual( [] )
    } )

    test( 'array of strings akzeptiert', () => {
        const result = Grading.createEntry( Object.assign( {}, baseInput, { improvementHints: [ 'hint1', 'hint2' ] } ) )
        expect( result.errors ).toEqual( [] )
        expect( result.entry.improvementHints ).toEqual( [ 'hint1', 'hint2' ] )
    } )

    test( 'array with empty string wirft GRD-031', () => {
        const result = Grading.createEntry( Object.assign( {}, baseInput, { improvementHints: [ 'hint1', '' ] } ) )
        const hasErr = result.errors.some( ( e ) => e.includes( 'GRD-031' ) && e.includes( '[1]' ) )
        expect( hasErr ).toBe( true )
    } )

    test( 'non-array (string) wirft GRD-031', () => {
        const result = Grading.createEntry( Object.assign( {}, baseInput, { improvementHints: 'string-not-array' } ) )
        const hasErr = result.errors.some( ( e ) => e.includes( 'GRD-031' ) )
        expect( hasErr ).toBe( true )
    } )

    test( 'array with non-string element wirft GRD-031', () => {
        const result = Grading.createEntry( Object.assign( {}, baseInput, { improvementHints: [ 'hint1', 42 ] } ) )
        const hasErr = result.errors.some( ( e ) => e.includes( 'GRD-031' ) && e.includes( '[1]' ) )
        expect( hasErr ).toBe( true )
    } )
} )


describe( 'Grading.createEntry: persona', () => {
    const baseInput = {
        schemaId: 'demo',
        selectionId: null,
        gradingTier: 'autonomous',
        grader: { kind: 'script', name: 'unit', version: '0.0.1' },
        options: {}
    }

    test( 'persona: \'neutral\' akzeptiert', () => {
        const result = Grading.createEntry( Object.assign( {}, baseInput, { persona: 'neutral' } ) )
        expect( result.errors ).toEqual( [] )
        expect( result.entry.persona ).toBe( 'neutral' )
    } )

    test( 'persona: \'decision-maker--crypto-trader\' akzeptiert', () => {
        const result = Grading.createEntry( Object.assign( {}, baseInput, { persona: 'decision-maker--crypto-trader' } ) )
        expect( result.errors ).toEqual( [] )
        expect( result.entry.persona ).toBe( 'decision-maker--crypto-trader' )
    } )

    test( 'persona: \'\' (empty string) wirft GRD-032', () => {
        const result = Grading.createEntry( Object.assign( {}, baseInput, { persona: '' } ) )
        const hasErr = result.errors.some( ( e ) => e.includes( 'GRD-032' ) )
        expect( hasErr ).toBe( true )
    } )

    test( 'persona: \'crypto-trader\' (single segment) wirft GRD-032', () => {
        const result = Grading.createEntry( Object.assign( {}, baseInput, { persona: 'crypto-trader' } ) )
        const hasErr = result.errors.some( ( e ) => e.includes( 'GRD-032' ) )
        expect( hasErr ).toBe( true )
    } )

    test( 'persona: \'Decision-Maker--Crypto\' (uppercase) wirft GRD-032', () => {
        const result = Grading.createEntry( Object.assign( {}, baseInput, { persona: 'Decision-Maker--Crypto' } ) )
        const hasErr = result.errors.some( ( e ) => e.includes( 'GRD-032' ) )
        expect( hasErr ).toBe( true )
    } )
} )


describe( 'Grading.readEntry: backward-compat', () => {
    test( 'legacy file without loop fields gets defaults', () => {
        const legacyJson = JSON.stringify( {
            gradingId: 'PLACEHOLDER001--2026-05-29T03-00-00Z',
            schemaId: 'brightsky.bright-sky',
            schemaHash: 'PLACEHOLDER001',
            gradingTier: 'autonomous',
            grader: { kind: 'script', name: 'pilot', version: '0.0.1' },
            gradings: [],
            categoricalVeto: null,
            aggregateGrade: null,
            maxAttainableGrade: 'B'
        } )
        const result = Grading.readEntry( { json: legacyJson } )
        expect( result.errors ).toEqual( [] )
        expect( result.entry.iteration ).toBe( 0 )
        expect( result.entry.improvementHints ).toEqual( [] )
        expect( result.entry.persona ).toBe( 'neutral' )
    } )

    test( 'new file with loop fields preserved (no mutation)', () => {
        const newJson = JSON.stringify( {
            gradingId: 'a1b2c3d4--2026-05-30T10-15-00Z',
            schemaId: 'etherscan.getContractEthereum',
            schemaHash: 'a1b2c3d4',
            gradingTier: 'autonomous',
            grader: { kind: 'llm', name: 'claude-opus', version: '1m', llmModel: 'claude-opus' },
            gradings: [],
            categoricalVeto: null,
            aggregateGrade: 'B',
            maxAttainableGrade: 'B',
            iteration: 2,
            improvementHints: [ 'Add reference to use case.' ],
            persona: 'decision-maker--crypto-trader'
        } )
        const result = Grading.readEntry( { json: newJson } )
        expect( result.errors ).toEqual( [] )
        expect( result.entry.iteration ).toBe( 2 )
        expect( result.entry.improvementHints ).toEqual( [ 'Add reference to use case.' ] )
        expect( result.entry.persona ).toBe( 'decision-maker--crypto-trader' )
    } )

    test( 'invalid JSON → GRD-020', () => {
        const result = Grading.readEntry( { json: '{not valid json' } )
        const hasErr = result.errors.some( ( e ) => e.includes( 'GRD-020' ) )
        expect( hasErr ).toBe( true )
    } )

    test( 'missing json param → GRD-001', () => {
        const result = Grading.readEntry( { json: null } )
        const hasErr = result.errors.some( ( e ) => e.includes( 'GRD-001' ) )
        expect( hasErr ).toBe( true )
    } )
} )


// Filename helper
describe( 'Grading.formatGradingFilename: hash', () => {
    test( 'hash: 8-hex akzeptiert', () => {
        const { filename } = Grading.formatGradingFilename( {
            hash: 'a1b2c3d4',
            ts: '2026-05-30T10-15-00Z',
            persona: 'neutral'
        } )
        expect( filename ).toBe( 'a1b2c3d4--2026-05-30T10-15-00Z--neutral.json' )
    } )

    test( 'hash: PLACEHOLDER001 akzeptiert (legacy pilot files)', () => {
        const { filename } = Grading.formatGradingFilename( {
            hash: 'PLACEHOLDER001',
            ts: '2026-05-29T03-00-00Z',
            persona: 'neutral'
        } )
        expect( filename ).toBe( 'PLACEHOLDER001--2026-05-29T03-00-00Z--neutral.json' )
    } )

    test( 'hash: \'abc\' (zu kurz) wirft GRD-040', () => {
        expect( () => Grading.formatGradingFilename( {
            hash: 'abc',
            ts: '2026-05-30T10-15-00Z',
            persona: 'neutral'
        } ) ).toThrow( /GRD-040/ )
    } )

    test( 'hash: \'XYZ123\' (kein hex) wirft GRD-040', () => {
        expect( () => Grading.formatGradingFilename( {
            hash: 'XYZ123',
            ts: '2026-05-30T10-15-00Z',
            persona: 'neutral'
        } ) ).toThrow( /GRD-040/ )
    } )
} )


describe( 'Grading.formatGradingFilename: ts', () => {
    test( 'ts: \'2026-05-30T10-15-00Z\' akzeptiert', () => {
        const { filename } = Grading.formatGradingFilename( {
            hash: 'a1b2c3d4',
            ts: '2026-05-30T10-15-00Z',
            persona: 'neutral'
        } )
        expect( filename ).toContain( '2026-05-30T10-15-00Z' )
    } )

    test( 'ts: \'2026-05-30T10:15:00Z\' (Doppelpunkte) wirft GRD-041', () => {
        expect( () => Grading.formatGradingFilename( {
            hash: 'a1b2c3d4',
            ts: '2026-05-30T10:15:00Z',
            persona: 'neutral'
        } ) ).toThrow( /GRD-041/ )
    } )

    test( 'ts: \'2026-05-30\' (kein Zeit-Anteil) wirft GRD-041', () => {
        expect( () => Grading.formatGradingFilename( {
            hash: 'a1b2c3d4',
            ts: '2026-05-30',
            persona: 'neutral'
        } ) ).toThrow( /GRD-041/ )
    } )
} )


describe( 'Grading.formatGradingFilename: persona', () => {
    test( 'persona: \'neutral\' akzeptiert', () => {
        const { filename } = Grading.formatGradingFilename( {
            hash: 'a1b2c3d4',
            ts: '2026-05-30T10-15-00Z',
            persona: 'neutral'
        } )
        expect( filename ).toContain( '--neutral.json' )
    } )

    test( 'persona: \'decision-maker--crypto-trader\' akzeptiert', () => {
        const { filename } = Grading.formatGradingFilename( {
            hash: 'a1b2c3d4',
            ts: '2026-05-30T10-15-00Z',
            persona: 'decision-maker--crypto-trader'
        } )
        expect( filename ).toBe( 'a1b2c3d4--2026-05-30T10-15-00Z--decision-maker--crypto-trader.json' )
    } )

    test( 'persona: \'\' (empty) wirft GRD-001', () => {
        expect( () => Grading.formatGradingFilename( {
            hash: 'a1b2c3d4',
            ts: '2026-05-30T10-15-00Z',
            persona: ''
        } ) ).toThrow( /GRD-042/ )
    } )

    test( 'persona: \'crypto-trader\' (single segment) wirft GRD-042', () => {
        expect( () => Grading.formatGradingFilename( {
            hash: 'a1b2c3d4',
            ts: '2026-05-30T10-15-00Z',
            persona: 'crypto-trader'
        } ) ).toThrow( /GRD-042/ )
    } )

    test( 'persona: \'Decision-Maker--Crypto\' (uppercase) wirft GRD-042', () => {
        expect( () => Grading.formatGradingFilename( {
            hash: 'a1b2c3d4',
            ts: '2026-05-30T10-15-00Z',
            persona: 'Decision-Maker--Crypto'
        } ) ).toThrow( /GRD-042/ )
    } )
} )


describe( 'Grading.formatGradingFilename: output snapshots', () => {
    test( 'snapshot row 1 — full persona', () => {
        const { filename } = Grading.formatGradingFilename( {
            hash: 'a1b2c3d4',
            ts: '2026-05-30T10-15-00Z',
            persona: 'decision-maker--crypto-trader'
        } )
        expect( filename ).toBe( 'a1b2c3d4--2026-05-30T10-15-00Z--decision-maker--crypto-trader.json' )
    } )

    test( 'snapshot row 2 — neutral', () => {
        const { filename } = Grading.formatGradingFilename( {
            hash: 'abc123',
            ts: '2026-05-29T03-00-00Z',
            persona: 'neutral'
        } )
        expect( filename ).toBe( 'abc123--2026-05-29T03-00-00Z--neutral.json' )
    } )

    test( 'snapshot row 3 — PLACEHOLDER hash', () => {
        const { filename } = Grading.formatGradingFilename( {
            hash: 'PLACEHOLDER001',
            ts: '2026-05-29T03-00-00Z',
            persona: 'neutral'
        } )
        expect( filename ).toBe( 'PLACEHOLDER001--2026-05-29T03-00-00Z--neutral.json' )
    } )
} )
