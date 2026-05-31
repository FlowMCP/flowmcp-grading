/**
 * AreaScorer — v2 Stage-2 grading harness building block.
 *
 * The CLI emits Stage-1 (prompts.json + DataPretest) and consumes Stage-3
 * (rebuild index from `_gradings/`). Stage-2 — the actual scoring — lives in
 * the harness. The CLI explicitly does NOT run Agent() (FlowMcpCli.mjs:12357).
 *
 * AreaScorer turns one area's evaluator output (the answer-envelope defined by
 * prompts/output-schemas/<area>.schema.json) into a full Grading entry via the
 * verified module API (Grading.createEntry -> addGrading -> computeAggregateGrade)
 * and writes it to the island `_gradings/` dir, where RebuildIndex derives the
 * node grade (RebuildIndex.#gradingToNode path 4: entry.grade present).
 *
 * Seam: the LLM call is delegated to a caller-supplied `skillInvoker` callback
 * (production: Claude Code subagent; tests: mock) — mirroring FleetRunner. The
 * scorer itself makes NO LLM calls.
 *
 * Neutral-area non-deterministic resolution: `single-test` is a neutral area
 * (persona:null) but carries non-deterministic questions, and Grading.addGrading
 * raises GRD-005 (personaIds[] required for non-det). The harness convention
 * attaches selectionContext.personaIds=['neutral'] to neutral non-det gradings —
 * no core/spec change.
 *
 * NO SILENT DEFAULTS. Static methods only, object params, object returns.
 */

