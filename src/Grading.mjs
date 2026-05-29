/**
 * Grading — grading-system class.
 *
 * Version: gradingSystem/1.0.0
 *
 * Encapsulates the overall model (array of sub-grades, tier-trim,
 * aggregate-grade computation, re-grading triggers).
 * Static methods only, object params, object returns. NO SILENT DEFAULTS.
 *
 * Memo 076 anchors:
 *   Z. 254 — A grading is an array of sub-grades; carries veto right
 *   Z. 263 — selectionId required when gradingTier=group-bound
 *   Z. 273 — llmModel required when graderIdentity.kind=llm
 *   Z. 289-292 — aggregateGrade computation incl. REJECTED + maxAttainableGrade
 *   Z. 292 — maxAttainableGrade: autonomous → B, group-bound → A
 *   Z. 302 — Aging defaults (14 days API, 30 days ToS, 180 days retention)
 *   Z. 305 — Multi-grader rule: no automatic consolidation
 *   Z. 307 — Re-grading preserves old via previousGradingId
 *   Z. 309 — n/a pragma: ignored, not zero
 *   Z. 311 — personaIds required when determinism=non-deterministic
 */

import { Scoring } from './Scoring.mjs'


const GRADING_SYSTEM_VERSION = 'gradingSystem/1.0.0'


// Aging defaults per Memo Z. 302 — concrete numbers, no hidden defaults.
const AGING_DEFAULTS = Object.freeze( {
    apiDays: 14,           // Memo Z. 302 — API responses stale after 14 days
    tosDays: 30,           // Memo Z. 302 — ToS check stale after 30 days
    retentionDays: 180     // Memo Z. 302 — retention threshold, warning after 180 days
} )


const VALID_TIERS = [ 'autonomous', 'group-bound' ]
const VALID_GRADER_KINDS = [ 'script', 'llm', 'human' ]
const VALID_DETERMINISM = [ 'deterministic', 'non-deterministic' ]
const TIER_MAX_GRADES = Object.freeze( {
    autonomous: 'B',
    'group-bound': 'A'
} )


class Grading {
    static getVersion() {
        return { version: GRADING_SYSTEM_VERSION }
    }


    static createEntry( { schemaId, selectionId, gradingTier, grader, options } ) {
        const { status, messages } = Grading.#validationCreateEntry( { schemaId, selectionId, gradingTier, grader } )
        if( !status ) { return { entry: null, errors: messages } }

        const now = new Date().toISOString()
        const entry = {
            schemaId,
            selectionId,
            gradingTier,
            grader,
            gradings: [],
            categoricalVeto: null,
            aggregateGrade: null,
            maxAttainableGrade: TIER_MAX_GRADES[ gradingTier ],
            previousGradingId: null,
            createdAt: now,
            updatedAt: now,
            options: options === undefined || options === null ? {} : options
        }

        return { entry, errors: [] }
    }


    static addGrading( { entry, grading } ) {
        const { status, messages } = Grading.#validationAddGrading( { entry, grading } )
        if( !status ) { return { entry, errors: messages } }

        // No consolidation — Memo Z. 305: every grading > no grading
        const updatedGradings = entry.gradings.concat( [ grading ] )
        const updated = Object.assign( {}, entry, {
            gradings: updatedGradings,
            updatedAt: new Date().toISOString()
        } )

        return { entry: updated, errors: [] }
    }


    static computeAggregateGrade( { entry } ) {
        const { status, messages } = Grading.#validationEntry( { entry } )
        if( !status ) { return { aggregateGrade: null, maxAttainableGrade: null, errors: messages } }

        const maxAttainableGrade = TIER_MAX_GRADES[ entry.gradingTier ]

        // Veto path: REJECTED overrides aggregation. maxAttainableGrade unchanged (cosmetic).
        if( entry.categoricalVeto !== null && entry.categoricalVeto !== undefined ) {
            return {
                aggregateGrade: 'REJECTED',
                maxAttainableGrade,
                errors: []
            }
        }

        const weighted = Scoring.computeWeightedSum( { gradings: entry.gradings } )
        if( weighted.normalizedScore === null ) {
            return {
                aggregateGrade: null,
                maxAttainableGrade,
                errors: weighted.errors,
                stub: true,
                todo: 'follow-up memo: aggregate-grade computation formula (raw float → letter grade)'
            }
        }

        const rawGrade = Grading.#trimByTier( { aggregateRaw: weighted.normalizedScore, gradingTier: entry.gradingTier } )

        return {
            aggregateGrade: rawGrade.grade,
            maxAttainableGrade,
            errors: weighted.errors,
            stub: true,
            todo: 'follow-up memo: full grade-letter mapping logic'
        }
    }


