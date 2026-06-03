/**
 * AreaDependencyGraph — loads and validates the data-driven area dependency
 * graph, and answers per-area `requiredLevel` / `dependsOn` queries.
 *
 * The graph lives as DATA (src/data/area-dependency-graph.json), NOT hardcoded in
 * source: a new edge is a data edit, not a code change. Each entry pins one area
 * to a `dependsOn` descriptor and a `requiredLevel` gate. The
 * Provider-Namespace-Gate is encoded here as namespace-areas depending on
 * `all-namespace-schemas` at `requiredLevel: deterministic-green`.
 *
 * Hard rules (binding):
 *   - static methods only, object parameters, object returns
 *   - private-by-default (# prefix) for all helpers
 *   - NO silent defaults — an unknown area / requiredLevel / dependsOn.kind each
 *     raises a distinct ADG-* error, never a silent skip
 *   - NO for/while loops, NO then/catch
 *
 * Error prefix ADG-* (AreaDependencyGraph):
 *   ADG-001 — Required parameter missing
 *   ADG-002 — Type mismatch for parameter
 *   ADG-003 — Data file not readable
 *   ADG-004 — Data file malformed (not parsable JSON / wrong top-level shape)
 *   ADG-005 — Unknown area (not in the area whitelist)
 *   ADG-006 — Unknown requiredLevel (not on the level ladder)
 *   ADG-007 — Unknown dependsOn.kind (not in the closed kind set)
 *   ADG-008 — Area not present in the loaded graph
 *   ADG-009 — derivedLevels missing a signal a graph dependsOn.kind requires
 *   ADG-010 — Unknown / missing area work classification (deterministic vs non-deterministic)
 *
 * evaluate( { graph, derivedLevels } ) (added per PRD-006) partitions every
 * graph area into `ready` (its dependency is satisfied) and `gated`
 * (with a reason). It reads the seeded graph data — no hardcoded threshold.
 * `derivedLevels` carries the levels of the dependency TARGETS:
 *   { namespaceLevel, aboutPresent, memberLevel }
 * matched per dependsOn.kind:
 *   - none                  -> always ready (schema-areas, no dependency gate)
 *   - all-namespace-schemas -> namespaceLevel must meet the area requiredLevel
 *   - about-resource-present-> aboutPresent must be true (the optional precondition)
 *   - all-member-schemas    -> memberLevel must meet the area requiredLevel
 */

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { VALID_AREAS } from './PromptBuilder.mjs'
import { LEVEL_LADDER, RequiredLevel } from './RequiredLevel.mjs'


const MODULE_DIR = dirname( fileURLToPath( import.meta.url ) )
const PACKAGE_GRAPH_PATH = resolve( MODULE_DIR, 'data', 'area-dependency-graph.json' )


const VALID_REQUIRED_LEVELS = Object.freeze( [
    'structural-valid',
    'deterministic-green',
    'stable'
] )

const VALID_DEPENDS_ON_KINDS = Object.freeze( [
    'none',
    'all-namespace-schemas',
    'about-resource-present',
    'all-member-schemas'
] )

// Per-area work classification (PRD-010): `deterministic` = the remaining work
// is structural / CLI work FlowMCP can finish for free; `non-deterministic` =
// the area still needs an LLM scoring round (a grading sub-agent). Encoded as
// DATA per graph entry — never an area->det map hardcoded in a consumer.
const VALID_CLASSIFICATIONS = Object.freeze( [
    'deterministic',
    'non-deterministic'
] )


class AreaDependencyGraph {
    // getDefaultGraphPath — the package-internal seed path. A consumer (e.g. the
    // CLI) MUST NOT guess the path; it asks the package where the seed lives, then
    // calls loadGraph. Mirrors AreaPromptLoader.getPromptsRoot.
    static getDefaultGraphPath() {
        return { path: PACKAGE_GRAPH_PATH }
    }


