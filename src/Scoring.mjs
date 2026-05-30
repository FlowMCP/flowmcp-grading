/**
 * Scoring — scoring system class.
 *
 * Version: scoringSystem/1.0.0
 *
 * Encapsulates sub-grades (dimensions with weights, deterministic scores).
 * Static methods only, object params, object returns. NO SILENT DEFAULTS.
 *
 * Per the grading spec:
 *   - A grading is an array of sub-grades.
 *   - Dimension enum (17 values).
 *   - Score value range (1.0-5.0 float OR enum: pass|fail|stale|n/a).
 *   - Multi-grader rule: no automatic consolidation.
 *   - n/a pragma: ignored in weighted sum, not zero.
 *   - Aging: stale, not fail.
 */

const SCORING_SYSTEM_VERSION = 'scoringSystem/1.0.0'


// Dimensions enum per the grading spec. Closed list, extensions require a spec revision.
const DIMENSIONS = [
    'apiAvailability',
    'apiResponseValid',
    'schemaStructureValid',
    'tosCompliance',
    'descriptionNeutrality',
    'parametersTyping',
    'whenToUseClarity',
    'aboutConventionCompliance',
    'namespaceSkillValidity',
    'errorCodePattern',
    'tosAvailability',
    'domainConformance',
    'selectionSkillL1',
    'selectionSkillL2',
    'selectionSkillL3',
    'personaUseCaseFit',
    'maintainerResponsiveness'
]


const SCORE_ENUMS = [ 'pass', 'fail', 'stale', 'n/a' ]
const SCORE_FLOAT_MIN = 1.0
const SCORE_FLOAT_MAX = 5.0
const DETERMINISM_VALUES = [ 'deterministic', 'non-deterministic' ]


class Scoring {
    static getVersion() {
        return { version: SCORING_SYSTEM_VERSION }
    }


    static scoreDimension( { dimension, rawValue, determinism } ) {
        const { status, messages } = Scoring.#validationScoreDimension( { dimension, rawValue, determinism } )
        if( !status ) { return { score: null, reasoning: null, errors: messages } }

        // Stub return — concrete heuristic per dimension is implemented in src/Phases/* (follow-up memo).
        return {
            score: null,
            reasoning: 'stub: concrete heuristic in src/Phases/*.mjs (follow-up memo)',
            stub: true,
            todo: 'follow-up: per-dimension phase implementation',
            errors: []
        }
    }


    static validateScore( { score } ) {
        const errors = []

        if( score === undefined || score === null ) {
            errors.push( 'GRD-001: Required field missing: score' )
            return { valid: false, errors }
        }

        if( typeof score === 'string' ) {
            if( !SCORE_ENUMS.includes( score ) ) {
                errors.push( `SCO-003: Invalid score enum: ${score} (expected \`pass\`/\`fail\`/\`stale\`/\`n/a\`)` )
                return { valid: false, errors }
            }
            return { valid: true, errors: [] }
        }

        if( typeof score === 'number' ) {
            if( !Number.isFinite( score ) ) {
                errors.push( `SCO-001: Score out of range: ${score} (expected 1.0-5.0 or enum)` )
                return { valid: false, errors }
            }
            if( score < SCORE_FLOAT_MIN || score > SCORE_FLOAT_MAX ) {
                errors.push( `SCO-001: Score out of range: ${score} (expected 1.0-5.0 or enum)` )
                return { valid: false, errors }
            }
            return { valid: true, errors: [] }
        }

        errors.push( `GRD-002: Type mismatch for field score: expected number or string, got ${typeof score}` )
        return { valid: false, errors }
    }


