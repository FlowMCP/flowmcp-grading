/**
 * DeterministicAreaMapper — the deterministic Answer-Mapper.
 *
 * Turns a DataPretest result plus the structural-validation outcome into
 * spec-conformant DETERMINISTIC grading entries for the two "free" areas of the
 * area-dependency graph (`single-test` per tool, `tools-aggregate-schema` per
 * schema). It makes NO LLM call: the grader kind is `script`, every grading is
 * `determinism: deterministic`, and the produced entry is `gradingMode: partial`
 * (deterministic-only — the non-deterministic dimensions stay open for the later
 * LLM pass; per gradingSpec/3.0.0 ch06 a partial grading never reaches `stable`).
 *
 * Pretest -> pass/fail rule (deterministic, reproducible):
 *   single-test (per tool, dimension outputSchemaMatch):
 *     working >= effective bar (level schema-validatable | data-analyzable) -> pass
 *     below bar (level reachable | unavailable)                             -> fail
 *     key-gated tool (not evaluable without a key)                          -> SKIP (not a fail)
 *   tools-aggregate-schema (per schema, dimension schemaStructureValid):
 *     structural v4 validation passed -> pass, else -> fail
 *
 * The entry is built directly via the verified Grading module API
 * (createEntry -> addGrading -> computeAggregateGrade), NOT via AreaScorer.buildEntry
 * (which hard-wires grader.kind 'llm'). The aggregate is tier-capped at B
 * (autonomous), exactly as a provider-side deterministic grading should be.
 *
 * NO SILENT DEFAULTS. Static methods only, object params, object returns.
 */

import { Grading } from './Grading.mjs'


const SINGLE_TEST_DIMENSION = 'outputSchemaMatch'
const SIZE_DIMENSION = 'responseSizeWithinLimit'
const SCHEMA_AGGREGATE_DIMENSION = 'schemaStructureValid'
const GREEN_LEVELS = [ 'schema-validatable', 'data-analyzable' ]


class DeterministicAreaMapper {
    /**
     * Build one deterministic-only grading entry for an area from its gradings.
     * @returns {{ entry: Object|null, errors: string[] }}
     */
    static #buildEntry( { schemaId, area, gradings, schemaHash } ) {
        const created = Grading.createEntry( {
            schemaId,
            gradingTier: 'autonomous',
            grader: { kind: 'script' },
            area
        } )
        if( created.entry === null ) {
            return { entry: null, errors: created.errors }
        }

        const accumulated = gradings
            .reduce( ( state, grading ) => {
                if( state.errors.length > 0 ) { return state }
                const added = Grading.addGrading( { entry: state.entry, grading } )
                if( added.errors.length > 0 ) {
                    return { entry: state.entry, errors: added.errors }
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
            return { entry: null, errors: [ 'DAM-002: no scorable deterministic gradings — aggregateGrade is null' ] }
        }

        const entry = Object.assign( {}, accumulated.entry, {
            aggregateGrade: computed.aggregateGrade,
            grade: computed.aggregateGrade,
            rawGrade: computed.rawGrade,
            normalizedScore: computed.normalizedScore,
            gradingMode: 'partial'
        } )
        if( typeof schemaHash === 'string' && schemaHash.length > 0 ) {
            entry.schemaHash = schemaHash
        }

        return { entry, errors: [] }
    }


    /**
     * Map one tool's per-tool pretest node to its deterministic single-test gradings.
     * Returns null to SKIP (key-gated / absent node — not evaluable, never a fail),
     * else an array of gradings: the working-test bar (outputSchemaMatch) and the
     * response-size threshold (responseSizeWithinLimit, fails on an extreme >10 MB
     * content-bloat response).
     */
    static #toolGradings( { node, recordedAt } ) {
        if( node === undefined || node === null ) { return null }
        if( node.class === 'key-gated' ) { return null }

        const green = GREEN_LEVELS.includes( node.level ) === true
        const working = typeof node.working === 'number' ? node.working : 0
        const bar = typeof node.bar === 'number' ? node.bar : 2
        const extreme = node.extreme === true
        const maxBytes = typeof node.maxResponseBytes === 'number' ? node.maxResponseBytes : 0

        const gradings = [ {
            dimension: SINGLE_TEST_DIMENSION,
            score: green === true ? 'pass' : 'fail',
            determinism: 'deterministic',
            weight: 1.0,
            reasoning: `deterministic single-test: working ${working}/${bar} (level ${node.level}, class ${node.class})`,
            recordedAt
        } ]

        // The response-size dimension is a penalty-only signal: an `extreme` (>10 MB
        // content-bloat) response adds a deterministic fail that downgrades the tool;
        // a within-limit response adds no grading (so it never dilutes the working-test
        // bar). `large` (>1 MB) stays a recorded warning flag, not an automatic fail.
        if( extreme === true ) {
            gradings.push( {
                dimension: SIZE_DIMENSION,
                score: 'fail',
                determinism: 'deterministic',
                weight: 1.0,
                reasoning: `deterministic response size: maxResponseBytes ${maxBytes} exceeds the 10 MB extreme threshold (content-bloat)`,
                recordedAt
            } )
        }

        return gradings
    }