    static loadDefaultGraph() {
        return AreaDependencyGraph.loadGraph( { path: PACKAGE_GRAPH_PATH } )
    }


    static loadGraph( { path } ) {
        const { status, messages } = AreaDependencyGraph.#validationPath( { path } )
        if( !status ) { return { graph: null, errors: messages } }

        const read = AreaDependencyGraph.#readJson( { path } )
        if( read.errors.length > 0 ) { return { graph: null, errors: read.errors } }

        const validated = AreaDependencyGraph.#validateGraph( { raw: read.json } )
        if( validated.errors.length > 0 ) { return { graph: null, errors: validated.errors } }

        return { graph: validated.graph, errors: [] }
    }


    static requiredLevelFor( { graph, area } ) {
        const lookup = AreaDependencyGraph.#lookupEntry( { graph, area } )
        if( lookup.errors.length > 0 ) { return { requiredLevel: null, errors: lookup.errors } }

        return { requiredLevel: lookup.entry.requiredLevel, errors: [] }
    }


    static dependsOnFor( { graph, area } ) {
        const lookup = AreaDependencyGraph.#lookupEntry( { graph, area } )
        if( lookup.errors.length > 0 ) { return { dependsOn: null, errors: lookup.errors } }

        return { dependsOn: lookup.entry.dependsOn, errors: [] }
    }


    // classifyArea (PRD-010) — read-only lookup of the area's work classification
    // from the seeded graph data: `deterministic` (CLI can finish it for free) vs
    // `non-deterministic` (needs an LLM scoring round). An area whose entry carries
    // no classification raises ADG-010 — never a silent default.
    static classifyArea( { graph, area } ) {
        const lookup = AreaDependencyGraph.#lookupEntry( { graph, area } )
        if( lookup.errors.length > 0 ) { return { classification: null, errors: lookup.errors } }

        const classification = lookup.entry.classification
        if( typeof classification !== 'string' || VALID_CLASSIFICATIONS.includes( classification ) === false ) {
            return { classification: null, errors: [ `ADG-010: Area ${area} carries no valid classification (expected one of [${VALID_CLASSIFICATIONS.join( ', ' )}])` ] }
        }

        return { classification, errors: [] }
    }


    // evaluate — pure partition of every graph area into ready vs gated, from the
    // seeded graph data and the supplied dependency-target levels. No hardcoded
    // threshold: the requiredLevel comes from the graph entry. Deferred areas
    // (selection-areas) are evaluated too — they gate on memberLevel/stable.
    static evaluate( { graph, derivedLevels } ) {
        const validated = AreaDependencyGraph.#validationEvaluate( { graph, derivedLevels } )
        if( validated.errors.length > 0 ) { return { ready: [], gated: [], errors: validated.errors } }

        const partitioned = graph.entries
            .reduce( ( acc, entry ) => {
                const decided = AreaDependencyGraph.#decideArea( { entry, derivedLevels } )
                if( decided.errors.length > 0 ) {
                    acc.errors = acc.errors.concat( decided.errors )
                    return acc
                }
                if( decided.ready === true ) {
                    acc.ready.push( entry.area )
                } else {
                    acc.gated.push( { area: entry.area, reason: decided.reason } )
                }
                return acc
            }, { ready: [], gated: [], errors: [] } )

        if( partitioned.errors.length > 0 ) {
            return { ready: [], gated: [], errors: partitioned.errors }
        }

        return { ready: partitioned.ready, gated: partitioned.gated, errors: [] }
    }


    static #decideArea( { entry, derivedLevels } ) {
        const kind = entry.dependsOn.kind

        if( kind === 'none' ) {
            return { ready: true, reason: null, errors: [] }
        }

        if( kind === 'about-resource-present' ) {
            if( derivedLevels.aboutPresent === undefined ) {
                return { ready: false, reason: null, errors: [ `ADG-009: derivedLevels missing required signal aboutPresent for area ${entry.area}` ] }
            }
            if( derivedLevels.aboutPresent === true ) {
                return { ready: true, reason: null, errors: [] }
            }
            return { ready: false, reason: `dependency about-resource-present not satisfied (About resource absent)`, errors: [] }
        }

