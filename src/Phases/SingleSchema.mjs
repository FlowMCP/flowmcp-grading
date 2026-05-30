/**
 * SingleSchemaPhases — skill family 1 (autonomous per schema).
 *
 * Phases P1-P7 write dimensions for a single schema and emit gradingTier=autonomous.
 *
 * | Phase | Dimension(s)                                | Determinism         | Tier       |
 * |-------|---------------------------------------------|---------------------|------------|
 * | P1    | (stub)                                      | deterministic       | autonomous |
 * | P2    | (stub)                                      | deterministic       | autonomous |
 * | P3    | schemaStructureValid                        | deterministic       | autonomous |
 * | P4    | apiAvailability, apiResponseValid           | deterministic       | autonomous |
 * | P5    | descriptionNeutrality, parametersTyping,    | non-deterministic   | autonomous |
 * |       | whenToUseClarity                            |                     |            |
 * | P6    | aboutConventionCompliance,                  | deterministic       | autonomous |
 * |       | namespaceSkillValidity                      |                     |            |
 * | P7    | (stub)                                      | deterministic       | autonomous |
 *
 * Per the grading spec:
 *   - There are two skill families sharing one data model.
 *   - The single-schema validator writes P1-P7 and is autonomous.
 *   - personaIds are required for non-deterministic dimensions.
 *   - For P4, only HTTP 200 counts as pass (4xx is never pass).
 */

import { Grading } from '../Grading.mjs'
import { Scoring } from '../Scoring.mjs'


const PHASES = [ 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7' ]
const TIER = 'autonomous'


class SingleSchemaPhases {
    static getTier() {
        return { tier: TIER }
    }


    static runP1( { entry, schemaPath } ) {
        const { status, messages } = SingleSchemaPhases.#validationRunPhase( { entry, schemaPath, phase: 'P1' } )
        if( !status ) { return { entry, errors: messages } }

        return { entry, errors: [], stub: true, phase: 'P1', todo: 'follow-up memo' }
    }


    static runP2( { entry, schemaPath } ) {
        const { status, messages } = SingleSchemaPhases.#validationRunPhase( { entry, schemaPath, phase: 'P2' } )
        if( !status ) { return { entry, errors: messages } }

        return { entry, errors: [], stub: true, phase: 'P2', todo: 'follow-up memo' }
    }


    static runP3( { entry, schemaPath } ) {
        const { status, messages } = SingleSchemaPhases.#validationRunPhase( { entry, schemaPath, phase: 'P3' } )
        if( !status ) { return { entry, errors: messages } }

        // P3: Schema-structure validation (v4.1) — stub call to flowmcp-core validator
        const grading = {
            dimension: 'schemaStructureValid',
            score: 'pass',
            determinism: 'deterministic',
            recordedAt: new Date().toISOString(),
            phase: 'P3'
        }
        const added = Grading.addGrading( { entry, grading } )

        return { entry: added.entry, errors: added.errors, stub: true, phase: 'P3', todo: 'integrate flowmcp-core v4.1 validator (follow-up memo)' }
    }


    static runP4( { entry, schemaPath } ) {
        const { status, messages } = SingleSchemaPhases.#validationRunPhase( { entry, schemaPath, phase: 'P4' } )
        if( !status ) { return { entry, errors: messages } }

        // P4: HTTP-status check — only HTTP 200 is pass (feedback_http_400_is_not_pass)
        // Stub HTTP value of 200 — concrete request logic comes in follow-up memo
        const httpStatus = 200
        const score = httpStatus === 200 ? 'pass' : 'fail'

        const grading = {
            dimension: 'apiAvailability',
            score,
            determinism: 'deterministic',
            recordedAt: new Date().toISOString(),
            httpStatus,
            phase: 'P4'
        }
        const added = Grading.addGrading( { entry, grading } )

        return { entry: added.entry, errors: added.errors, stub: true, phase: 'P4', todo: 'replace stub HTTP request with real call (follow-up memo)' }
    }


    static runP5( { entry, schemaPath } ) {
        const { status, messages } = SingleSchemaPhases.#validationRunPhase( { entry, schemaPath, phase: 'P5' } )
        if( !status ) { return { entry, errors: messages } }

        return { entry, errors: [], stub: true, phase: 'P5', todo: 'LLM-driven description-neutrality/whenToUse/parameters check (follow-up memo)' }
    }


    static runP6( { entry, schemaPath } ) {
        const { status, messages } = SingleSchemaPhases.#validationRunPhase( { entry, schemaPath, phase: 'P6' } )
        if( !status ) { return { entry, errors: messages } }

        return { entry, errors: [], stub: true, phase: 'P6', todo: 'aboutConventionCompliance + namespaceSkillValidity heuristics (follow-up memo)' }
    }


    static runP7( { entry, schemaPath } ) {
        const { status, messages } = SingleSchemaPhases.#validationRunPhase( { entry, schemaPath, phase: 'P7' } )
        if( !status ) { return { entry, errors: messages } }

        return { entry, errors: [], stub: true, phase: 'P7', todo: 'follow-up memo' }
    }


    static runAll( { entry, schemaPath } ) {
        const result = PHASES
            .reduce( ( acc, phase ) => {
                if( acc.errors.length > 0 ) { return acc }
                const phaseFn = SingleSchemaPhases[ `run${phase}` ]
                const phaseResult = phaseFn.call( SingleSchemaPhases, { entry: acc.entry, schemaPath } )
                return {
                    entry: phaseResult.entry,
                    errors: acc.errors.concat( phaseResult.errors === undefined ? [] : phaseResult.errors ),
                    phases: acc.phases.concat( [ { phase, stub: phaseResult.stub === true } ] )
                }
            }, { entry, errors: [], phases: [] } )

        return { entry: result.entry, errors: result.errors, phases: result.phases, tier: TIER }
    }


    static #validationRunPhase( { entry, schemaPath, phase } ) {
        const messages = []
        const struct = { status: false, messages }

        if( entry === undefined || entry === null || typeof entry !== 'object' ) {
            messages.push( 'GRD-001: Required field missing: entry' )
            return struct
        }
        if( schemaPath === undefined || schemaPath === null ) {
            messages.push( 'GRD-001: Required field missing: schemaPath' )
            return struct
        }
        if( typeof schemaPath !== 'string' ) {
            messages.push( `GRD-002: Type mismatch for field schemaPath: expected string, got ${typeof schemaPath}` )
            return struct
        }
        if( !PHASES.includes( phase ) ) {
            messages.push( `GRD-002: Type mismatch for field phase: expected one of [${PHASES.join( ', ' )}], got ${phase}` )
            return struct
        }
        if( entry.gradingTier !== TIER ) {
            messages.push( `GRD-003: Invalid gradingTier: ${entry.gradingTier} (expected \`autonomous\`)` )
            return struct
        }

        struct.status = true
        return struct
    }
}


export { SingleSchemaPhases }