    /**
     * Produce the deterministic grading entries for one schema.
     *
     * @param {Object} params
     * @param {string} params.namespace
     * @param {string} params.schemaId        — the schema folder name
     * @param {Object} params.main            — the live schema main export
     * @param {Object} params.validate        — structural validation result ({ status })
     * @param {Object} params.pretest         — DataPretest.run() result ({ perTool, keyGated, ... })
     * @param {string} params.recordedAt      — ISO timestamp stamped on each grading
     * @param {string} [params.schemaHash]
     * @returns {{ entries: { area: string, tool: string|null, entry: Object }[], skipped: Object[], errors: string[] }}
     */
    static mapSchema( { namespace, schemaId, main, validate, pretest, recordedAt, schemaHash } ) {
        const errors = []
        const entries = []
        const skipped = []

        if( typeof schemaId !== 'string' || schemaId.length === 0 ) {
            return { entries: [], skipped: [], errors: [ 'DAM-001: schemaId required' ] }
        }
        if( typeof recordedAt !== 'string' || recordedAt.length === 0 ) {
            return { entries: [], skipped: [], errors: [ 'DAM-001: recordedAt required' ] }
        }

        const perTool = pretest !== undefined && pretest !== null && typeof pretest.perTool === 'object' && pretest.perTool !== null
            ? pretest.perTool
            : {}

        Object
            .keys( perTool )
            .forEach( ( tool ) => {
                const gradings = DeterministicAreaMapper.#toolGradings( { node: perTool[ tool ], recordedAt } )
                if( gradings === null ) {
                    skipped.push( { area: 'single-test', tool, reason: 'not-evaluable-deterministically (key-gated or no per-tool node)' } )
                    return
                }
                const built = DeterministicAreaMapper.#buildEntry( { schemaId, area: 'single-test', gradings, schemaHash } )
                if( built.entry === null ) {
                    errors.push( ...built.errors.map( ( error ) => `single-test/${tool}: ${error}` ) )
                    return
                }
                entries.push( { area: 'single-test', tool, entry: built.entry } )
            } )

        const structureGrading = {
            dimension: SCHEMA_AGGREGATE_DIMENSION,
            score: validate !== undefined && validate !== null && validate.status === true ? 'pass' : 'fail',
            determinism: 'deterministic',
            weight: 1.0,
            reasoning: `deterministic tools-aggregate-schema: structural v4 validation ${validate !== undefined && validate !== null && validate.status === true ? 'passed' : 'failed'}`,
            recordedAt
        }
        const aggregateBuilt = DeterministicAreaMapper.#buildEntry( { schemaId, area: 'tools-aggregate-schema', gradings: [ structureGrading ], schemaHash } )
        if( aggregateBuilt.entry === null ) {
            errors.push( ...aggregateBuilt.errors.map( ( error ) => `tools-aggregate-schema: ${error}` ) )
        } else {
            entries.push( { area: 'tools-aggregate-schema', tool: null, entry: aggregateBuilt.entry } )
        }

        return { entries, skipped, errors }
    }
}


export { DeterministicAreaMapper }