    static applyRegradingTrigger( { entry, regradingTrigger } ) {
        const { status, messages } = Grading.#validationRegradingTrigger( { entry, regradingTrigger } )
        if( !status ) { return { newEntry: null, errors: messages } }

        const now = new Date().toISOString()
        // Old entry is NOT mutated — Memo Z. 307
        const previousGradingId = `${entry.schemaId}@${entry.createdAt}`
        const newEntry = {
            schemaId: entry.schemaId,
            selectionId: entry.selectionId,
            gradingTier: entry.gradingTier,
            grader: entry.grader,
            gradings: [],
            categoricalVeto: null,
            aggregateGrade: null,
            maxAttainableGrade: TIER_MAX_GRADES[ entry.gradingTier ],
            previousGradingId,
            regradingTrigger,
            createdAt: now,
            updatedAt: now,
            options: entry.options
        }

        return { newEntry, errors: [] }
    }


    static checkAging( { entry, now } ) {
        const { status, messages } = Grading.#validationCheckAging( { entry, now } )
        if( !status ) { return { entry, agedDimensions: [], errors: messages } }

        const nowMs = new Date( now ).getTime()
        const agedDimensions = []
        const errors = []

        const updatedGradings = entry.gradings
            .map( ( grading ) => {
                const recordedAt = grading.recordedAt === undefined || grading.recordedAt === null
                    ? entry.createdAt
                    : grading.recordedAt
                const recordedMs = new Date( recordedAt ).getTime()
                const ageMs = nowMs - recordedMs
                const ageDays = ageMs / ( 1000 * 60 * 60 * 24 )

                let staleThreshold = AGING_DEFAULTS.apiDays
                if( grading.dimension === 'tosCompliance' || grading.dimension === 'tosAvailability' ) {
                    staleThreshold = AGING_DEFAULTS.tosDays
                }

                if( ageDays > AGING_DEFAULTS.retentionDays ) {
                    errors.push( `GRD-WARN-001: Grading entry exceeds retention threshold of ${AGING_DEFAULTS.retentionDays} days` )
                }

                if( ageDays > staleThreshold && grading.score !== 'n/a' && grading.score !== 'stale' ) {
                    agedDimensions.push( grading.dimension )
                    return Object.assign( {}, grading, { score: 'stale' } )
                }

                return grading
            } )

        const updated = Object.assign( {}, entry, { gradings: updatedGradings } )
        return { entry: updated, agedDimensions, errors }
    }


