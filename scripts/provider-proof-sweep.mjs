/**
 * provider-proof-sweep.mjs — Memo 095 Phase 2 (PRD-005), the deterministic sweep.
 *
 * For every v4 provider folder in the schemas repo it runs the CHEAP path only:
 *   1. GradingImport.run  — structural import into the island (no LLM, no key).
 *      emit-on-failure means an unparseable/invalid provider still yields a
 *      `blocked` namespace index instead of aborting.
 *   2. read the island index.json (the object RebuildIndex produced).
 *   3. ProviderProof.write — project the committable `grade.json` into the schemas
 *      repo under `providers/<ns>/grade.json` (top-level, where provider-proof-sync.yml
 *      looks). Grade stays `pending` — LLM scoring is Phase 5, not here.
 *
 * The proof is the push-trigger: committing providers/<ns>/grade.json and pushing
 * fires provider-proof-sync.yml → one Grading-Issue + Board card per namespace. This
 * script performs NO GitHub writes and NO network beyond the structural import.
 *
 * Module reads NO .env. NO SILENT DEFAULTS. Static methods, object params/returns,
 * no for/while, async/await, English only.
 */

import { readdir, readFile, stat, rm } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

import { GradingImport } from '../src/GradingImport.mjs'
import { ProviderProof } from '../src/ProviderProof.mjs'


const HERE = dirname( fileURLToPath( import.meta.url ) )
const DEFAULT_SCHEMAS_ROOT = resolve( HERE, '../../flowmcp-schemas-private/schemas/v4.0.0/providers' )
const DEFAULT_PROOFS_OUT = resolve( HERE, '../../flowmcp-schemas-private/providers' )


// Memo 097 PA-6 (Kap. 4): the island root MUST resolve the SAME way the CLI does
// (FlowMcpCli.#gradingDataRoot) — no divergent hardcode. Precedence (all explicit,
// no silent default), mirroring the CLI exactly:
//   1. --grading-data flag                 (cwd-relative / absolute)
//   2. FLOWMCP_GRADING_DATA env var         (cwd-relative / absolute)
//   3. "gradingDataDir" in GLOBAL ~/.flowmcp/config.json (home-relative / absolute)
//   4. built-in default ~/.flowmcp/grading
// There is only ONE global config (no local repo config for grading paths).
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


class ProviderProofSweep {
    /**
     * run — sweep every (or a filtered subset of) provider folder, writing a
     * deterministic Provider-Proof per namespace.
     *
     * @param {Object} params
     * @param {string} params.schemasRoot — v4 providers root (folder-per-namespace)
     * @param {string} params.proofsOut — top-level providers/ output root in the schemas repo
     * @param {string} params.gradingDataRoot — island root (grading-data tree)
     * @param {string|null} params.only — single namespace folder to process (or null = all)
     * @param {number|null} params.limit — max namespaces to process (or null = all)
     * @returns {Promise<{ status, total, results, errors }>}
     */
    static async run( { schemasRoot, proofsOut, gradingDataRoot, only, limit } ) {
        const listed = await ProviderProofSweep.#listProviderDirs( { schemasRoot } )
        if( !listed.status ) { return { status: false, total: 0, results: [], errors: listed.errors } }

        const selected = listed.namespaces
            .filter( ( ns ) => only === null || ns === only )
            .slice( 0, limit === null ? listed.namespaces.length : limit )

        const results = []
        const errors = []

        await selected
            .reduce( async ( prev, ns ) => {
                await prev
                const one = await ProviderProofSweep.#sweepOne( { ns, schemasRoot, proofsOut, gradingDataRoot } )
                if( one.status ) {
                    results.push( { namespace: ns, status: one.proofStatus, blocked: one.blocked, proofPath: one.proofPath } )
                } else {
                    errors.push( { namespace: ns, errors: one.errors } )
                }
            }, Promise.resolve() )

        return { status: errors.length === 0, total: selected.length, results, errors }
    }


    static async #sweepOne( { ns, schemasRoot, proofsOut, gradingDataRoot } ) {
        const providerPath = join( schemasRoot, ns )

        const imp = await GradingImport.run( { providerPath, gradingDataRoot } )
        if( !imp.status || imp.indexPath === null ) {
            return { status: false, errors: imp.errors }
        }

        const indexRead = await ProviderProofSweep.#readJson( { path: imp.indexPath } )
        if( !indexRead.status ) { return { status: false, errors: indexRead.errors } }

        // The proof folder is keyed by the DECLARED namespace (matches the proof's
        // own `namespace` field + the island), not the source folder name.
        const providerDir = join( proofsOut, imp.namespace )
        const proof = await ProviderProof.write( { namespaceIndex: indexRead.json, providerDir } )
        if( !proof.status ) { return { status: false, errors: proof.errors } }