        if( kind === 'all-namespace-schemas' ) {
            return AreaDependencyGraph.#decideByLevel( { entry, level: derivedLevels.namespaceLevel, signalKey: 'namespaceLevel' } )
        }

        if( kind === 'all-member-schemas' ) {
            return AreaDependencyGraph.#decideByLevel( { entry, level: derivedLevels.memberLevel, signalKey: 'memberLevel' } )
        }

        return { ready: false, reason: null, errors: [ `ADG-007: Unknown dependsOn.kind: ${kind}` ] }
    }


    static #decideByLevel( { entry, level, signalKey } ) {
        if( level === undefined || level === null ) {
            return { ready: false, reason: null, errors: [ `ADG-009: derivedLevels missing required signal ${signalKey} for area ${entry.area}` ] }
        }
        const meets = RequiredLevel.meets( { level, requiredLevel: entry.requiredLevel } )
        if( meets.errors.length > 0 ) {
            return { ready: false, reason: null, errors: meets.errors }
        }
        if( meets.ok === true ) {
            return { ready: true, reason: null, errors: [] }
        }
        return { ready: false, reason: `dependency ${entry.dependsOn.kind} below requiredLevel ${entry.requiredLevel} (have ${level})`, errors: [] }
    }


    static #validationEvaluate( { graph, derivedLevels } ) {
        if( graph === undefined || graph === null || typeof graph !== 'object' || Array.isArray( graph ) ) {
            return { errors: [ `ADG-002: Type mismatch for field graph: expected object, got ${Array.isArray( graph ) ? 'array' : typeof graph}` ] }
        }
        if( !Array.isArray( graph.entries ) ) {
            return { errors: [ 'ADG-001: Required field missing: graph.entries' ] }
        }
        if( derivedLevels === undefined || derivedLevels === null || typeof derivedLevels !== 'object' || Array.isArray( derivedLevels ) ) {
            return { errors: [ `ADG-002: Type mismatch for field derivedLevels: expected object, got ${Array.isArray( derivedLevels ) ? 'array' : typeof derivedLevels}` ] }
        }

        return { errors: [] }
    }


    static #lookupEntry( { graph, area } ) {
        if( graph === undefined || graph === null || typeof graph !== 'object' || Array.isArray( graph ) ) {
            return { entry: null, errors: [ 'ADG-002: Type mismatch for field graph: expected object, got ' + ( Array.isArray( graph ) ? 'array' : typeof graph ) ] }
        }
        if( area === undefined || area === null ) {
            return { entry: null, errors: [ 'ADG-001: Required field missing: area' ] }
        }
        if( typeof area !== 'string' ) {
            return { entry: null, errors: [ `ADG-002: Type mismatch for field area: expected string, got ${typeof area}` ] }
        }

        const entry = graph.entries
            .find( ( item ) => item.area === area )
        if( entry === undefined ) {
            return { entry: null, errors: [ `ADG-008: Area not present in the loaded graph: ${area}` ] }
        }

        return { entry, errors: [] }
    }


    static #readJson( { path } ) {
        const content = ( () => {
            try { return { ok: true, text: readFileSync( path, 'utf-8' ) } }
            catch( e ) { return { ok: false, text: null, detail: e.message } }
        } )()
        if( content.ok === false ) {
            return { json: null, errors: [ `ADG-003: Data file not readable: ${path} (${content.detail})` ] }
        }

        const parsed = ( () => {
            try { return { ok: true, value: JSON.parse( content.text ) } }
            catch( e ) { return { ok: false, value: null, detail: e.message } }
        } )()
        if( parsed.ok === false ) {
            return { json: null, errors: [ `ADG-004: Data file malformed: ${path} (${parsed.detail})` ] }
        }

        return { json: parsed.value, errors: [] }
    }


    static #validateGraph( { raw } ) {
        if( raw === null || typeof raw !== 'object' || Array.isArray( raw ) ) {
            return { graph: null, errors: [ 'ADG-004: Data file malformed: top-level must be an object' ] }
        }
        if( typeof raw.version !== 'string' || raw.version.length === 0 ) {
            return { graph: null, errors: [ 'ADG-004: Data file malformed: missing top-level string field version' ] }
        }
        if( !Array.isArray( raw.entries ) || raw.entries.length === 0 ) {
            return { graph: null, errors: [ 'ADG-004: Data file malformed: entries must be a non-empty array' ] }
        }

        const entryErrors = raw.entries
            .flatMap( ( entry, idx ) => AreaDependencyGraph.#validateEntry( { entry, idx } ) )
        if( entryErrors.length > 0 ) {
            return { graph: null, errors: entryErrors }
        }

        return { graph: { version: raw.version, entries: raw.entries }, errors: [] }
    }


    static #validateEntry( { entry, idx } ) {
        const errors = []

        if( entry === null || typeof entry !== 'object' || Array.isArray( entry ) ) {
            errors.push( `ADG-004: Data file malformed: entry[${idx}] must be an object` )
            return errors
        }

        if( typeof entry.area !== 'string' ) {
            errors.push( `ADG-001: Required field missing: entry[${idx}].area` )
        } else if( !VALID_AREAS.includes( entry.area ) ) {
            errors.push( `ADG-005: Unknown area: ${entry.area} (expected one of [${VALID_AREAS.join( ', ' )}])` )
        }

        if( typeof entry.requiredLevel !== 'string' ) {
            errors.push( `ADG-001: Required field missing: entry[${idx}].requiredLevel` )
        } else if( !VALID_REQUIRED_LEVELS.includes( entry.requiredLevel ) ) {
            errors.push( `ADG-006: Unknown requiredLevel: ${entry.requiredLevel} (expected one of [${VALID_REQUIRED_LEVELS.join( ', ' )}], ladder=[${LEVEL_LADDER.join( ', ' )}])` )
        }

        if( typeof entry.classification !== 'string' ) {
            errors.push( `ADG-001: Required field missing: entry[${idx}].classification` )
        } else if( !VALID_CLASSIFICATIONS.includes( entry.classification ) ) {
            errors.push( `ADG-010: Unknown classification: ${entry.classification} (expected one of [${VALID_CLASSIFICATIONS.join( ', ' )}])` )
        }

        if( entry.dependsOn === undefined || entry.dependsOn === null || typeof entry.dependsOn !== 'object' || Array.isArray( entry.dependsOn ) ) {
            errors.push( `ADG-001: Required field missing: entry[${idx}].dependsOn` )
        } else if( typeof entry.dependsOn.kind !== 'string' ) {
            errors.push( `ADG-001: Required field missing: entry[${idx}].dependsOn.kind` )
        } else if( !VALID_DEPENDS_ON_KINDS.includes( entry.dependsOn.kind ) ) {
            errors.push( `ADG-007: Unknown dependsOn.kind: ${entry.dependsOn.kind} (expected one of [${VALID_DEPENDS_ON_KINDS.join( ', ' )}])` )
        }

        return errors
    }


    static #validationPath( { path } ) {
        const messages = []
        const struct = { status: false, messages }

        if( path === undefined || path === null ) {
            messages.push( 'ADG-001: Required field missing: path' )
            return struct
        }
        if( typeof path !== 'string' ) {
            messages.push( `ADG-002: Type mismatch for field path: expected string, got ${typeof path}` )
            return struct
        }
        if( path.length === 0 ) {
            messages.push( 'ADG-001: Required field missing: path' )
            return struct
        }

        struct.status = true
        return struct
    }
}


export { AreaDependencyGraph, VALID_REQUIRED_LEVELS, VALID_DEPENDS_ON_KINDS }