    static #trimByTier( { aggregateRaw, gradingTier } ) {
        // Stub trim — concrete letter mapping in follow-up memo.
        const maxGrade = TIER_MAX_GRADES[ gradingTier ]
        return {
            grade: maxGrade,
            stub: true,
            todo: 'follow-up memo: implement grade-letter mapping from numeric aggregate'
        }
    }


    static #validationCreateEntry( { schemaId, selectionId, gradingTier, grader } ) {
        const messages = []
        const struct = { status: false, messages }

        const pairs = [
            [ 'schemaId', schemaId, 'string', null ],
            [ 'gradingTier', gradingTier, 'string', VALID_TIERS ],
            [ 'grader', grader, 'object', null ]
        ]

        pairs
            .forEach( ( [ key, value, type, list ] ) => {
                if( value === undefined || value === null ) {
                    messages.push( `GRD-001: Required field missing: ${key}` )
                    return
                }
                if( type === 'object' && ( typeof value !== 'object' || Array.isArray( value ) ) ) {
                    messages.push( `GRD-002: Type mismatch for field ${key}: expected object, got ${typeof value}` )
                    return
                }
                if( type === 'string' && typeof value !== 'string' ) {
                    messages.push( `GRD-002: Type mismatch for field ${key}: expected string, got ${typeof value}` )
                    return
                }
                if( list !== null && !list.includes( value ) ) {
                    if( key === 'gradingTier' ) {
                        messages.push( `GRD-003: Invalid gradingTier: ${value} (expected \`autonomous\` or \`group-bound\`)` )
                        return
                    }
                    messages.push( `GRD-002: Type mismatch for field ${key}: expected one of [${list.join( ', ' )}], got ${value}` )
                }
            } )

        if( messages.length > 0 ) { return struct }

        // Tier-specific selectionId requirement — Memo Z. 263
        if( gradingTier === 'group-bound' ) {
            if( selectionId === undefined || selectionId === null || typeof selectionId !== 'string' ) {
                messages.push( 'GRD-004: selectionId required when gradingTier=group-bound' )
                return struct
            }
        }

        // grader.kind validation
        if( !VALID_GRADER_KINDS.includes( grader.kind ) ) {
            messages.push( `GRD-002: Type mismatch for field grader.kind: expected one of [${VALID_GRADER_KINDS.join( ', ' )}], got ${grader.kind}` )
            return struct
        }
        if( grader.kind === 'llm' ) {
            if( grader.llmModel === undefined || grader.llmModel === null ) {
                messages.push( 'GRD-007: llmModel required when graderIdentity.kind=llm' )
                return struct
            }
        }

        struct.status = true
        return struct
    }


    static #validationAddGrading( { entry, grading } ) {
        const messages = []
        const struct = { status: false, messages }

        if( entry === undefined || entry === null || typeof entry !== 'object' ) {
            messages.push( 'GRD-001: Required field missing: entry' )
            return struct
        }
        if( !Array.isArray( entry.gradings ) ) {
            messages.push( 'GRD-002: Type mismatch for field entry.gradings: expected array, got non-array' )
            return struct
        }
        if( grading === undefined || grading === null || typeof grading !== 'object' ) {
            messages.push( 'GRD-001: Required field missing: grading' )
            return struct
        }

        const pairs = [
            [ 'grading.dimension', grading.dimension, 'string' ],
            [ 'grading.score', grading.score, 'any' ],
            [ 'grading.determinism', grading.determinism, 'string', VALID_DETERMINISM ]
        ]

        pairs
            .forEach( ( [ key, value, type, list ] ) => {
                if( value === undefined || value === null ) {
                    messages.push( `GRD-001: Required field missing: ${key}` )
                    return
                }
                if( type === 'string' && typeof value !== 'string' ) {
                    messages.push( `GRD-002: Type mismatch for field ${key}: expected string, got ${typeof value}` )
                    return
                }
                if( list !== undefined && list !== null && !list.includes( value ) ) {
                    messages.push( `GRD-002: Type mismatch for field ${key}: expected one of [${list.join( ', ' )}], got ${value}` )
                }
            } )

        if( messages.length > 0 ) { return struct }

        // personaIds required when non-deterministic — Memo Z. 311
        if( grading.determinism === 'non-deterministic' ) {
            const sc = grading.selectionContext
            const hasPersonaIds = sc !== undefined && sc !== null && Array.isArray( sc.personaIds ) && sc.personaIds.length > 0
            if( !hasPersonaIds ) {
                messages.push( 'GRD-005: personaIds[] required when determinism=non-deterministic' )
                return struct
            }
        }

        struct.status = true
        return struct
    }


    static #validationEntry( { entry } ) {
        const messages = []
        const struct = { status: false, messages }

        if( entry === undefined || entry === null || typeof entry !== 'object' ) {
            messages.push( 'GRD-001: Required field missing: entry' )
            return struct
        }
        if( !VALID_TIERS.includes( entry.gradingTier ) ) {
            messages.push( `GRD-003: Invalid gradingTier: ${entry.gradingTier} (expected \`autonomous\` or \`group-bound\`)` )
            return struct
        }
        if( !Array.isArray( entry.gradings ) ) {
            messages.push( 'GRD-002: Type mismatch for field entry.gradings: expected array, got non-array' )
            return struct
        }

        struct.status = true
        return struct
    }


    static #validationRegradingTrigger( { entry, regradingTrigger } ) {
        const messages = []
        const struct = { status: false, messages }

        const entryCheck = Grading.#validationEntry( { entry } )
        if( !entryCheck.status ) {
            entryCheck.messages
                .forEach( ( m ) => messages.push( m ) )
            return struct
        }

        if( regradingTrigger === undefined || regradingTrigger === null ) {
            messages.push( 'GRD-001: Required field missing: regradingTrigger' )
            return struct
        }
        if( typeof regradingTrigger !== 'string' ) {
            messages.push( `GRD-002: Type mismatch for field regradingTrigger: expected string, got ${typeof regradingTrigger}` )
            return struct
        }

        struct.status = true
        return struct
    }


    static #validationCheckAging( { entry, now } ) {
        const messages = []
        const struct = { status: false, messages }

        const entryCheck = Grading.#validationEntry( { entry } )
        if( !entryCheck.status ) {
            entryCheck.messages
                .forEach( ( m ) => messages.push( m ) )
            return struct
        }

        if( now === undefined || now === null ) {
            messages.push( 'GRD-001: Required field missing: now' )
            return struct
        }
        if( typeof now !== 'string' && !( now instanceof Date ) ) {
            messages.push( `GRD-002: Type mismatch for field now: expected ISO string or Date, got ${typeof now}` )
            return struct
        }

        struct.status = true
        return struct
    }
}


export { Grading, AGING_DEFAULTS }
