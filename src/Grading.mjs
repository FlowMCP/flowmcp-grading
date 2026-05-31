/**
 * Grading — grading-system class.
 *
 * Version: gradingSystem/1.0.0
 *
 * Encapsulates the overall model (array of sub-grades, tier-trim,
 * aggregate-grade computation, re-grading triggers).
 * Static methods only, object params, object returns. NO SILENT DEFAULTS.
 *
 * Grading-model rules per the grading spec:
 *   - A grading is an array of sub-grades; it carries a veto right.
 *   - selectionId is required when gradingTier=group-bound.
 *   - llmModel is required when graderIdentity.kind=llm.
 *   - aggregateGrade computation includes REJECTED + maxAttainableGrade.
 *   - maxAttainableGrade: autonomous → B, group-bound → A.
 *   - Aging defaults: 14 days API, 30 days ToS, 180 days retention.
 *   - Multi-grader rule: no automatic consolidation.
 *   - Re-grading preserves the old entry via previousGradingId.
 *   - n/a pragma: ignored, not zero.
 *   - personaIds required when determinism=non-deterministic.
 *
 * Recursive-feedback-loop additions:
 *   - Loop fields: iteration, improvementHints[].
 *   - persona slug: 'neutral' | '<basePersona>--<lens>'.
 *   - Save-step filename pattern via formatGradingFilename helper.
 *
 * Loop-field policy:
 *   - createEntry: iteration/improvementHints/persona are OPTIONAL params.
 *     When passed they are validated strictly (no silent defaults).
 *     When omitted, the resulting entry simply lacks the field — caller
 *     stays explicit.
 *   - readEntry: backward-compat for legacy pilot files. Missing loop
 *     fields are filled in with documented defaults (iteration: 0,
 *     improvementHints: [], persona: 'neutral') — read-only, never write.
 */

import { Scoring } from './Scoring.mjs'


const GRADING_SYSTEM_VERSION = 'gradingSystem/1.0.0'


// Aging defaults per the grading spec — concrete numbers, no hidden defaults.
const AGING_DEFAULTS = Object.freeze( {
    apiDays: 14,           // API responses stale after 14 days
    tosDays: 30,           // ToS check stale after 30 days
    retentionDays: 180     // retention threshold, warning after 180 days
} )


const VALID_TIERS = [ 'autonomous', 'group-bound' ]
const VALID_GRADER_KINDS = [ 'script', 'llm', 'human' ]
const VALID_DETERMINISM = [ 'deterministic', 'non-deterministic' ]
const TIER_MAX_GRADES = Object.freeze( {
    autonomous: 'B',
    'group-bound': 'A'
} )

// v2 envelope vocabularies (gradingSpec/1.2.0 §3.Y / §5.1).
const VALID_HARNESSES = [ 'claude-code' ]
const VALID_NODE_STATUSES = [ 'pending', 'blocked', 'graded', 'stable', 'rejected' ]
const VALID_AREAS = [
    'single-test',
    'tools-aggregate-schema',
    'tools-aggregate-namespace',
    'namespace-description',
    'namespace-skills',
    'about-namespace',
    'about-selection',
    'selection-skills-L1',
    'selection-skills-L2',
    'selection-skills-L3',
    'selection-aggregate'
]
// Areas that grade one skill at a time — the envelope MUST carry skillId.
const PER_SKILL_AREAS = [
    'namespace-skills',
    'selection-skills-L1',
    'selection-skills-L2',
    'selection-skills-L3'
]


class Grading {
    static getVersion() {
        return { version: GRADING_SYSTEM_VERSION }
    }


