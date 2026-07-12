/**
 * SingleSchemaPhases — provider-side skill family (autonomous tier), v2 Areas.
 *
 * The linear P1-P7 phase model is replaced by the SIX provider-side grading Areas
 * (gradingSpec/3.0.0 §5.1 areas 1-6). Each Area is a self-contained rubric; the
 * only ordering obligations are the cascade/veto rules and the deterministic-first
 * rule (§06).
 *
 * | # | Area                       | Determinism                      |
 * |---|----------------------------|----------------------------------|
 * | 1 | single-test                | deterministic gate + non-det     |
 * | 2 | tools-aggregate-schema     | both                             |
 * | 3 | tools-aggregate-namespace  | both                             |
 * | 4 | namespace-description      | non-det                          |
 * | 5 | namespace-skills           | non-det (per skill)              |
 * | 6 | about-namespace            | deterministic (route-exists) + non-det |
 *
 * Binding rules carried here:
 *   - HTTP 4xx is NEVER pass — only HTTP 200 is `pass` (feedback_http_400_is_not_pass).
 *   - Deterministic-first: the deterministic gate (single-test) runs before the
 *     non-deterministic content judgement.
 *   - The deterministic block is reconciled with DataPretest results (the real
 *     working-tests gate replaces the old `stub:true` hardcoded scores).
 *
 * Node status uses the 5-status enum (pending/blocked/graded/stable/rejected).
 *
 * NO SILENT DEFAULTS. Static methods only, object params, object returns.
 */

import { Grading } from '../Grading.mjs'


const PROVIDER_AREAS = [
    'single-test',
    'tools-aggregate-schema',
    'tools-aggregate-namespace',
    'namespace-description',
    'namespace-skills',
    'about-namespace'
]

// Areas that are purely deterministic gates vs. carry a non-deterministic block.
const DETERMINISTIC_FIRST_AREA = 'single-test'

const TIER = 'autonomous'
const NODE_STATUSES = [ 'pending', 'blocked', 'graded', 'stable', 'rejected' ]


class SingleSchemaPhases {
    static getTier() {
        return { tier: TIER }
    }


    static getAreas() {
        return { areas: PROVIDER_AREAS.slice() }
    }


    /**
     * runArea — grade one provider-side Area for a schema. The deterministic gate
     * (single-test) reconciles its HTTP-200 result from a DataPretest summary; the
     * 4xx-is-never-pass rule is enforced here.
     *
     * @param {Object} params
     * @param {Object} params.entry        — the grading entry (gradingTier=autonomous)
     * @param {string} params.schemaPath   — filesystem path to the schema
     * @param {string} params.area         — one of the six provider areas
     * @param {Object} [params.dataPretest] — optional DataPretest summary { ok, httpStatus, workingTests }
     * @returns {{ entry: Object, status: string, errors: string[] }}
     */
    static runArea( { entry, schemaPath, area, dataPretest } ) {
        const { status, messages } = SingleSchemaPhases.#validationRunArea( { entry, schemaPath, area } )
        if( !status ) { return { entry, status: 'blocked', errors: messages } }

        if( area === DETERMINISTIC_FIRST_AREA ) {
            return SingleSchemaPhases.#runSingleTest( { entry, dataPretest } )
        }

        // Non-deterministic / aggregate areas: the deterministic block is empty for
        // the engine (the harness sub-agent produces the non-det answers). The node
        // is `graded` once an answer is recorded; here it stays `pending` until the
        // harness merges its block (FleetRunner.skillInvoker seam).
        return { entry, status: 'pending', area, errors: [] }
    }


    static #runSingleTest( { entry, dataPretest } ) {
        // Deterministic gate: HTTP-200-only pass. A DataPretest summary is REQUIRED —
        // no silent default to a synthetic 200 (the old stub:true behaviour is gone).
        if( dataPretest === undefined || dataPretest === null ) {
            return {
                entry,
                status: 'blocked',
                area: 'single-test',
                errors: [ 'GRD-050: single-test requires a DataPretest summary (deterministic gate cannot run without it)' ]
            }
        }

        const httpStatus = dataPretest.httpStatus
        if( typeof httpStatus !== 'number' ) {
            return {
                entry,
                status: 'blocked',
                area: 'single-test',
                errors: [ 'GRD-050: single-test DataPretest summary missing numeric httpStatus' ]
            }
        }

        // 4xx (incl. 401/403) is NEVER pass — 200 is pass, everything else is fail/defect.
        const score = httpStatus === 200 ? 'pass' : 'fail'

        const grading = {
            dimension: 'single-test',
            score,
            determinism: 'deterministic',
            recordedAt: new Date().toISOString(),
            httpStatus,
            workingTests: typeof dataPretest.workingTests === 'number' ? dataPretest.workingTests : 0,
            area: 'single-test'
        }
        const added = Grading.addGrading( { entry, grading } )
        if( added.errors.length > 0 ) {
            return { entry: added.entry, status: 'blocked', area: 'single-test', errors: added.errors }
        }

        // A recorded deterministic answer makes the node `graded` (the terminal
        // `stable` status is set by the partial/full sequence rollup, never here).
        const nodeStatus = score === 'pass' ? 'graded' : 'blocked'
        return { entry: added.entry, status: nodeStatus, area: 'single-test', errors: [] }
    }


    static runAll( { entry, schemaPath, dataPretest } ) {
        const result = PROVIDER_AREAS
            .reduce( ( acc, area ) => {
                if( acc.blocked ) { return acc }
                const areaResult = SingleSchemaPhases.runArea( {
                    entry: acc.entry, schemaPath, area, dataPretest
                } )
                const blocked = areaResult.status === 'blocked'
                return {
                    entry: areaResult.entry,
                    errors: acc.errors.concat( areaResult.errors === undefined ? [] : areaResult.errors ),
                    areas: acc.areas.concat( [ { area, status: areaResult.status } ] ),
                    blocked
                }
            }, { entry, errors: [], areas: [], blocked: false } )

        return { entry: result.entry, errors: result.errors, areas: result.areas, tier: TIER }
    }


    static #validationRunArea( { entry, schemaPath, area } ) {
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
        if( !PROVIDER_AREAS.includes( area ) ) {
            messages.push( `GRD-002: Type mismatch for field area: expected one of [${PROVIDER_AREAS.join( ', ' )}], got ${area}` )
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


export { SingleSchemaPhases, PROVIDER_AREAS, NODE_STATUSES }
