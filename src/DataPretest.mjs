/**
 * DataPretest — grading phase 0: a deterministic data pre-test.
 *
 * Before any grading runs, this class proves that a schema actually returns
 * real, downloadable data. A schema that is valid per spec is NOT good enough
 * for grading: a non-deterministic evaluator would otherwise grade against
 * empty data and still report "okay".
 *
 * The decoupled live test-runner core is migrated from the CLI task class
 * (FlowMcpCli). It calls only FlowMCP.fetch / FlowMCP.executeResource from
 * 'flowmcp/v2' and returns structured objects — no console output, no config
 * reads. The .env / serverParams acquisition stays with the caller; this class
 * NEVER reads ~/.flowmcp/.env itself.
 *
 * Public API:
 *   static getVersion() -> { version }
 *   static async run( { ... } ) -> { ok, passedDownloadable, required,
 *       payloadPath, payloadHash, results, stopReason, errors }
 *
 * Persistence (the caller passes gradingDataDir, the grading-data root):
 *   per-test  -> grading-data/providers/<namespace>/<schema>/tools/<tool>/tests/test-N.json
 *   summary   -> grading-data/providers/<namespace>/<schema>/summary.json
 *
 * dryRun: when run({ dryRun: true }) the pretest is
 * performed in full but #persist is NOT called — nothing is written to the
 * island. schemaDir/summaryPath are then null (no fabricated path) and
 * saved: false is returned. The default (dryRun: false) writes as before.
 *
 * F26 key-hygiene (HARD rule): a persisted test file carries ONLY the API
 * response plus the HTTP status and run metadata. The `request` field is NEVER
 * written to disk — FlowMCP core bakes interpolated `{{KEY}}` server params into
 * the request URL, so persisting it would leak API keys onto the filesystem. No
 * API key ever lands on disk. The in-memory results[] returned to the caller may
 * still carry request params for live inspection, but they are not persisted.
 *
 * Abort rule (deterministic): every tool needs at least minWorkingTests
 * (default 2 — the pass bar of 2 working tests per tool) working downloadable
 * tests. A working test is a `tool` or `resource` primitive with status === true
 * AND non-empty data. An HTTP 4xx / status:false / empty payload is a FAIL, never
 * a pass. skill / prompt / selection-member primitives are stubs and never count
 * toward the threshold.
 *
 * Readiness ladder (per-tool `level`): the working-test count maps to
 * a graded readiness rung so downstream consumers can tell "passes the bar" from
 * "ideal". 0 → `unavailable` (reject; in practice does not occur), 1 → `reachable`
 * (minimum, INSUFFICIENT — the deterministic test does NOT pass), 2 →
 * `schema-validatable` (the deterministic test PASSES = deterministic-green), ≥3 →
 * `data-analyzable` (ideal, a later wave). The pass bar is binary at 2; ≥3 is an
 * ideal gradient, not a second gate (F7). A tool with exactly 1 working test is
 * NOT green but is NOT hard-rejected — it stays repairable by adding a test.
 *
 * NO SILENT DEFAULTS. Static methods only, object params, object returns.
 * No for/while loops.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'

import { FlowMCP } from 'flowmcp/v2'

import { HashGenerator } from './HashGenerator.mjs'


const VERSION = '1.0.0'
// Pass bar of 2 working tests per tool: a tool is deterministic-green
// at >= 2 working downloadable tests (output schema is then validatable). 1 is the
// minimum but INSUFFICIENT; 3 is the ideal gradient, not a second gate.
const DEFAULT_MIN_WORKING_TESTS = 2
const DOWNLOADABLE_PRIMITIVES = Object.freeze( [ 'tool', 'resource' ] )
// Per-tool readiness rungs derived from the working-test count (Test-Leiter).
const TEST_DEPTH_IDEAL = 3
const TEST_LADDER = Object.freeze( {
    unavailable: 'unavailable',
    reachable: 'reachable',
    schemaValidatable: 'schema-validatable',
    dataAnalyzable: 'data-analyzable'
} )
const LIST_DIR_NAMES = Object.freeze( [ '_lists', '_shared' ] )
const MAX_LIST_DIR_LEVELS = 10
// PRD-013: a parameterless tool declares NO user-input vector and needs only one
// working test to be deterministic-green (Bar=1). The canonical FlowMCP user-input
// marker is the literal `{{USER_PARAM}}` placeholder in a parameter position.
const PARAMETERLESS_MIN_WORKING_TESTS = 1
const USER_PARAM_MARKER = '{{USER_PARAM}}'
// PRD-013 / PRD-014 class markers — explicit, surfaced, never silent.
const TOOL_CLASS = Object.freeze( {
    normal: 'normal',
    parameterless: 'parameterless',
    keyGated: 'key-gated',
    needsTests: 'needs-tests'
} )


class DataPretest {
    static getVersion() {
        return { version: VERSION }
    }


    // #levelForWorking — map a per-tool working-test count to a readiness-ladder
    // rung. Deterministic, pure. 0 → unavailable, 1 → reachable
    // (insufficient), 2 → schema-validatable (= deterministic-green), >=3 →
    // data-analyzable (ideal).
    static #levelForWorking( { working } ) {
        const count = typeof working === 'number' ? working : 0
        if( count <= 0 ) { return TEST_LADDER.unavailable }
        if( count === 1 ) { return TEST_LADDER.reachable }
        if( count < TEST_DEPTH_IDEAL ) { return TEST_LADDER.schemaValidatable }
        return TEST_LADDER.dataAnalyzable
    }


    // #toolIsParameterless (PRD-013) — a tool is parameterless when it declares NO
    // user-input vector. Deterministic + pure, derived from TWO explicit signals
    // (both must agree — NO SILENT DEFAULTS, no blanket exception):
    //   1. parameters[] carries no `{{USER_PARAM}}` user-input position, AND
    //   2. no declared test case supplies any userParams (a non-`_description` key).
    // Requiring both prevents a tool whose tests pass real inputs from being
    // mis-classified as parameterless when its parameters[] is merely absent. The
    // canonical FlowMCP user-input marker is the literal `{{USER_PARAM}}` placeholder.
    static #toolIsParameterless( { toolConfig } ) {
        const parameters = Array.isArray( toolConfig[ 'parameters' ] ) ? toolConfig[ 'parameters' ] : []
        const declaresUserInput = parameters
            .some( ( param ) => DataPretest.#parameterIsUserInput( { param } ) )
        if( declaresUserInput === true ) { return false }

        const toolTests = Array.isArray( toolConfig[ 'tests' ] ) ? toolConfig[ 'tests' ] : []
        const anyTestHasUserParams = toolTests
            .some( ( testCase ) => {
                if( testCase === null || typeof testCase !== 'object' ) { return false }
                const inputKeys = Object.keys( testCase )
                    .filter( ( key ) => key !== '_description' )
                return inputKeys.length > 0
            } )
        return anyTestHasUserParams === false
    }


    // #parameterIsUserInput (PRD-013) — true when a single parameter position is a
    // user-supplied input (carries the `{{USER_PARAM}}` marker as its value). All
    // other positions are fixed constants. Pure.
    static #parameterIsUserInput( { param } ) {
        if( param === null || typeof param !== 'object' ) { return false }
        const position = param[ 'position' ]
        if( position === null || typeof position !== 'object' ) { return false }
        return position[ 'value' ] === USER_PARAM_MARKER
    }


    // #downloadableToolsFromMain (PRD-013) — enumerate EVERY downloadable tool from
    // main.tools/main.routes plus main.resources.queries, independent of whether the
    // tool carries any tests[]. This is the source-of-truth tool list so a tool with
    // 0 tests becomes VISIBLE (needs-tests) instead of falling silently out of the
    // results-driven aggregation. Returns
    // [ { name, parameterless, testCount } ]. Pure.
    static #downloadableToolsFromMain( { main } ) {
        const tools = main[ 'tools' ] !== undefined
            ? main[ 'tools' ]
            : ( main[ 'routes' ] !== undefined ? main[ 'routes' ] : {} )
        const toolEntries = Object.entries( tools )
            .map( ( [ name, toolConfig ] ) => {
                const toolTests = Array.isArray( toolConfig[ 'tests' ] ) ? toolConfig[ 'tests' ] : []
                return {
                    name,
                    parameterless: DataPretest.#toolIsParameterless( { toolConfig } ),
                    testCount: toolTests.length
                }
            } )

        const resources = main[ 'resources' ] === undefined ? {} : main[ 'resources' ]
        const resourceEntries = Object.entries( resources )
            .reduce( ( acc, [ resourceName, resourceConfig ] ) => {
                const queries = resourceConfig[ 'queries' ] === undefined ? {} : resourceConfig[ 'queries' ]
                const perQuery = Object.entries( queries )
                    .map( ( [ queryName, queryConfig ] ) => {
                        const queryTests = Array.isArray( queryConfig[ 'tests' ] ) ? queryConfig[ 'tests' ] : []
                        return {
                            name: `${resourceName}.${queryName}`,
                            parameterless: DataPretest.#toolIsParameterless( { toolConfig: queryConfig } ),
                            testCount: queryTests.length
                        }
                    } )
                return acc.concat( perQuery )
            }, [] )

        return toolEntries.concat( resourceEntries )
    }


    // #barForTool (PRD-013) — the EFFECTIVE per-tool pass bar. A parameterless tool
    // needs only 1 working test (Bar=1); every other tool keeps the global
    // minWorkingTests (Bar=2 by default). The global constant is NEVER mutated — the
    // bar is decided per tool. NO SILENT DEFAULTS.
    static #barForTool( { parameterless, minWorkingTests } ) {
        return parameterless === true ? PARAMETERLESS_MIN_WORKING_TESTS : minWorkingTests
    }


    // #extractHttpStatus (PRD-015) — robustly recover the real HTTP status code from
    // a FlowMCP error message. FlowMCP core formats a non-ok response as
    // `HTTP <code>: <statusText>` (flowmcp-core Fetch.mjs:220). We read the code out
    // of that exact shape — no guessing, NO SILENT DEFAULTS: a message without an
    // `HTTP <ddd>` token returns null (the caller keeps the raw error instead).
    static #extractHttpStatus( { error } ) {
        if( typeof error !== 'string' ) { return null }
        const match = error.match( /HTTP\s+(\d{3})\b/ )
        return match === null ? null : Number( match[ 1 ] )
    }


    // #canonicalTestKey (PRD-015) — a byte-stable key for a test case that ignores
    // ONLY the human `_description` field. Two tests sharing this key are
    // byte-identical except for their description = a duplicate. Pure.
    static #canonicalTestKey( { userParams } ) {
        const params = userParams === undefined || userParams === null ? {} : userParams
        const sortedKeys = Object.keys( params ).sort()
        const canonical = sortedKeys
            .reduce( ( acc, key ) => {
                acc[ key ] = params[ key ]
                return acc
            }, {} )
        return JSON.stringify( canonical )
    }


    static async run( {
        namespace,
        toolName,
        main,
        handlersFn = null,
        schemaSnapshotPath = null,
        serverParams = {},
        sharedLists = {},
        gradingDataDir,
        minWorkingTests = DEFAULT_MIN_WORKING_TESTS,
        dryRun = false
    } ) {
        const { status, messages } = DataPretest.#validationRun( {
            namespace, toolName, main, gradingDataDir, minWorkingTests
        } )
        if( !status ) {
            return {
                ok: false,
                passedDownloadable: 0,
                required: minWorkingTests,
                payloadPath: null,
                payloadHash: null,
                results: [],
                stopReason: 'invalid-input',
                errors: messages
            }
        }

        const errors = []

        // Source-of-truth tool list (PRD-013): every downloadable tool declared in
        // main.tools/main.routes/main.resources, with its parameterless flag and
        // declared test count. This drives visibility so a 0-test tool can NEVER
        // vanish silently from the aggregation.
        const declaredTools = DataPretest.#downloadableToolsFromMain( { main } )
        const parameterlessByTool = declaredTools
            .reduce( ( acc, tool ) => {
                acc[ tool[ 'name' ] ] = tool[ 'parameterless' ]
                return acc
            }, {} )

        // PRD-014 (key-gated, F13=A): if any required server parameter is absent, the
        // schema is key-gated. requiredServerParams is schema-wide, so a missing key
        // gates EVERY downloadable tool in the file. A key-gated schema is its OWN
        // class ("not evaluable without key") — NOT a FAIL — and the futile live call
        // is SKIPPED (no 4xx that would also trigger DPT-004). DPT-007 (INFO) lists the
        // missing key NAMES for diagnostics (env doctor), but is not grade-wirksam.
        const required = main[ 'requiredServerParams' ] === undefined
            ? []
            : main[ 'requiredServerParams' ]
        const missingParams = required
            .filter( ( paramName ) => serverParams[ paramName ] === undefined )
        const keyGated = missingParams.length > 0

        if( keyGated ) {
            errors.push( `DPT-007: Key-gated — not evaluable without key (missing requiredServerParam): ${missingParams.join( ', ' )}` )
        }

        const resolved = await DataPretest.#resolveHandlers( {
            main,
            handlersFn,
            filePath: schemaSnapshotPath
        } )
        const handlerResolutionErrors = resolved[ 'errors' ]
        handlerResolutionErrors
            .forEach( ( message ) => { errors.push( message ) } )

        // PRD-014: a key-gated schema NEVER reaches the live test layer (no futile
        // 4xx). The result list is empty; the per-tool class is derived from the
        // declared tools below. With keys present, the normal live path runs.
        const typedRun = keyGated
            ? { results: [] }
            : await DataPretest.#runTypedTests( {
                main,
                handlerMap: resolved[ 'handlerMap' ],
                resourceHandlerMap: resolved[ 'resourceHandlerMap' ],
                serverParams,
                sharedLists,
                fullOutput: true
            } )

        // PRD-015 (duplicate detection): mark byte-identical-except-_description tests
        // per tool BEFORE counting. The FIRST occurrence is kept (isDuplicate:false);
        // each later byte-identical sibling is a duplicate (isDuplicate:true) that
        // does NOT count toward the bar and surfaces a DPT-008.
        const dupSeen = {}
        const results = typedRun[ 'results' ]
            .map( ( entry ) => {
                const hasData = DataPretest.#hasData( { output: entry[ 'output' ] } )
                const downloadable = DOWNLOADABLE_PRIMITIVES.includes( entry[ 'primitive' ] )
                const httpStatus = DataPretest.#extractHttpStatus( { error: entry[ 'error' ] } )

                const toolKey = entry[ 'name' ]
                const canonical = DataPretest.#canonicalTestKey( { userParams: entry[ 'request' ] } )
                const dupKey = `${toolKey}::${canonical}`
                const isDuplicate = downloadable && dupSeen[ dupKey ] === true
                if( downloadable ) { dupSeen[ dupKey ] = true }

                // A duplicate never counts as a working download (it adds no real
                // second coverage) — it must not let a single test "pass" the bar twice.
                const working = downloadable && isDuplicate === false && entry[ 'status' ] === true && hasData

                if( isDuplicate ) {
                    errors.push( `DPT-008: Duplicate test (byte-identical except _description) — counted once: ${entry[ 'name' ]}: ${canonical}` )
                } else if( !working && downloadable ) {
                    const rawDetail = entry[ 'error' ] === null || entry[ 'error' ] === undefined
                        ? `${entry[ 'name' ]}: empty data`
                        : `${entry[ 'name' ]}: ${entry[ 'error' ]}`
                    const detail = httpStatus === null ? rawDetail : `${rawDetail} (HTTP ${httpStatus})`
                    errors.push( `DPT-004: Test failed (not counted as a working download): ${detail}` )
                }

                return {
                    primitive: entry[ 'primitive' ],
                    name: entry[ 'name' ],
                    description: entry[ 'description' ] === undefined ? '' : entry[ 'description' ],
                    request: entry[ 'request' ] === undefined ? {} : entry[ 'request' ],
                    status: entry[ 'status' ],
                    error: entry[ 'error' ] === undefined ? null : entry[ 'error' ],
                    httpStatus,
                    hasData,
                    working,
                    isDuplicate,
                    durationMs: entry[ 'durationMs' ],
                    output: entry[ 'output' ] === undefined ? null : entry[ 'output' ]
                }
            } )

        const passedDownloadable = results
            .filter( ( entry ) => entry[ 'working' ] === true )
            .length

        // Per-tool gate (the spec is per-tool, NOT a schema-file total): every
        // downloadable tool must reach its EFFECTIVE bar of working tests on its own.
        // workingByTool is seeded from the DECLARED tools (PRD-013) so a tool with 0
        // tests appears with 0 working instead of disappearing.
        const workingByTool = results
            .filter( ( entry ) => DOWNLOADABLE_PRIMITIVES.includes( entry[ 'primitive' ] ) )
            .reduce( ( acc, entry ) => {
                const name = entry[ 'name' ]
                const prev = acc[ name ] === undefined ? 0 : acc[ name ]
                acc[ name ] = entry[ 'working' ] === true ? prev + 1 : prev
                return acc
            }, declaredTools.reduce( ( acc, tool ) => {
                acc[ tool[ 'name' ] ] = 0
                return acc
            }, {} ) )

        const downloadableToolCount = Object.keys( workingByTool ).length

        // PRD-013/014 — per-tool effective bar: Bar=1 for parameterless tools, the
        // global minWorkingTests otherwise (Bar=2 default, NEVER lowered for tools
        // that have parameters). Key-gated tools are NOT measured against any bar.
        const toolBar = ( name ) => DataPretest.#barForTool( {
            parameterless: parameterlessByTool[ name ] === true,
            minWorkingTests
        } )

        // toolsBelowThreshold (the FAIL set) excludes key-gated tools — they are not
        // FAILs, just not evaluable. A 0-working parameterless tool stays below its
        // own Bar=1 and is correctly surfaced (needs-tests) but, like any below-bar
        // tool, keeps ok=false (Memory: don't lower the bar to fake a pass).
        const toolsBelowThreshold = keyGated
            ? []
            : Object.entries( workingByTool )
                .filter( ( pair ) => pair[ 1 ] < toolBar( pair[ 0 ] ) )
                .map( ( pair ) => `${pair[ 0 ]} (${pair[ 1 ]}/${toolBar( pair[ 0 ] )})` )

        // ok requires at least one downloadable tool AND every such tool meeting its
        // effective bar. A purely key-gated schema is NOT ok (it is not evaluable) but
        // is NOT counted as a FAIL — stopReason names key-gated explicitly. No
        // downloadable tools at all (e.g. only stubs) stays a FAIL.
        const ok = keyGated === false && downloadableToolCount > 0 && toolsBelowThreshold.length === 0
        const stopReason = ok
            ? null
            : ( keyGated
                ? 'key-gated-not-evaluable-without-key'
                : ( downloadableToolCount === 0
                    ? 'no-downloadable-tools'
                    : `tools-below-${minWorkingTests}-working-downloadable-tests` ) )

        // DPT-003 (real FAIL abort) is emitted ONLY for genuine below-bar failures —
        // never for a purely key-gated schema (that surfaces as DPT-007, its own class).
        if( !ok && keyGated === false ) {
            const detail = downloadableToolCount === 0
                ? 'no downloadable tools with working tests'
                : `tool(s) below effective bar: ${toolsBelowThreshold.join( ', ' )}`
            errors.push( `DPT-003: Data-pretest abort: ${detail}` )
        }

        const totalByTool = results
            .filter( ( entry ) => DOWNLOADABLE_PRIMITIVES.includes( entry[ 'primitive' ] ) )
            .reduce( ( acc, entry ) => {
                const name = entry[ 'name' ]
                acc[ name ] = ( acc[ name ] === undefined ? 0 : acc[ name ] ) + 1
                return acc
            }, declaredTools.reduce( ( acc, tool ) => {
                acc[ tool[ 'name' ] ] = 0
                return acc
            }, {} ) )

        // perTool (PRD-013/014): EVERY declared downloadable tool is present, each with
        // an explicit class and the effective bar it was judged against. A parameterless
        // tool emits DPT-006; a 0-test tool surfaces as `needs-tests` (visible, not
        // silent); a key-gated tool is `key-gated`.
        const perTool = Object.keys( totalByTool )
            .reduce( ( acc, name ) => {
                const working = workingByTool[ name ] === undefined ? 0 : workingByTool[ name ]
                const total = totalByTool[ name ]
                const parameterless = parameterlessByTool[ name ] === true
                const bar = toolBar( name )
                const toolClass = keyGated
                    ? TOOL_CLASS.keyGated
                    : ( total === 0
                        ? TOOL_CLASS.needsTests
                        : ( parameterless ? TOOL_CLASS.parameterless : TOOL_CLASS.normal ) )
                if( toolClass === TOOL_CLASS.parameterless ) {
                    errors.push( `DPT-006: Parameterless tool (no user-input vector) — own class, Bar=1: ${name} (${working}/${bar})` )
                }
                acc[ name ] = {
                    working,
                    total,
                    bar,
                    parameterless,
                    class: toolClass,
                    level: DataPretest.#levelForWorking( { working } )
                }
                return acc
            }, {} )

        // dryRun === true performs the full data-pretest
        // but writes NOTHING to the island. #persist (the sole writer of test-N.json
        // + summary.json) is skipped entirely. schemaDir/summaryPath are then `null`
        // — NO SILENT DEFAULT: we never fabricate a path for a file that was not
        // written. The result (ok/perTool/toolsBelowThreshold/results/errors) is
        // returned unchanged so the caller can still print it.
        const checkedAt = new Date().toISOString()
        const persisted = dryRun === true
            ? { schemaFileDir: null, summaryPath: null }
            : await DataPretest.#persist( {
                gradingDataDir,
                namespace,
                schemaFile: toolName,
                results,
                summary: {
                    namespace,
                    schemaFile: toolName,
                    checkedAt,
                    minWorkingTests,
                    keyGated,
                    ok,
                    passedDownloadable,
                    toolsBelowThreshold,
                    perTool
                }
            } )

        return {
            ok,
            keyGated,
            passedDownloadable,
            required: minWorkingTests,
            toolsBelowThreshold,
            perTool,
            schemaDir: persisted[ 'schemaFileDir' ],
            summaryPath: persisted[ 'summaryPath' ],
            saved: dryRun !== true,
            results,
            stopReason,
            errors
        }
    }


    // --- persistence -------------------------------------------------------

    // Human-readable layout (no opaque hash filenames, no invented folder names):
    //   providers/<namespace>/<schema>/tools/<tool>/tests/test-<n>.json   (one file per test)
    //   providers/<namespace>/<schema>/summary.json                       (per-tool gate result)
    // Each test file is self-describing through the real API response plus the
    // HTTP status. The request is NEVER persisted (F26) — it would carry the
    // interpolated {{KEY}} server params and leak API keys onto disk.
    static async #persist( { gradingDataDir, namespace, schemaFile, results, summary } ) {
        const schemaFileDir = join( gradingDataDir, 'providers', namespace, schemaFile )

        const downloadable = results
            .filter( ( entry ) => DOWNLOADABLE_PRIMITIVES.includes( entry[ 'primitive' ] ) )

        const counters = {}
        await downloadable.reduce( ( promise, entry ) => promise.then( async () => {
            const tool = entry[ 'name' ]
            const next = counters[ tool ] === undefined ? 1 : counters[ tool ] + 1
            counters[ tool ] = next
            // Layout: providers/<ns>/<schema>/tools/<tool>/tests/test-N.json
            const toolDir = join( schemaFileDir, 'tools', tool, 'tests' )
            await mkdir( toolDir, { recursive: true } )
            // F26: NO `request` field. Persist only the API response, the HTTP
            // status and run metadata, so no interpolated {{KEY}} ever hits disk.
            const fileBody = {
                tool,
                test: next,
                description: entry[ 'description' ] === undefined ? '' : entry[ 'description' ],
                status: entry[ 'status' ],
                hasData: entry[ 'hasData' ],
                working: entry[ 'working' ],
                durationMs: entry[ 'durationMs' ],
                error: entry[ 'error' ] === undefined ? null : entry[ 'error' ],
                response: DataPretest.#parseResponse( { output: entry[ 'output' ] } )
            }
            await writeFile( join( toolDir, `test-${next}.json` ), JSON.stringify( fileBody, null, 4 ) + '\n', 'utf-8' )
        } ), Promise.resolve() )

        await mkdir( schemaFileDir, { recursive: true } )
        const summaryPath = join( schemaFileDir, 'summary.json' )
        await writeFile( summaryPath, JSON.stringify( summary, null, 4 ) + '\n', 'utf-8' )

        return { schemaFileDir, summaryPath }
    }


    static #parseResponse( { output } ) {
        if( output === undefined || output === null ) { return null }
        if( typeof output !== 'string' ) { return output }
        try { return JSON.parse( output ) } catch { return output }
    }


    // --- decoupled runner core (migrated from FlowMcpCli) ------------------

    static #getAllTestsTyped( { main } ) {
        const schemaRef = main[ 'namespace' ] === undefined ? 'unknown' : main[ 'namespace' ]
        const tests = []

        const tools = main[ 'tools' ] !== undefined
            ? main[ 'tools' ]
            : ( main[ 'routes' ] !== undefined ? main[ 'routes' ] : {} )
        Object.entries( tools )
            .forEach( ( [ toolName, toolConfig ] ) => {
                const toolTests = toolConfig[ 'tests' ] === undefined ? [] : toolConfig[ 'tests' ]
                toolTests
                    .forEach( ( testCase ) => {
                        const { _description, ...userParams } = testCase
                        tests.push( {
                            primitive: 'tool',
                            schemaRef,
                            name: toolName,
                            test: { _description: _description === undefined ? '' : _description, userParams },
                            context: { routeName: toolName }
                        } )
                    } )
            } )

        const resources = main[ 'resources' ] === undefined ? {} : main[ 'resources' ]
        Object.entries( resources )
            .forEach( ( [ resourceName, resourceConfig ] ) => {
                const queries = resourceConfig[ 'queries' ] === undefined ? {} : resourceConfig[ 'queries' ]
                Object.entries( queries )
                    .forEach( ( [ queryName, queryConfig ] ) => {
                        const queryTests = queryConfig[ 'tests' ] === undefined ? [] : queryConfig[ 'tests' ]
                        queryTests
                            .forEach( ( testCase ) => {
                                const { _description, ...userParams } = testCase
                                tests.push( {
                                    primitive: 'resource',
                                    schemaRef,
                                    name: `${resourceName}.${queryName}`,
                                    test: { _description: _description === undefined ? '' : _description, userParams },
                                    context: { resourceName, queryName }
                                } )
                            } )
                    } )
            } )

        const skills = main[ 'skills' ] === undefined ? [] : main[ 'skills' ]
        skills
            .forEach( ( skill ) => {
                const skillName = skill[ 'name' ]
                const explicitTests = skill[ 'tests' ] === undefined ? [] : skill[ 'tests' ]
                const skillTests = explicitTests.length > 0
                    ? explicitTests
                    : [ { _description: `Structural: ${skillName}` } ]
                skillTests
                    .forEach( ( testCase ) => {
                        const { _description, ...userParams } = testCase
                        tests.push( {
                            primitive: 'skill',
                            schemaRef,
                            name: skillName,
                            test: { _description: _description === undefined ? '' : _description, userParams },
                            context: { skill, kind: 'structural' }
                        } )
                    } )
            } )

        const prompts = main[ 'prompts' ] === undefined ? [] : main[ 'prompts' ]
        prompts
            .forEach( ( prompt ) => {
                const promptName = prompt[ 'name' ]
                const promptTests = prompt[ 'tests' ] === undefined ? [] : prompt[ 'tests' ]
                promptTests
                    .forEach( ( testCase ) => {
                        const { _description, ...userParams } = testCase
                        tests.push( {
                            primitive: 'prompt',
                            schemaRef,
                            name: promptName,
                            test: { _description: _description === undefined ? '' : _description, userParams },
                            context: { prompt }
                        } )
                    } )
            } )

        const selection = main[ 'selection' ] === undefined ? null : main[ 'selection' ]
        if( selection !== null ) {
            const memberLists = [
                { type: 'tool', ids: selection[ 'tools' ] === undefined ? [] : selection[ 'tools' ] },
                { type: 'resource', ids: selection[ 'resources' ] === undefined ? [] : selection[ 'resources' ] },
                { type: 'prompt', ids: selection[ 'prompts' ] === undefined ? [] : selection[ 'prompts' ] }
            ]
            memberLists
                .forEach( ( { type, ids } ) => {
                    ids
                        .forEach( ( memberId ) => {
                            tests.push( {
                                primitive: 'selection-member',
                                schemaRef,
                                name: memberId,
                                test: { _description: `Selection member: ${memberId}`, userParams: {} },
                                context: { memberId, memberType: type }
                            } )
                        } )
                } )

            const inlineSkills = selection[ 'skills' ] === undefined ? [] : selection[ 'skills' ]
            inlineSkills
                .forEach( ( skill ) => {
                    const skillName = skill[ 'name' ]
                    const skillTests = skill[ 'tests' ] === undefined
                        ? [ { _description: `Selection-skill (structural): ${skillName}` } ]
                        : skill[ 'tests' ]
                    skillTests
                        .forEach( ( testCase ) => {
                            const { _description, ...userParams } = testCase
                            tests.push( {
                                primitive: 'skill',
                                schemaRef,
                                name: skillName,
                                test: { _description: _description === undefined ? '' : _description, userParams },
                                context: { skill, kind: 'selection-inline' }
                            } )
                        } )
                } )
        }

        return tests
    }


    static #limitOutput( { dataAsString, fullOutput } ) {
        const previewLimit = 200
        if( !dataAsString ) {
            return null
        }
        return fullOutput === true ? dataAsString : dataAsString.slice( 0, previewLimit )
    }


    // Primitive-aware dispatcher. Always returns
    // { status, error, output, durationMs, primitive } — never throws.
    static async #executeTest( {
        typedTest, schemaMain, handlerMap = {}, resourceHandlerMap = {},
        serverParams = {}, sharedLists = {}, fullOutput = false
    } ) {
        const startedAt = Date.now()
        const primitive = typedTest[ 'primitive' ]

        try {
            if( primitive === 'tool' ) {
                const { routeName } = typedTest[ 'context' ]
                const { userParams } = typedTest[ 'test' ]

                const fetchResult = await FlowMCP.fetch( {
                    main: schemaMain,
                    handlerMap,
                    userParams,
                    serverParams,
                    routeName
                } )

                const { status, messages, dataAsString } = fetchResult
                const output = DataPretest.#limitOutput( { dataAsString, fullOutput } )
                const messageList = messages === undefined ? [] : messages
                const error = status
                    ? null
                    : ( messageList[ 0 ] === undefined ? 'unknown error' : messageList[ 0 ] )

                return { status, error, output, durationMs: Date.now() - startedAt, primitive }
            }

            if( primitive === 'resource' ) {
                const { resourceName, queryName } = typedTest[ 'context' ]
                const { userParams } = typedTest[ 'test' ]
                const resources = schemaMain[ 'resources' ] === undefined ? {} : schemaMain[ 'resources' ]
                const resourceDefinition = resources[ resourceName ]
                const schemaRef = typedTest[ 'schemaRef' ] === undefined
                    ? ( schemaMain[ 'namespace' ] === undefined ? 'unknown' : schemaMain[ 'namespace' ] )
                    : typedTest[ 'schemaRef' ]

                if( resourceDefinition === undefined ) {
                    return {
                        status: false,
                        error: `resource "${resourceName}" not found in schema`,
                        output: null,
                        durationMs: Date.now() - startedAt,
                        primitive
                    }
                }

                const execResult = await FlowMCP.executeResource( {
                    resourceDefinition,
                    resourceName,
                    queryName,
                    userParams,
                    handlerMap: resourceHandlerMap,
                    schemaRef
                } )

                const struct = execResult && execResult[ 'struct' ]
                    ? execResult[ 'struct' ]
                    : ( execResult === undefined ? {} : execResult )
                const ok = struct[ 'status' ] === true
                const dataString = struct[ 'dataAsString' ]
                    ? struct[ 'dataAsString' ]
                    : ( struct[ 'data' ] ? JSON.stringify( struct[ 'data' ] ) : null )
                const output = DataPretest.#limitOutput( { dataAsString: dataString, fullOutput } )
                const messageList = struct[ 'messages' ] === undefined ? [] : struct[ 'messages' ]
                const error = ok
                    ? null
                    : ( messageList[ 0 ] === undefined ? 'resource execution failed' : messageList[ 0 ] )

                return { status: ok, error, output, durationMs: Date.now() - startedAt, primitive }
            }

            // skill / prompt / selection-member are structural stubs. They report a
            // placeholder pass but carry no downloadable data, so they can NOT meet
            // the working-tests threshold (enforced in run() via DOWNLOADABLE_PRIMITIVES).
            if( primitive === 'skill' || primitive === 'prompt' || primitive === 'selection-member' ) {
                return {
                    status: true,
                    error: null,
                    output: `${primitive}-structural-stub`,
                    durationMs: Date.now() - startedAt,
                    primitive
                }
            }

            return {
                status: false,
                error: `unknown primitive: ${primitive}`,
                output: null,
                durationMs: Date.now() - startedAt,
                primitive
            }
        } catch( err ) {
            return {
                status: false,
                error: err && err.message ? err.message : String( err ),
                output: null,
                durationMs: Date.now() - startedAt,
                primitive
            }
        }
    }


    static async #runTypedTests( {
        main, handlerMap = {}, resourceHandlerMap = {},
        serverParams = {}, sharedLists = {}, fullOutput = false
    } ) {
        const typedTests = DataPretest.#getAllTestsTyped( { main } )

        const results = await typedTests
            .reduce( ( promise, typedTest ) => promise.then( async ( acc ) => {
                const result = await DataPretest.#executeTest( {
                    typedTest,
                    schemaMain: main,
                    handlerMap,
                    resourceHandlerMap,
                    serverParams,
                    sharedLists,
                    fullOutput
                } )

                const testCase = typedTest[ 'test' ] === undefined ? {} : typedTest[ 'test' ]
                acc.push( {
                    primitive: typedTest[ 'primitive' ],
                    name: typedTest[ 'name' ],
                    schemaRef: typedTest[ 'schemaRef' ],
                    description: testCase[ '_description' ] === undefined ? '' : testCase[ '_description' ],
                    request: testCase[ 'userParams' ] === undefined ? {} : testCase[ 'userParams' ],
                    ...result
                } )

                return acc
            } ), Promise.resolve( [] ) )

        const byPrimitive = results
            .reduce( ( acc, r ) => {
                const key = r[ 'primitive' ] === undefined ? 'unknown' : r[ 'primitive' ]
                if( acc[ key ] === undefined ) {
                    acc[ key ] = { pass: 0, fail: 0 }
                }
                if( r[ 'status' ] === true ) {
                    acc[ key ][ 'pass' ] = acc[ key ][ 'pass' ] + 1
                } else {
                    acc[ key ][ 'fail' ] = acc[ key ][ 'fail' ] + 1
                }
                return acc
            }, {} )

        const totalFail = Object
            .values( byPrimitive )
            .reduce( ( sum, v ) => sum + v[ 'fail' ], 0 )
        const overall = totalFail === 0 ? 'PASS' : 'FAIL'

        return { results, summary: { byPrimitive, overall } }
    }


    // --- setup helpers (migrated from FlowMcpCli) --------------------------

    // Resolve handler maps from the schema handlers factory. Shared lists and
    // required libraries are resolved relative to the on-disk snapshot path. A
    // resolution failure is reported (no silent default), and empty maps are
    // returned so the caller can still report a clean FAIL.
    static async #resolveHandlers( { main, handlersFn, filePath } ) {
        if( !handlersFn ) {
            return { handlerMap: {}, resourceHandlerMap: {}, errors: [] }
        }

        try {
            const sharedListRefs = main[ 'sharedLists' ] === undefined ? [] : main[ 'sharedLists' ]
            let sharedLists = {}
            let libraries = {}

            if( sharedListRefs.length > 0 && filePath ) {
                const { listsDir } = DataPretest.#findListsDir( { filePath } )
                if( listsDir !== null ) {
                    const resolvedLists = await FlowMCP.resolveSharedLists( { sharedListRefs, listsDir } )
                    sharedLists = resolvedLists[ 'sharedLists' ] === undefined ? {} : resolvedLists[ 'sharedLists' ]
                }
            }

            const requiredLibraries = main[ 'requiredLibraries' ] === undefined ? [] : main[ 'requiredLibraries' ]
            if( requiredLibraries.length > 0 ) {
                const { resolveBase } = DataPretest.#resolveLibraryBase()
                const baseRequire = createRequire( join( resolveBase, 'index.js' ) )
                const schemaRequire = filePath ? createRequire( resolve( filePath ) ) : baseRequire
                const unresolved = []

                await requiredLibraries
                    .reduce( ( promise, lib ) => promise.then( async () => {
                        const loaded = await DataPretest.#loadOneLibrary( { lib, baseRequire, schemaRequire } )
                        if( loaded[ 'status' ] === true ) {
                            libraries[ lib ] = loaded[ 'module' ]
                        } else {
                            unresolved.push( lib )
                        }
                    } ), Promise.resolve() )

                if( unresolved.length > 0 ) {
                    throw new Error( `LIB-RESOLVE: required libraries not resolvable: ${unresolved.join( ', ' )}` )
                }
            }

            const tempHandlers = handlersFn( { sharedLists, libraries } )
            const allRouteNames = Object.keys( tempHandlers === undefined ? {} : tempHandlers )
            const resources = main[ 'resources' ] === undefined ? {} : main[ 'resources' ]
            const created = FlowMCP.createHandlers( {
                handlersFn, sharedLists, libraries, routeNames: allRouteNames, resources
            } )

            return {
                handlerMap: created[ 'handlerMap' ] === undefined ? {} : created[ 'handlerMap' ],
                resourceHandlerMap: created[ 'resourceHandlerMap' ] === undefined ? {} : created[ 'resourceHandlerMap' ],
                errors: []
            }
        } catch( resolveErr ) {
            // No silent default: a handler-resolution failure becomes visible as a
            // reported error rather than swallowed into empty maps.
            return {
                handlerMap: {},
                resourceHandlerMap: {},
                errors: [ `DPT-004: Test failed (not counted as a working download): handler resolution failed: ${resolveErr.message}` ]
            }
        }
    }


    static async #loadOneLibrary( { lib, baseRequire, schemaRequire } ) {
        const requires = [ baseRequire, schemaRequire ]

        const attempt = await requires
            .reduce( async ( accPromise, req ) => {
                const acc = await accPromise
                if( acc[ 'status' ] === true ) {
                    return acc
                }
                try {
                    const resolvedPath = req.resolve( lib )
                    try {
                        const mod = await import( pathToFileURL( resolvedPath ).href )
                        return { status: true, module: mod.default === undefined ? mod : mod.default }
                    } catch( importErr ) {
                        const mod = req( lib )
                        return { status: true, module: mod.default === undefined ? mod : mod.default }
                    }
                } catch( resolveErr ) {
                    return acc
                }
            }, Promise.resolve( { status: false, module: null } ) )

        return attempt
    }


    static #resolveLibraryBase() {
        const here = dirname( fileURLToPath( import.meta.url ) )
        const resolveBase = join( here, '..' )
        return { resolveBase }
    }


    static #findListsDir( { filePath } ) {
        const resolvedPath = resolve( filePath )
        const startDir = dirname( resolvedPath )

        const result = Array.from( { length: MAX_LIST_DIR_LEVELS } )
            .reduce( ( acc, _entry, _idx ) => {
                if( acc[ 'found' ] === true ) {
                    return acc
                }
                const hit = LIST_DIR_NAMES
                    .map( ( name ) => join( acc[ 'current' ], name ) )
                    .find( ( candidate ) => existsSync( candidate ) )
                if( hit !== undefined ) {
                    return { found: true, listsDir: hit, current: acc[ 'current' ] }
                }
                const parent = dirname( acc[ 'current' ] )
                if( parent === acc[ 'current' ] ) {
                    return { found: false, listsDir: null, current: acc[ 'current' ] }
                }
                return { found: false, listsDir: null, current: parent }
            }, { found: false, listsDir: null, current: startDir } )

        return { listsDir: result[ 'listsDir' ] }
    }


    // --- helpers -----------------------------------------------------------

    // A working download has a non-empty payload. Empty string, empty array and
    // empty object are all treated as no data — never as a pass.
    static #hasData( { output } ) {
        if( output === undefined || output === null ) {
            return false
        }
        if( typeof output === 'string' ) {
            const trimmed = output.trim()
            if( trimmed.length === 0 ) {
                return false
            }
            const emptyMarkers = [ '[]', '{}', '""', 'null' ]
            return emptyMarkers.includes( trimmed ) === false
        }
        if( Array.isArray( output ) ) {
            return output.length > 0
        }
        if( typeof output === 'object' ) {
            return Object.keys( output ).length > 0
        }
        return true
    }


    static #validationRun( { namespace, toolName, main, gradingDataDir, minWorkingTests } ) {
        const messages = []
        const struct = { status: false, messages }

        const pairs = [
            [ 'namespace', namespace, 'string' ],
            [ 'toolName', toolName, 'string' ],
            [ 'gradingDataDir', gradingDataDir, 'string' ],
            [ 'main', main, 'object' ],
            [ 'minWorkingTests', minWorkingTests, 'number' ]
        ]

        pairs
            .forEach( ( [ key, value, type ] ) => {
                if( value === undefined || value === null ) {
                    messages.push( `DPT-001: Required field missing: ${key}` )
                    return
                }
                if( type === 'string' && typeof value !== 'string' ) {
                    messages.push( `DPT-002: Type mismatch for field ${key}: expected string, got ${typeof value}` )
                    return
                }
                if( type === 'number' && ( typeof value !== 'number' || Number.isFinite( value ) === false ) ) {
                    messages.push( `DPT-002: Type mismatch for field ${key}: expected number, got ${typeof value}` )
                    return
                }
                if( type === 'object' && ( typeof value !== 'object' || Array.isArray( value ) ) ) {
                    messages.push( `DPT-002: Type mismatch for field ${key}: expected object, got ${Array.isArray( value ) ? 'array' : typeof value}` )
                }
            } )

        if( messages.length > 0 ) {
            return struct
        }

        struct.status = true
        return struct
    }
}


export { DataPretest, VERSION as DATA_PRETEST_VERSION, DEFAULT_MIN_WORKING_TESTS, TEST_LADDER }
