/**
 * improve-orchestrate.mjs — PA-4, the deterministic improvement-orchestration
 * planner.
 *
 * This script builds a per-namespace WORK MANIFEST that an AI harness consumes
 * to fan out improvement work. It does NOT itself spawn LLM sub-agents — a Node
 * script cannot. Its only job is deterministic: for an EXPLICIT list of
 * namespaces it collects the error/improvement worklist (via the CLI only),
 * derives a SAFE per-namespace write path, and writes a manifest the harness
 * then reads to drive `grading run <ns> --emit-prompts` and the per-area loop.
 *
 * Inputs are explicit. There is NO silent board default: the board is the
 * human's selection. If no namespaces are passed, the script exits with a coded
 * error explaining usage — it never invents a namespace list.
 *
 * Worklist collection invokes the CLI ONLY (`flowmcp grading worklist <ns>
 * --json`, PA-3). The CLI call is injectable so the planner is testable without
 * a live island. Errors are COLLECTED into the results array, never swallowed.
 *
 * Output paths are guarded the same way FleetRunner guards its outputBase
 * (FLEET-005): a base that resolves into src/, prompts/, skills/, spec/, tests/,
 * scripts/ or docs/ is REJECTED. The default safe base is the island
 * gradingDataDir, resolved via the same precedence the CLI uses — never a
 * hardcode. An explicit --out=<dir> overrides it (still guarded).
 *
 * Module reads NO .env. NO SILENT DEFAULTS. Static methods, object params/returns,
 * no for/while (array methods + Promise batching), async/await, English only.
 */