import { mkdir, writeFile, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { Grading } from '../Grading.mjs'


const VALID_SCORE_ENUMS = [ 'pass', 'fail', 'stale', 'n/a' ]
const NA_REASONS = [
    'not-applicable-to-tool-type',
    'requires-private-data',
    'blocked-by-precondition',
    'out-of-scope-resource',
    'out-of-scope-prompt',
    'out-of-scope-procedure'
]
const NEUTRAL_PERSONA_IDS = [ 'neutral' ]
const HARNESS = 'claude-code'


class AreaScorer {
    /**
     * Validate an evaluator answer-envelope's answers against the question set.
     * No silent skips — every divergence is a message (strict-verification rule).
     *
     * @param {Object}   params
     * @param {Object[]} params.answers   — answers[] from the evaluator envelope
     * @param {Object[]} params.questions — the area's questions (id, determinism, weight, dimension)
     * @returns {{ status: boolean, messages: string[] }}
     */
    static validateAnswers( { answers, questions } ) {
        const messages = []
        const struct = { status: false, messages }

        if( Array.isArray( answers ) === false ) {
            messages.push( 'ASC-001: answers must be an array' )
            return struct
        }
        if( Array.isArray( questions ) === false || questions.length === 0 ) {
            messages.push( 'ASC-001: questions must be a non-empty array' )
            return struct
        }
        if( answers.length !== questions.length ) {
            messages.push( `ASC-002: answer count ${answers.length} does not match question count ${questions.length}` )
            return struct
        }

        const knownIds = questions
            .map( ( question ) => question.id )
        const seen = []

        answers
            .forEach( ( answer, index ) => {
                if( answer === null || typeof answer !== 'object' ) {
                    messages.push( `ASC-003: answers[${index}] is not an object` )
                    return
                }
                const { questionId, score, reasoning, naReason } = answer
                if( typeof questionId !== 'string' || knownIds.includes( questionId ) === false ) {
                    messages.push( `ASC-003: answers[${index}] unknown questionId: ${questionId}` )
                    return
                }
                if( seen.includes( questionId ) === true ) {
                    messages.push( `ASC-003: answers[${index}] duplicate questionId: ${questionId}` )
                    return
                }
                seen.push( questionId )

                const scoreOk = AreaScorer.#isValidScore( { score } )
                if( scoreOk === false ) {
                    messages.push( `ASC-004: answers[${index}] (${questionId}) invalid score: ${JSON.stringify( score )}` )
                }
                if( typeof reasoning !== 'string' || reasoning.length === 0 ) {
                    messages.push( `ASC-005: answers[${index}] (${questionId}) reasoning must be a non-empty string` )
                }
                if( score === 'n/a' && NA_REASONS.includes( naReason ) === false ) {
                    messages.push( `ASC-006: answers[${index}] (${questionId}) score 'n/a' requires a valid naReason` )
                }
            } )

        if( messages.length > 0 ) { return struct }

        struct.status = true
        return struct
    }


    /**
     * Map validated answers to grading objects for Grading.addGrading. Joins each
     * answer to its question by id to recover dimension / determinism / weight
     * (the answer-envelope itself carries none of these — additionalProperties:false).
     *
     * @param {Object}   params
     * @param {Object[]} params.answers
     * @param {Object[]} params.questions
     * @param {string}   params.recordedAt — ISO timestamp stamped on each grading
     * @returns {{ gradings: Object[], errors: string[] }}
     */
    static answersToGradings( { answers, questions, recordedAt } ) {
        if( typeof recordedAt !== 'string' || recordedAt.length === 0 ) {
            return { gradings: [], errors: [ 'ASC-001: recordedAt required' ] }
        }
        const byId = {}
        questions
            .forEach( ( question ) => { byId[ question.id ] = question } )

        const errors = []
        const gradings = answers
            .map( ( answer ) => {
                const question = byId[ answer.questionId ]
                if( question === undefined ) {
                    errors.push( `ASC-003: no question for ${answer.questionId}` )
                    return null
                }
                const grading = {
                    dimension: question.dimension,
                    score: answer.score,
                    determinism: question.determinism,
                    weight: typeof question.weight === 'number' ? question.weight : 1.0,
                    reasoning: answer.reasoning,
                    recordedAt
                }
                // Neutral-area rule: neutral non-det gradings carry a sentinel
                // personaIds so addGrading's GRD-005 passes without a core change.
                if( question.determinism === 'non-deterministic' ) {
                    grading.selectionContext = { personaIds: NEUTRAL_PERSONA_IDS }
                }
                return grading
            } )
            .filter( ( grading ) => grading !== null )

        return { gradings, errors }
    }


    /**
     * Build a full Grading entry from gradings (grading-spec entry construction). Routes through
     * createEntry -> addGrading (per grading) -> computeAggregateGrade and stamps
     * the derived grade onto the entry so RebuildIndex reads it directly.
     *
     * @returns {{ entry: Object|null, errors: string[] }}
     */
    static buildEntry( { schemaId, area, llmModel, gradings, schemaHash } ) {
        if( typeof schemaId !== 'string' || schemaId.length === 0 ) {
            return { entry: null, errors: [ 'ASC-001: schemaId required' ] }
        }
        if( typeof llmModel !== 'string' || llmModel.length === 0 ) {
            return { entry: null, errors: [ 'ASC-001: llmModel required' ] }
        }
        if( Array.isArray( gradings ) === false || gradings.length === 0 ) {
            return { entry: null, errors: [ 'ASC-001: gradings must be a non-empty array' ] }
        }

        const created = Grading.createEntry( {
            schemaId,
            gradingTier: 'autonomous',
            grader: { kind: 'llm', llmModel },
            area,
            harness: HARNESS
        } )
        if( created.entry === null ) {
            return { entry: null, errors: created.errors }
        }

        const accumulated = gradings
            .reduce( ( acc, grading ) => {
                if( acc.errors.length > 0 ) { return acc }
                const added = Grading.addGrading( { entry: acc.entry, grading } )
                if( added.errors.length > 0 ) {
                    return { entry: acc.entry, errors: added.errors }
                }
                return { entry: added.entry, errors: [] }
            }, { entry: created.entry, errors: [] } )
        if( accumulated.errors.length > 0 ) {
            return { entry: null, errors: accumulated.errors }
        }

        const computed = Grading.computeAggregateGrade( { entry: accumulated.entry } )
        if( computed.errors.length > 0 ) {
            return { entry: null, errors: computed.errors }
        }
        if( computed.aggregateGrade === null ) {
            return { entry: null, errors: [ 'ASC-007: no scorable answers — aggregateGrade is null' ] }
        }

        const entry = Object.assign( {}, accumulated.entry, {
            aggregateGrade: computed.aggregateGrade,
            grade: computed.aggregateGrade,
            rawGrade: computed.rawGrade,
            normalizedScore: computed.normalizedScore,
            gradingMode: 'full'
        } )
        if( typeof schemaHash === 'string' && schemaHash.length > 0 ) {
            entry.schemaHash = schemaHash
        }

        return { entry, errors: [] }
    }


    /**
     * Score one area end-to-end via the skillInvoker seam. The skillInvoker returns
     * the FleetRunner-shaped { gradingJson, iteration?, blocker? }, where gradingJson
     * is the area answer-envelope. Returns the built entry (caller writes it).
     *
     * @param {Object}   params
     * @param {string}   params.area
     * @param {Object[]} params.questions
     * @param {string}   params.schemaId
     * @param {string}   params.llmModel
     * @param {string}   [params.schemaHash]
     * @param {Function} params.skillInvoker — async ({ skillName, payload }) => { gradingJson, blocker? }
     * @param {Object}   [params.payload]    — extra payload merged into the skill payload
     * @param {string}   params.recordedAt
     * @returns {Promise<{ entry: Object|null, answers: Object[]|null, blocker: string|null, errors: string[] }>}
     */
    static async scoreArea( { area, questions, schemaId, llmModel, schemaHash, skillInvoker, payload, recordedAt } ) {
        if( typeof skillInvoker !== 'function' ) {
            return { entry: null, answers: null, blocker: null, errors: [ 'ASC-001: skillInvoker must be a function' ] }
        }
        if( typeof area !== 'string' || area.length === 0 ) {
            return { entry: null, answers: null, blocker: null, errors: [ 'ASC-001: area required' ] }
        }

        const skillName = `${area}-start-grade`
        const invokePayload = Object.assign( {}, payload === undefined || payload === null ? {} : payload, {
            area, schemaId, schemaHash, harness: HARNESS
        } )

        let response
        try {
            response = await skillInvoker( { skillName, payload: invokePayload } )
        } catch( invokerError ) {
            return { entry: null, answers: null, blocker: null, errors: [ `ASC-008: skill ${skillName} threw: ${invokerError.message}` ] }
        }

        if( response === null || typeof response !== 'object' ) {
            return { entry: null, answers: null, blocker: null, errors: [ `ASC-008: skill ${skillName} returned no response object` ] }
        }
        if( response.blocker !== undefined && response.blocker !== null ) {
            return { entry: null, answers: null, blocker: response.blocker, errors: [] }
        }

        const envelope = response.gradingJson
        if( envelope === null || typeof envelope !== 'object' || Array.isArray( envelope.answers ) === false ) {
            return { entry: null, answers: null, blocker: null, errors: [ `ASC-008: skill ${skillName} gradingJson missing answers[]` ] }
        }

        const validated = AreaScorer.validateAnswers( { answers: envelope.answers, questions } )
        if( validated.status === false ) {
            return { entry: null, answers: envelope.answers, blocker: null, errors: validated.messages }
        }

        const mapped = AreaScorer.answersToGradings( { answers: envelope.answers, questions, recordedAt } )
        if( mapped.errors.length > 0 ) {
            return { entry: null, answers: envelope.answers, blocker: null, errors: mapped.errors }
        }

        const built = AreaScorer.buildEntry( { schemaId, area, llmModel, gradings: mapped.gradings, schemaHash } )
        if( built.entry === null ) {
            return { entry: null, answers: envelope.answers, blocker: null, errors: built.errors }
        }

        return { entry: built.entry, answers: envelope.answers, blocker: null, errors: [] }
    }


    /**
     * Write a grading entry into an island `_gradings/` dir. NO-OVERWRITE: if the
     * target filename already exists the write is refused (atomic .tmp -> rename).
     *
     * @returns {Promise<{ path: string|null, written: boolean, errors: string[] }>}
     */
    static async writeEntry( { entry, gradingsDir, area, timestamp } ) {
        if( entry === null || typeof entry !== 'object' ) {
            return { path: null, written: false, errors: [ 'ASC-001: entry required' ] }
        }
        if( typeof gradingsDir !== 'string' || gradingsDir.length === 0 ) {
            return { path: null, written: false, errors: [ 'ASC-001: gradingsDir required' ] }
        }

        let filename
        try {
            const formatted = Grading.formatGradingFilename( { area, timestamp } )
            filename = formatted.filename
        } catch( formatError ) {
            return { path: null, written: false, errors: [ `ASC-009: ${formatError.message}` ] }
        }

        const targetPath = join( gradingsDir, filename )
        if( existsSync( targetPath ) === true ) {
            return { path: targetPath, written: false, errors: [ `ASC-010: NO-OVERWRITE — ${targetPath} already exists` ] }
        }

        await mkdir( dirname( targetPath ), { recursive: true } )
        const tmpPath = `${targetPath}.tmp`
        await writeFile( tmpPath, JSON.stringify( entry, null, 4 ), 'utf-8' )
        await rename( tmpPath, targetPath )

        return { path: targetPath, written: true, errors: [] }
    }


    /**
     * Resolve the island `_gradings/` dir for an area (grading-spec gradings-dir mapping),
     * relative to providersRoot/<ns>. No silent defaults — a required segment that
     * is missing for the area is an explicit error.
     *
     * @returns {{ dir: string|null, errors: string[] }}
     */
    static resolveGradingsDir( { providersRoot, ns, schemaId, tool, skill, area } ) {
        if( typeof providersRoot !== 'string' || providersRoot.length === 0 ) {
            return { dir: null, errors: [ 'ASC-001: providersRoot required' ] }
        }
        if( typeof ns !== 'string' || ns.length === 0 ) {
            return { dir: null, errors: [ 'ASC-001: ns required' ] }
        }
        const nsDir = join( providersRoot, ns )

        const requireField = ( { value, name } ) => {
            return typeof value === 'string' && value.length > 0
                ? null
                : `ASC-001: ${name} required for area '${area}'`
        }

        if( area === 'tools-aggregate-namespace' || area === 'namespace-description' ) {
            return { dir: join( nsDir, '_gradings' ), errors: [] }
        }
        if( area === 'tools-aggregate-schema' ) {
            const missing = requireField( { value: schemaId, name: 'schemaId' } )
            if( missing !== null ) { return { dir: null, errors: [ missing ] } }
            return { dir: join( nsDir, schemaId, '_gradings' ), errors: [] }
        }
        if( area === 'single-test' ) {
            const missingS = requireField( { value: schemaId, name: 'schemaId' } )
            if( missingS !== null ) { return { dir: null, errors: [ missingS ] } }
            const missingT = requireField( { value: tool, name: 'tool' } )
            if( missingT !== null ) { return { dir: null, errors: [ missingT ] } }
            return { dir: join( nsDir, schemaId, 'tools', tool, '_gradings' ), errors: [] }
        }
        if( area === 'about-namespace' ) {
            const missing = requireField( { value: schemaId, name: 'schemaId' } )
            if( missing !== null ) { return { dir: null, errors: [ missing ] } }
            return { dir: join( nsDir, schemaId, 'resources', 'about', '_gradings' ), errors: [] }
        }
        if( area === 'namespace-skills' ) {
            const missingS = requireField( { value: schemaId, name: 'schemaId' } )
            if( missingS !== null ) { return { dir: null, errors: [ missingS ] } }
            const missingK = requireField( { value: skill, name: 'skill' } )
            if( missingK !== null ) { return { dir: null, errors: [ missingK ] } }
            return { dir: join( nsDir, schemaId, 'skills', skill, '_gradings' ), errors: [] }
        }

        return { dir: null, errors: [ `ASC-011: unknown or unsupported area: ${area}` ] }
    }


    static #isValidScore( { score } ) {
        if( typeof score === 'number' ) {
            return score >= 1 && score <= 5
        }
        if( typeof score === 'string' ) {
            return VALID_SCORE_ENUMS.includes( score )
        }
        return false
    }
}


export { AreaScorer, HARNESS, NEUTRAL_PERSONA_IDS }
