/**
 * Veto — categorical-veto logic.
 *
 * Closed trigger list per the grading spec:
 *   1. malicious-module
 *   2. api-key-domain-mismatch
 *   3. illegal-content
 *   4. ai-security-veto
 *
 * Static methods only, object params, object returns. NO SILENT DEFAULTS.
 *
 * Per the grading spec:
 *   - The trigger list is closed.
 *   - evidence is required for categoricalVeto.
 *   - REJECTED overrides aggregation; maxAttainableGrade stays cosmetic.
 *   - reasoning is required for the ai-security-veto trigger.
 */

const VALID_TRIGGERS = Object.freeze( [
    'malicious-module',
    'api-key-domain-mismatch',
    'illegal-content',
    'ai-security-veto'
] )


class Veto {
    static getTriggers() {
        return { triggers: VALID_TRIGGERS.slice() }
    }


    static applyVeto( { entry, triggeredBy, grader, evidence, reasoning } ) {
        const { status, messages } = Veto.#validationApplyVeto( { entry, triggeredBy, grader, evidence, reasoning } )
        if( !status ) { return { entry, errors: messages } }

        const now = new Date().toISOString()
        const categoricalVeto = {
            triggeredBy,
            grader,
            evidence,
            reasoning: reasoning === undefined || reasoning === null ? null : reasoning,
            recordedAt: now
        }

        const updated = Object.assign( {}, entry, {
            categoricalVeto,
            aggregateGrade: 'REJECTED',
            updatedAt: now
        } )

        return { entry: updated, errors: [] }
    }


    static isVetoed( { entry } ) {
        const errors = []
        if( entry === undefined || entry === null || typeof entry !== 'object' ) {
            errors.push( 'GRD-001: Required field missing: entry' )
            return { vetoed: false, triggeredBy: null, errors }
        }

        const veto = entry.categoricalVeto
        if( veto === undefined || veto === null ) {
            return { vetoed: false, triggeredBy: null }
        }

        return { vetoed: true, triggeredBy: veto.triggeredBy }
    }


    static validateVeto( { veto } ) {
        const errors = []

        if( veto === undefined || veto === null ) {
            errors.push( 'GRD-001: Required field missing: veto' )
            return { valid: false, errors }
        }
        if( typeof veto !== 'object' || Array.isArray( veto ) ) {
            errors.push( `GRD-002: Type mismatch for field veto: expected object, got ${Array.isArray( veto ) ? 'array' : typeof veto}` )
            return { valid: false, errors }
        }

        if( !VALID_TRIGGERS.includes( veto.triggeredBy ) ) {
            errors.push( `VET-001: Invalid veto trigger: ${veto.triggeredBy} (expected one of [${VALID_TRIGGERS.join( ', ' )}])` )
        }
        if( veto.evidence === undefined || veto.evidence === null ) {
            errors.push( 'VET-002: evidence required for categoricalVeto' )
        }
        if( veto.grader === undefined || veto.grader === null ) {
            errors.push( 'VET-004: graderIdentity required for categoricalVeto' )
        }
        if( veto.triggeredBy === 'ai-security-veto' ) {
            if( veto.reasoning === undefined || veto.reasoning === null ) {
                errors.push( 'VET-003: reasoning required for ai-security-veto trigger' )
            }
        }

        if( errors.length > 0 ) { return { valid: false, errors } }

        return { valid: true, errors: [] }
    }


    static #validationApplyVeto( { entry, triggeredBy, grader, evidence, reasoning } ) {
        const messages = []
        const struct = { status: false, messages }

        if( entry === undefined || entry === null || typeof entry !== 'object' ) {
            messages.push( 'GRD-001: Required field missing: entry' )
            return struct
        }
        if( triggeredBy === undefined || triggeredBy === null ) {
            messages.push( 'GRD-001: Required field missing: triggeredBy' )
            return struct
        }
        if( !VALID_TRIGGERS.includes( triggeredBy ) ) {
            messages.push( `VET-001: Invalid veto trigger: ${triggeredBy} (expected one of [${VALID_TRIGGERS.join( ', ' )}])` )
            return struct
        }
        if( evidence === undefined || evidence === null ) {
            messages.push( 'VET-002: evidence required for categoricalVeto' )
            return struct
        }
        if( grader === undefined || grader === null ) {
            messages.push( 'VET-004: graderIdentity required for categoricalVeto' )
            return struct
        }
        if( triggeredBy === 'ai-security-veto' ) {
            if( reasoning === undefined || reasoning === null ) {
                messages.push( 'VET-003: reasoning required for ai-security-veto trigger' )
                return struct
            }
        }

        struct.status = true
        return struct
    }
}


export { Veto, VALID_TRIGGERS }