        return { status: true, proofStatus: proof.proof.status, blocked: imp.blocked === true, proofPath: proof.proofPath }
    }


    static async #listProviderDirs( { schemasRoot } ) {
        try {
            const entries = await readdir( schemasRoot, { withFileTypes: true } )
            const namespaces = entries
                .filter( ( e ) => e.isDirectory() === true )
                .map( ( e ) => e.name )
                .filter( ( name ) => name.startsWith( '_' ) === false )
                .sort( ( a, b ) => a.localeCompare( b ) )
            return { status: true, namespaces, errors: [] }
        } catch( error ) {
            return { status: false, namespaces: [], errors: [ `SWEEP-001: cannot list ${schemasRoot}: ${error.message}` ] }
        }
    }


    static async #readJson( { path } ) {
        try {
            const content = await readFile( path, 'utf-8' )
            return { status: true, json: JSON.parse( content ), errors: [] }
        } catch( error ) {
            return { status: false, json: null, errors: [ `SWEEP-002: cannot read ${path}: ${error.message}` ] }
        }
    }
}


// --- CLI ---

const parseArgs = ( { argv } ) => {
    const flag = ( name ) => {
        const hit = argv.find( ( a ) => a.startsWith( `--${name}=` ) )
        return hit !== undefined ? hit.slice( name.length + 3 ) : null
    }
    const limitRaw = flag( 'limit' )
    return {
        schemasRoot: flag( 'schemas-root' ) === null ? DEFAULT_SCHEMAS_ROOT : flag( 'schemas-root' ),
        proofsOut: flag( 'proofs-out' ) === null ? DEFAULT_PROOFS_OUT : flag( 'proofs-out' ),
        // PA-6: do NOT resolve a hardcoded default here. The raw flag value (or
        // null) flows into resolveGradingDataRoot, which mirrors the CLI precedence.
        gradingDataFlag: flag( 'grading-data' ),
        only: flag( 'only' ),
        limit: limitRaw === null ? null : Number.parseInt( limitRaw, 10 ),
        freshIsland: argv.includes( '--fresh-island' )
    }
}


const cli = async () => {
    const args = parseArgs( { argv: process.argv.slice( 2 ) } )

    if( args.limit !== null && Number.isNaN( args.limit ) ) {
        process.stdout.write( 'SWEEP-000: --limit must be an integer (no silent default).\n' )
        process.exit( 1 )
    }

    // PA-6: resolve the island via the exact CLI precedence (flag -> env ->
    // global config -> default), not a divergent hardcode.
    const gradingDataRoot = await resolveGradingDataRoot( { cwd: process.cwd(), flagValue: args.gradingDataFlag } )

    process.stdout.write( `=== Provider-Proof Sweep (Memo 095 P2) ===\n` )
    process.stdout.write( `schemas-root: ${args.schemasRoot}\n` )
    process.stdout.write( `proofs-out:   ${args.proofsOut}\n` )
    process.stdout.write( `grading-data: ${gradingDataRoot}\n` )
    process.stdout.write( `filter:       only=${args.only === null ? '(all)' : args.only} limit=${args.limit === null ? '(none)' : args.limit}\n\n` )

    if( args.freshIsland === true ) {
        await rm( gradingDataRoot, { recursive: true, force: true } )
        process.stdout.write( 'fresh-island: island wiped before sweep\n' )
    }

    const result = await ProviderProofSweep.run( {
        schemasRoot: args.schemasRoot,
        proofsOut: args.proofsOut,
        gradingDataRoot,
        only: args.only,
        limit: args.limit
    } )

    const byStatus = result.results
        .reduce( ( acc, r ) => { acc[ r.status ] = ( acc[ r.status ] === undefined ? 0 : acc[ r.status ] ) + 1; return acc }, {} )

    process.stdout.write( `\n=== SWEEP SUMMARY ===\n` )
    process.stdout.write( `processed: ${result.total}  proofs-written: ${result.results.length}  errors: ${result.errors.length}\n` )
    process.stdout.write( `by proof status: ${JSON.stringify( byStatus )}\n` )
    if( result.errors.length > 0 ) {
        process.stdout.write( `ERRORS (${result.errors.length}):\n` )
        result.errors.slice( 0, 50 ).forEach( ( e ) => process.stdout.write( `  - ${e.namespace}: ${e.errors.join( '; ' )}\n` ) )
    }
    process.stdout.write( result.status ? 'SWEEP OK (no errors).\n' : 'SWEEP completed WITH errors.\n' )
}


const isMain = process.argv[ 1 ] === fileURLToPath( import.meta.url )
if( isMain === true ) { cli() }

export { ProviderProofSweep }
