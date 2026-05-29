/**
 * SelectionPhases — Skill-Familie 2 (group-bound).
 *
 * Phases S1-S4 consume Single-Schema entries + domain knowledge and emit
 * additional group-bound dimensions. gradingTier=group-bound.
 *
 * | Phase | Dimension(s)                                | Determinismus       | Tier        |
 * |-------|---------------------------------------------|---------------------|-------------|
 * | S1    | (stub)                                      | deterministic       | group-bound |
 * | S2    | aboutConventionCompliance,                  | deterministic       | group-bound |
 * |       | domainConformance                           |                     |             |
 * | S3    | selectionSkillL1/L2/L3                      | non-deterministic   | group-bound |
 * | S4    | personaUseCaseFit                           | non-deterministic   | group-bound |
 *
 * Memo 076 anchors:
 *   Z. 258 — Two skill families, shared data model
 *   Z. 294-297 — Selection-Validator consumes single-schema entries, writes S1-S4
 *   Z. 311 — personaIds required for non-deterministic dimensions (S3, S4)
 */

import { Grading } from '../Grading.mjs'


const PHASES = [ 'S1', 'S2', 'S3', 'S4' ]
const TIER = 'group-bound'


class SelectionPhases {
    static getTier() {
        return { tier: TIER }
    }


    static runS1( { entry, selectionId, schemaEntries } ) {
        const { status, messages } = SelectionPhases.#validationRunPhase( { entry, selectionId, phase: 'S1' } )
        if( !status ) { return { entry, errors: messages } }

        const consumedCount = Array.isArray( schemaEntries ) ? schemaEntries.length : 0
        return {
            entry,
            errors: [],
            stub: true,
            phase: 'S1',
            consumedSchemaEntries: consumedCount,
            todo: 'follow-up memo'
        }
    }


    static runS2( { entry, selectionId, domainDocPath } ) {
        const { status, messages } = SelectionPhases.#validationRunPhase( { entry, selectionId, phase: 'S2' } )
        if( !status ) { return { entry, errors: messages } }

        // S2: aboutConventionCompliance + domainConformance vs. domain doc
        const docOk = typeof domainDocPath === 'string' && domainDocPath.length > 0
        const score = docOk ? 'pass' : 'fail'

        const grading = {
            dimension: 'aboutConventionCompliance',
            score,
            determinism: 'deterministic',
            recordedAt: new Date().toISOString(),
            phase: 'S2',
            selectionContext: { selectionId }
        }
        const added = Grading.addGrading( { entry, grading } )

        return {
            entry: added.entry,
            errors: added.errors,
            stub: true,
            phase: 'S2',
            todo: 'parse domain doc + assert convention compliance (follow-up memo)'
        }
    }


    static runS3( { entry, selectionId, schemaEntries } ) {
        const { status, messages } = SelectionPhases.#validationRunPhase( { entry, selectionId, phase: 'S3' } )
        if( !status ) { return { entry, errors: messages } }

        return {
            entry,
            errors: [],
            stub: true,
            phase: 'S3',
            consumedSchemaEntries: Array.isArray( schemaEntries ) ? schemaEntries.length : 0,
            todo: 'L1/L2/L3 selection-skill evaluation (follow-up memo)'
        }
    }


    static runS4( { entry, selectionId, personaIds } ) {
        const { status, messages } = SelectionPhases.#validationRunPhase( { entry, selectionId, phase: 'S4' } )
        if( !status ) { return { entry, errors: messages } }

        // S4 is non-deterministic → personaIds[] mandatory (Memo Z. 311)
        const personaCheck = SelectionPhases.#validationPersonaIds( {
            personaIds,
            determinism: 'non-deterministic'
        } )
        if( !personaCheck.status ) { return { entry, errors: personaCheck.messages } }

        return {
            entry,
            errors: [],
            stub: true,
            phase: 'S4',
            personaCount: personaIds.length,
            todo: 'personaUseCaseFit scoring (follow-up memo)'
        }
    }


    static runAll( { entry, selectionId, schemaEntries, domainDocPath, personaIds } ) {
        const phaseFns = [
            { name: 'S1', call: () => SelectionPhases.runS1( { entry, selectionId, schemaEntries } ) },
            { name: 'S2', call: () => SelectionPhases.runS2( { entry, selectionId, domainDocPath } ) },
            { name: 'S3', call: () => SelectionPhases.runS3( { entry, selectionId, schemaEntries } ) },
            { name: 'S4', call: () => SelectionPhases.runS4( { entry, selectionId, personaIds } ) }
        ]

        const result = phaseFns
            .reduce( ( acc, item ) => {
                if( acc.halt ) { return acc }
                const phaseResult = item.call()
                const nextEntry = phaseResult.entry === undefined ? acc.entry : phaseResult.entry
                const phaseErrors = phaseResult.errors === undefined ? [] : phaseResult.errors
                return {
                    entry: nextEntry,
                    errors: acc.errors.concat( phaseErrors ),
                    phases: acc.phases.concat( [ { phase: item.name, stub: phaseResult.stub === true } ] ),
                    halt: phaseErrors.length > 0
                }
            }, { entry, errors: [], phases: [], halt: false } )

        return { entry: result.entry, errors: result.errors, phases: result.phases, tier: TIER }
    }


    static #validationRunPhase( { entry, selectionId, phase } ) {
        const messages = []
        const struct = { status: false, messages }

        if( entry === undefined || entry === null || typeof entry !== 'object' ) {
            messages.push( 'GRD-001: Required field missing: entry' )
            return struct
        }
        if( selectionId === undefined || selectionId === null ) {
            messages.push( 'GRD-004: selectionId required when gradingTier=group-bound' )
            return struct
        }
        if( typeof selectionId !== 'string' ) {
            messages.push( `GRD-002: Type mismatch for field selectionId: expected string, got ${typeof selectionId}` )
            return struct
        }
        if( !PHASES.includes( phase ) ) {
            messages.push( `GRD-002: Type mismatch for field phase: expected one of [${PHASES.join( ', ' )}], got ${phase}` )
            return struct
        }
        if( entry.gradingTier !== TIER ) {
            messages.push( `GRD-003: Invalid gradingTier: ${entry.gradingTier} (expected \`group-bound\`)` )
            return struct
        }

        struct.status = true
        return struct
    }


    static #validationPersonaIds( { personaIds, determinism } ) {
        const messages = []
        const struct = { status: false, messages }

        if( determinism === 'non-deterministic' ) {
            if( personaIds === undefined || personaIds === null ) {
                messages.push( 'GRD-005: personaIds[] required when determinism=non-deterministic' )
                return struct
            }
            if( !Array.isArray( personaIds ) ) {
                messages.push( `GRD-002: Type mismatch for field personaIds: expected array, got ${typeof personaIds}` )
                return struct
            }
            if( personaIds.length === 0 ) {
                messages.push( 'GRD-005: personaIds[] required when determinism=non-deterministic' )
                return struct
            }
        }

        struct.status = true
        return struct
    }
}


export { SelectionPhases }