    static computeWeightedSum( { gradings } ) {
        const { status, messages } = Scoring.#validationComputeWeightedSum( { gradings } )
        if( !status ) { return { sum: 0, weightSum: 0, normalizedScore: null, errors: messages } }

        const aggregated = gradings
            .reduce( ( acc, grading ) => {
                // n/a entries are ignored per the n/a pragma — not counted as zero
                if( grading.score === 'n/a' ) {
                    return acc
                }
                // stale entries are ignored AND emit a warning per the aging rule
                if( grading.score === 'stale' ) {
                    acc.errors.push( 'SCO-WARN-001: Score is `stale` due to aging threshold' )
                    return acc
                }
                // veto entries are not counted in weighted sum (REJECTED is set elsewhere)
                if( grading.score === 'fail' && grading.isVeto === true ) {
                    return acc
                }
                // enums pass/fail map to numeric 5.0 / 1.0 for aggregation purposes
                let numericScore = null
                if( grading.score === 'pass' ) { numericScore = 5.0 }
                else if( grading.score === 'fail' ) { numericScore = 1.0 }
                else if( typeof grading.score === 'number' ) { numericScore = grading.score }
                else { return acc }

                const weight = typeof grading.weight === 'number' ? grading.weight : 1.0
                acc.sum = acc.sum + ( numericScore * weight )
                acc.weightSum = acc.weightSum + weight
                return acc
            }, { sum: 0, weightSum: 0, errors: [] } )

        const normalizedScore = aggregated.weightSum === 0
            ? null
            : aggregated.sum / aggregated.weightSum

        return {
            sum: aggregated.sum,
            weightSum: aggregated.weightSum,
            normalizedScore,
            errors: aggregated.errors
        }
    }


    static #validationScoreDimension( { dimension, rawValue, determinism } ) {
        const messages = []
        const struct = { status: false, messages }

        const pairs = [
            [ 'dimension', dimension, 'string', DIMENSIONS ],
            [ 'rawValue', rawValue, 'any', null ],
            [ 'determinism', determinism, 'string', DETERMINISM_VALUES ]
        ]

        pairs
            .forEach( ( [ key, value, type, list ] ) => {
                if( value === undefined || value === null ) {
                    messages.push( `GRD-001: Required field missing: ${key}` )
                    return
                }
                if( type !== 'any' && typeof value !== type ) {
                    messages.push( `GRD-002: Type mismatch for field ${key}: expected ${type}, got ${typeof value}` )
                    return
                }
                if( list !== null && !list.includes( value ) ) {
                    if( key === 'dimension' ) {
                        messages.push( `SCO-002: Unknown dimension: ${value} (not in dimension enum)` )
                        return
                    }
                    messages.push( `GRD-002: Type mismatch for field ${key}: expected one of [${list.join( ', ' )}], got ${value}` )
                }
            } )

        if( messages.length > 0 ) { return struct }

        struct.status = true
        return struct
    }


    static #validationComputeWeightedSum( { gradings } ) {
        const messages = []
        const struct = { status: false, messages }

        if( gradings === undefined || gradings === null ) {
            messages.push( 'GRD-001: Required field missing: gradings' )
            return struct
        }
        if( !Array.isArray( gradings ) ) {
            messages.push( `GRD-002: Type mismatch for field gradings: expected array, got ${typeof gradings}` )
            return struct
        }

        gradings
            .forEach( ( g, index ) => {
                if( g === null || typeof g !== 'object' ) {
                    messages.push( `GRD-002: Type mismatch for field gradings[${index}]: expected object, got ${typeof g}` )
                    return
                }
                if( !Object.prototype.hasOwnProperty.call( g, 'score' ) ) {
                    messages.push( `GRD-001: Required field missing: gradings[${index}].score` )
                    return
                }
                if( Object.prototype.hasOwnProperty.call( g, 'weight' ) ) {
                    if( typeof g.weight !== 'number' || g.weight <= 0 ) {
                        messages.push( `SCO-004: weight must be a positive float, got ${g.weight}` )
                    }
                }
            } )

        if( messages.length > 0 ) { return struct }

        struct.status = true
        return struct
    }
}


export { Scoring, DIMENSIONS }