import { execFile } from 'node:child_process'
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { join, resolve, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'


const HERE = dirname( fileURLToPath( import.meta.url ) )

const MANIFEST_FILENAME = 'improve-manifest.json'
const MAX_PARALLELISM = 8
const FORBIDDEN_SEGMENTS = [ 'src', 'prompts', 'skills', 'spec', 'tests', 'scripts', 'docs' ]


// Resolve the island root the SAME way the CLI does (flag -> env -> global
// config -> built-in default). No divergent hardcode. Precedence is explicit;
// every branch is checked, no silent default.
const resolveGradingDataRoot = async ( { cwd, flagValue } ) => {
    if( typeof flagValue === 'string' && flagValue.length > 0 ) {
        return resolve( cwd, flagValue )
    }
    const envDir = process.env[ 'FLOWMCP_GRADING_DATA' ]
    if( typeof envDir === 'string' && envDir.length > 0 ) {
        return resolve( cwd, envDir )
    }
    const globalConfigDir = join( homedir(), '.flowmcp' )
    try {
        const raw = await readFile( join( globalConfigDir, 'config.json' ), 'utf-8' )
        const globalConfig = JSON.parse( raw )
        if( globalConfig !== null && typeof globalConfig[ 'gradingDataDir' ] === 'string' && globalConfig[ 'gradingDataDir' ].length > 0 ) {
            return resolve( globalConfigDir, globalConfig[ 'gradingDataDir' ] )
        }
    } catch {
        // No global config / unreadable -> fall through to the documented default.
    }

    return join( globalConfigDir, 'grading' )
}


// Default CLI invoker: spawns the flowmcp CLI binary and parses the JSON output
// of `grading worklist <ns> --json`. The CLI prints either a flat array (the
// worklist) or an error object { error, fix }. Both are returned; the caller
// classifies. stderr is captured, never discarded.
const defaultCliInvoker = async ( { namespace, cliBin, gradingDataDir } ) => {
    const args = [ cliBin, 'grading', 'worklist', namespace, '--json' ]
    if( typeof gradingDataDir === 'string' && gradingDataDir.length > 0 ) {
        args.push( `--grading-data=${gradingDataDir}` )
    }

    return new Promise( ( resolvePromise ) => {
        execFile( process.execPath, args, { maxBuffer: 16 * 1024 * 1024 }, ( error, stdout, stderr ) => {
            if( error !== null && ( typeof stdout !== 'string' || stdout.length === 0 ) ) {
                resolvePromise( { status: false, json: null, stderr: typeof stderr === 'string' ? stderr : String( error ) } )
                return
            }
            let json = null
            try {
                json = JSON.parse( stdout )
            } catch( parseError ) {
                resolvePromise( { status: false, json: null, stderr: `ORC-021: CLI output is not valid JSON: ${parseError.message}` } )
                return
            }
            resolvePromise( { status: true, json, stderr: typeof stderr === 'string' ? stderr : '' } )
        } )
    } )
}


class ImproveOrchestrate {
    /**
     * plan — build the per-namespace work manifest (the planning phase).
     *
     * For each namespace it calls the injectable CLI invoker to fetch the
     * worklist, derives the safe write path, and assembles a plan entry. NO
     * write happens here — plan() is pure orchestration. Errors are collected
     * per namespace, never thrown.
     *
     * @param {Object} params
     * @param {string[]} params.namespaces — EXPLICIT namespace list (no board default)
     * @param {string} params.outBase — resolved+guarded safe output base
     * @param {string} params.gradingDataDir — island root (for the CLI invoker)
     * @param {string} params.cliBin — path to the flowmcp CLI entry point
     * @param {Function} params.cliInvoker — async ({ namespace, cliBin, gradingDataDir }) => { status, json, stderr }
     * @returns {Promise<{ status, entries, errors }>}
     */
    static async plan( { namespaces, outBase, gradingDataDir, cliBin, cliInvoker } ) {
        const validation = ImproveOrchestrate.#validatePlan( { namespaces, outBase, cliBin, cliInvoker } )
        if( !validation.status ) { return { status: false, entries: [], errors: validation.messages } }

        const guard = ImproveOrchestrate.#assertSafeBase( { outBase } )
        if( !guard.status ) { return { status: false, entries: [], errors: guard.messages } }

        const batched = ImproveOrchestrate.#chunk( { items: namespaces, size: MAX_PARALLELISM } )

        const collected = await batched
            .reduce( async ( prevPromise, batch ) => {
                const acc = await prevPromise
                const settled = await Promise.all(
                    batch.map( ( namespace ) => ImproveOrchestrate.#planOne( { namespace, outBase, gradingDataDir, cliBin, cliInvoker } ) )
                )
                return acc.concat( settled )
            }, Promise.resolve( [] ) )

        const entries = collected
            .filter( ( one ) => one.status === true )
            .map( ( one ) => one.entry )
        const errors = collected
            .filter( ( one ) => one.status === false )
            .map( ( one ) => ( { namespace: one.namespace, errors: one.errors } ) )

        return { status: errors.length === 0, entries, errors }
    }


    /**
     * run — plan, then write each namespace manifest atomically.
     *
     * @param {Object} params — same as plan, plus dryRun
     * @param {boolean} params.dryRun — when true, NOTHING is written
     * @returns {Promise<{ status, entries, errors, written }>}
     */
    static async run( { namespaces, outBase, gradingDataDir, cliBin, cliInvoker, dryRun } ) {
        const planned = await ImproveOrchestrate.plan( { namespaces, outBase, gradingDataDir, cliBin, cliInvoker } )
        if( !planned.status ) { return { status: false, entries: planned.entries, errors: planned.errors, written: [] } }

        if( dryRun === true ) {
            return { status: true, entries: planned.entries, errors: [], written: [] }
        }

        const written = []
        const writeErrors = []
        await planned.entries
            .reduce( async ( prevPromise, entry ) => {
                await prevPromise
                const writeResult = await ImproveOrchestrate.#writeManifest( { entry } )
                if( writeResult.status ) {
                    written.push( entry.manifestPath )
                } else {
                    writeErrors.push( { namespace: entry.namespace, errors: writeResult.messages } )
                }
            }, Promise.resolve() )

        return { status: writeErrors.length === 0, entries: planned.entries, errors: writeErrors, written }
    }


    // ---- internal -----------------------------------------------------------

    static async #planOne( { namespace, outBase, gradingDataDir, cliBin, cliInvoker } ) {
        const pathResult = ImproveOrchestrate.#deriveManifestPath( { outBase, namespace } )
        if( !pathResult.status ) { return { status: false, namespace, errors: pathResult.messages } }

        const called = await cliInvoker( { namespace, cliBin, gradingDataDir } )
        if( called.status !== true ) {
            return { status: false, namespace, errors: [ `ORC-020: CLI worklist failed for "${namespace}": ${called.stderr}` ] }
        }

        // The CLI prints either a flat array (the worklist) or an error object
        // { error, fix }. An error object is COLLECTED, never swallowed.
        if( Array.isArray( called.json ) === false ) {
            const reason = called.json !== null && typeof called.json === 'object' && typeof called.json.error === 'string'
                ? called.json.error
                : 'unexpected non-array worklist payload'
            return { status: false, namespace, errors: [ `ORC-022: worklist for "${namespace}": ${reason}` ] }
        }

        const entry = {
            namespace,
            worklistCount: called.json.length,
            worklist: called.json,
            manifestPath: pathResult.path,
            generatorPrompt: `grading run ${namespace} --emit-prompts`,
            generatedAt: new Date().toISOString()
        }

        return { status: true, namespace, entry }
    }


    static #deriveManifestPath( { outBase, namespace } ) {
        if( typeof namespace !== 'string' || namespace.length === 0 ) {
            return { status: false, path: null, messages: [ 'ORC-010: namespace must be a non-empty string' ] }
        }
        // Reject path-traversal in the namespace token — the manifest folder must
        // stay strictly under outBase.
        const unsafe = namespace.includes( '/' ) === true || namespace.includes( '\\' ) === true || namespace.includes( '..' ) === true
        if( unsafe === true ) {
            return { status: false, path: null, messages: [ `ORC-011: unsafe namespace token "${namespace}"` ] }
        }

        const folder = join( resolve( outBase ), 'improve', namespace )
        const path = join( folder, MANIFEST_FILENAME )

        return { status: true, path, messages: [] }
    }


    // Mirror of FleetRunner FLEET-005: refuse any base that resolves INTO a
    // protected source-tree segment. The default base is the island root, but an
    // explicit --out must be checked too.
    static #assertSafeBase( { outBase } ) {
        const resolvedBase = resolve( outBase )
        const baseSegmentCheck = `${resolvedBase}${sep}`
        const hit = FORBIDDEN_SEGMENTS
            .map( ( name ) => `${sep}${name}${sep}` )
            .find( ( segment ) => baseSegmentCheck.includes( segment ) )
        if( hit !== undefined ) {
            return { status: false, messages: [ `ORC-005: out base resolves into a protected tree '${hit.trim()}'; refusing to write` ] }
        }

        return { status: true, messages: [] }
    }


    static #chunk( { items, size } ) {
        const indices = Array.from( { length: Math.ceil( items.length / size ) }, ( unused, i ) => i )
        return indices
            .map( ( i ) => items.slice( i * size, i * size + size ) )
    }


    static async #writeManifest( { entry } ) {
        try {
            await mkdir( dirname( entry.manifestPath ), { recursive: true } )
            const tmpPath = `${entry.manifestPath}.tmp-${process.pid}`
            await writeFile( tmpPath, JSON.stringify( entry, null, 4 ), 'utf-8' )
            await rename( tmpPath, entry.manifestPath )
            return { status: true, messages: [] }
        } catch( error ) {
            return { status: false, messages: [ `ORC-030: manifest write failed for "${entry.namespace}": ${error.message}` ] }
        }
    }


    static #validatePlan( { namespaces, outBase, cliBin, cliInvoker } ) {
        const messages = []

        if( Array.isArray( namespaces ) === false ) {
            messages.push( 'ORC-001: Required field missing: namespaces (explicit list — no board default)' )
        } else if( namespaces.length === 0 ) {
            messages.push( 'ORC-001: No namespaces given. Usage: improve-orchestrate.mjs --ns=birdeye,etherscan [--out=<dir>] [--dry-run]' )
        }

        if( typeof outBase !== 'string' || outBase.length === 0 ) {
            messages.push( 'ORC-002: Required field missing: outBase' )
        }
        if( typeof cliBin !== 'string' || cliBin.length === 0 ) {
            messages.push( 'ORC-003: Required field missing: cliBin' )
        }
        if( typeof cliInvoker !== 'function' ) {
            messages.push( 'ORC-004: Required field missing: cliInvoker (function)' )
        }

        return { status: messages.length === 0, messages }
    }
}