    static createEntry( { schemaId, selectionId, gradingTier, grader, options, iteration, improvementHints, persona, area, skillId, level, status, harness } ) {
        const { status: ok, messages } = Grading.#validationCreateEntry( {
            schemaId, selectionId, gradingTier, grader,
            iteration, improvementHints, persona,
            area, skillId, level, status, harness
        } )
        if( !ok ) { return { entry: null, errors: messages } }

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

        // Loop fields only present when caller passes them — no silent defaults.
        if( iteration !== undefined && iteration !== null ) {
            entry.iteration = iteration
        }
        if( improvementHints !== undefined && improvementHints !== null ) {
            entry.improvementHints = improvementHints
        }
        if( persona !== undefined && persona !== null ) {
            entry.persona = persona
        }

        // v2 envelope fields — present only when the caller passes them; each is
        // validated strictly in #validationCreateEntry (no silent defaults).
        if( area !== undefined && area !== null ) {
            entry.area = area
        }
        if( skillId !== undefined && skillId !== null ) {
            entry.skillId = skillId
        }
        if( level !== undefined && level !== null ) {
            entry.level = level
        }
        if( status !== undefined && status !== null ) {
            entry.status = status
        }
        if( harness !== undefined && harness !== null ) {
            entry.harness = harness
        }

        return { entry, errors: [] }
    }


    static readEntry( { json } ) {
        const { status, messages } = Grading.#validationReadEntry( { json } )
        if( !status ) { return { entry: null, errors: messages } }

        let parsed
        try {
            parsed = JSON.parse( json )
        } catch( err ) {
            return {
                entry: null,
                errors: [ `GRD-020: readEntry: invalid JSON, parse-error: ${err.message}` ]
            }
        }

        // Backward-compat for legacy pilot files.
        // Defaults are applied ONLY on read, never on write (createEntry).
        const entry = Object.assign( {}, parsed )
        if( !( 'iteration' in entry ) )         { entry.iteration         = 0          }
        if( !( 'improvementHints' in entry ) )  { entry.improvementHints  = []         }
        if( !( 'persona' in entry ) )           { entry.persona           = 'neutral'  }

        return { entry, errors: [] }
    }


    /**
     * formatGradingFilename — v2 grading-filename grammar (gradingSpec/1.2.0 §17.4):
     *   `‹area›[--‹basePersona›--‹lens›]--‹timestamp›.json`
     * The timestamp is the LAST segment before `.json` (no random hash), so a naive
     * `sort().at(-1)` yields the newest grading (RebuildIndex.resolveLatest relies on
     * this). `basePersona` + `lens` are BOTH present or BOTH absent — no silent half.
     *
     * @param {Object} params
     * @param {string} params.area          — one of the 11 grading areas
     * @param {string} [params.basePersona] — base persona id (omit for neutral areas)
     * @param {string} [params.lens]        — domain lens id (omit for neutral areas)
     * @param {string} params.timestamp     — ISO 8601 with '-' instead of ':'
     * @returns {{ filename: string }}
     */
    static formatGradingFilename( { area, basePersona, lens, timestamp } ) {
        const { status, messages } = Grading.#validationFormatGradingFilename( {
            area, basePersona, lens, timestamp
        } )
        if( !status ) { throw new Error( messages.join( '; ' ) ) }

        const personaSegment = basePersona === undefined || basePersona === null
            ? ''
            : `--${basePersona}--${lens}`
        const filename = `${area}${personaSegment}--${timestamp}.json`
        return { filename }
    }


    static addGrading( { entry, grading } ) {
        const { status, messages } = Grading.#validationAddGrading( { entry, grading } )
        if( !status ) { return { entry, errors: messages } }

        // No consolidation per the grading spec: every grading > no grading
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
        // Old entry is NOT mutated per the grading spec
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


    static #validationCreateEntry( { schemaId, selectionId, gradingTier, grader, iteration, improvementHints, persona, area, skillId, level, status, harness } ) {
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

        // Tier-specific selectionId requirement per the grading spec
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

        // Optional loop fields. When passed, validate strictly.
        if( iteration !== undefined && iteration !== null ) {
            if( typeof iteration !== 'number' || !Number.isInteger( iteration ) ) {
                messages.push( `GRD-030: createEntry: iteration must be an integer >= 0, was: ${iteration}` )
                return struct
            }
            if( iteration < 0 || iteration > 10 ) {
                messages.push( `GRD-030: createEntry: iteration must be an integer >= 0, was: ${iteration}` )
                return struct
            }
        }

        if( improvementHints !== undefined && improvementHints !== null ) {
            if( !Array.isArray( improvementHints ) ) {
                messages.push( `GRD-031: createEntry: improvementHints must be an array of string, was: ${typeof improvementHints}` )
                return struct
            }
            const invalidHint = improvementHints
                .map( ( hint, index ) => {
                    if( typeof hint !== 'string' ) {
                        return `GRD-031: createEntry: improvementHints[${index}] must be a non-empty string, was: ${typeof hint}`
                    }
                    if( hint.length === 0 ) {
                        return `GRD-031: createEntry: improvementHints[${index}] must be a non-empty string, was: ''`
                    }
                    return null
                } )
                .filter( ( m ) => m !== null )
            if( invalidHint.length > 0 ) {
                invalidHint.forEach( ( m ) => messages.push( m ) )
                return struct
            }
        }

        if( persona !== undefined && persona !== null ) {
            if( typeof persona !== 'string' ) {
                messages.push( `GRD-032: createEntry: persona must be 'neutral' or '<base>--<lens>', was: '${persona}'` )
                return struct
            }
            const isNeutral = persona === 'neutral'
            const personaPattern = /^[a-z][a-z0-9-]*--[a-z][a-z0-9-]*$/
            if( !isNeutral && !personaPattern.test( persona ) ) {
                messages.push( `GRD-032: createEntry: persona must be 'neutral' or '<base>--<lens>', was: '${persona}'` )
                return struct
            }
        }

        // v2 envelope fields — strictly validated when present (no silent defaults).
        if( area !== undefined && area !== null ) {
            if( typeof area !== 'string' || !VALID_AREAS.includes( area ) ) {
                messages.push( `GRD-033: createEntry: unknown area '${area}'` )
                return struct
            }
        }
        if( harness !== undefined && harness !== null ) {
            if( typeof harness !== 'string' || !VALID_HARNESSES.includes( harness ) ) {
                messages.push( `GRD-034: createEntry: harness must be one of [${VALID_HARNESSES.join( ', ' )}], was: '${harness}'` )
                return struct
            }
        }
        if( status !== undefined && status !== null ) {
            if( typeof status !== 'string' || !VALID_NODE_STATUSES.includes( status ) ) {
                messages.push( `GRD-035: createEntry: status must be one of [${VALID_NODE_STATUSES.join( ', ' )}], was: '${status}'` )
                return struct
            }
        }
        if( skillId !== undefined && skillId !== null ) {
            if( typeof skillId !== 'string' || skillId.length === 0 ) {
                messages.push( `GRD-036: createEntry: skillId must be a non-empty string, was: '${skillId}'` )
                return struct
            }
        }
        // Per-skill areas REQUIRE a skillId — no silent omission.
        if( area !== undefined && area !== null && PER_SKILL_AREAS.includes( area ) ) {
            if( skillId === undefined || skillId === null ) {
                messages.push( `GRD-037: createEntry: skillId required for per-skill area '${area}'` )
                return struct
            }
        }

        struct.status = true
        return struct
    }


    static #validationReadEntry( { json } ) {
        const messages = []
        const struct = { status: false, messages }

        if( json === undefined || json === null ) {
            messages.push( 'GRD-001: Required field missing: json' )
            return struct
        }
        if( typeof json !== 'string' ) {
            messages.push( `GRD-002: Type mismatch for field json: expected string, got ${typeof json}` )
            return struct
        }

        struct.status = true
        return struct
    }


    static #validationFormatGradingFilename( { area, basePersona, lens, timestamp } ) {
        const messages = []
        const struct = { status: false, messages }

        // area + timestamp are always required; basePersona/lens are an all-or-nothing pair.
        const required = [
            [ 'area', area ],
            [ 'timestamp', timestamp ]
        ]
        required
            .forEach( ( [ key, value ] ) => {
                if( value === undefined || value === null ) {
                    messages.push( `GRD-001: Required field missing: ${key}` )
                    return
                }
                if( typeof value !== 'string' ) {
                    messages.push( `GRD-002: Type mismatch for field ${key}: expected string, got ${typeof value}` )
                }
            } )

        if( messages.length > 0 ) { return struct }

        if( !VALID_AREAS.includes( area ) ) {
            messages.push( `GRD-043: formatGradingFilename: unknown area '${area}'` )
            return struct
        }

        const tsPattern = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/
        if( !tsPattern.test( timestamp ) ) {
            messages.push( `GRD-041: formatGradingFilename: timestamp must be ISO 8601 with '-' instead of ':' (e.g. 2026-05-30T10-15-00Z), was: '${timestamp}'` )
            return struct
        }

        // No silent half-persona: basePersona and lens are present together or not at all.
        const baseGiven = basePersona !== undefined && basePersona !== null
        const lensGiven = lens !== undefined && lens !== null
        if( baseGiven !== lensGiven ) {
            messages.push( 'GRD-042: formatGradingFilename: basePersona and lens must be provided together' )
            return struct
        }

        if( baseGiven ) {
            const segPattern = /^[a-z][a-z0-9-]*$/
            if( typeof basePersona !== 'string' || !segPattern.test( basePersona ) ) {
                messages.push( `GRD-042: formatGradingFilename: basePersona must match [a-z][a-z0-9-]*, was: '${basePersona}'` )
                return struct
            }
            if( typeof lens !== 'string' || !segPattern.test( lens ) ) {
                messages.push( `GRD-042: formatGradingFilename: lens must match [a-z][a-z0-9-]*, was: '${lens}'` )
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

        // personaIds required when non-deterministic per the grading spec
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


export { Grading, AGING_DEFAULTS, VALID_AREAS, VALID_NODE_STATUSES, VALID_HARNESSES, PER_SKILL_AREAS }