// --- CLI ---

const parseArgs = ( { argv } ) => {
    const flag = ( name ) => {
        const hit = argv.find( ( a ) => a.startsWith( `--${name}=` ) )
        return hit !== undefined ? hit.slice( name.length + 3 ) : null
    }
    const nsRaw = flag( 'ns' )
    const namespaces = nsRaw === null
        ? []
        : nsRaw.split( ',' ).map( ( token ) => token.trim() ).filter( ( token ) => token.length > 0 )

    return {
        namespaces,
        out: flag( 'out' ),
        gradingDataFlag: flag( 'grading-data' ),
        cliBin: flag( 'cli-bin' ),
        dryRun: argv.includes( '--dry-run' )
    }
}


// Resolve the CLI entry point: explicit --cli-bin wins, else the sibling
// flowmcp-cli checkout. No silent default that could point nowhere — if neither
// is usable the CLI call surfaces the error per namespace.
const resolveCliBin = ( { flagValue } ) => {
    if( typeof flagValue === 'string' && flagValue.length > 0 ) {
        return resolve( process.cwd(), flagValue )
    }
    return resolve( HERE, '../../flowmcp-cli/src/index.mjs' )
}


const cli = async () => {
    const args = parseArgs( { argv: process.argv.slice( 2 ) } )

    const gradingDataDir = await resolveGradingDataRoot( { cwd: process.cwd(), flagValue: args.gradingDataFlag } )
    const outBase = typeof args.out === 'string' && args.out.length > 0
        ? resolve( process.cwd(), args.out )
        : gradingDataDir
    const cliBin = resolveCliBin( { flagValue: args.cliBin } )

    process.stdout.write( '=== Improvement Orchestration (PA-4) ===\n' )
    process.stdout.write( `namespaces:   ${args.namespaces.length === 0 ? '(none)' : args.namespaces.join( ', ' )}\n` )
    process.stdout.write( `out-base:     ${outBase}\n` )
    process.stdout.write( `grading-data: ${gradingDataDir}\n` )
    process.stdout.write( `cli-bin:      ${cliBin}\n` )
    process.stdout.write( `mode:         ${args.dryRun === true ? 'dry-run (no writes)' : 'write'}\n\n` )

    const result = await ImproveOrchestrate.run( {
        namespaces: args.namespaces,
        outBase,
        gradingDataDir,
        cliBin,
        cliInvoker: defaultCliInvoker,
        dryRun: args.dryRun
    } )

    if( !result.status && result.entries.length === 0 ) {
        process.stdout.write( 'ORC: planning failed.\n' )
        result.errors.forEach( ( e ) => {
            const line = typeof e === 'string' ? e : `${e.namespace}: ${e.errors.join( '; ' )}`
            process.stdout.write( `  - ${line}\n` )
        } )
        process.exit( 1 )
    }

    process.stdout.write( '=== PLAN ===\n' )
    result.entries.forEach( ( entry ) => {
        process.stdout.write( `  ${entry.namespace}: worklist=${entry.worklistCount} -> ${entry.manifestPath}\n` )
        process.stdout.write( `      generator: ${entry.generatorPrompt}\n` )
    } )

    if( args.dryRun === true ) {
        process.stdout.write( '\ndry-run: no manifest written. The plan above is what the harness would consume.\n' )
    } else {
        process.stdout.write( `\nwritten: ${result.written.length} manifest(s).\n` )
    }

    if( result.errors.length > 0 ) {
        process.stdout.write( `\nERRORS (${result.errors.length}):\n` )
        result.errors.forEach( ( e ) => {
            const line = typeof e === 'string' ? e : `${e.namespace}: ${e.errors.join( '; ' )}`
            process.stdout.write( `  - ${line}\n` )
        } )
    }

    process.exit( result.status ? 0 : 1 )
}


const isMain = process.argv[ 1 ] === fileURLToPath( import.meta.url )
if( isMain === true ) { cli() }


export {
    ImproveOrchestrate,
    resolveGradingDataRoot,
    MANIFEST_FILENAME as IMPROVE_MANIFEST_FILENAME,
    MAX_PARALLELISM as IMPROVE_MAX_PARALLELISM
}
