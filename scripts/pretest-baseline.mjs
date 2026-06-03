/**
 * pretest-baseline.mjs — deterministic reachability baseline (Stage 2/3).
 *
 * Reads the persisted DataPretest result (the deterministic Stage-1 emit writes it to
 * `<island>/providers/<ns>/prompts.json` → `.pretests[]`, each `{ schemaName, ok }`
 * where `ok` is the count of downloadable answers) and classifies each provider:
 *   - all schemas ok===0           -> blocked   (status blocked + api-down)
 *   - 0 < passing < total          -> partial   (status partial)
 *   - all schemas ok>0             -> reachable  (leave the proof pending — no rewrite)
 *   - no prompts / no pretests      -> unknown    (skip, leave pending)
 *
 * For blocked/partial it reads the island index.json, overrides the rollup status
 * (and, for blocked, the namespaceAggregate -> status blocked + reason api-down with
 * a free-text blocker carrying the detail), and re-projects the committed proof via
 * ProviderProof.write. Reachable/unknown providers are NOT rewritten — their existing
 * pending proof already says the truth.
 *
 * It writes ONLY providers/<ns>/grade.json (via ProviderProof). No GitHub writes here
 * (the changed list is handed to the sync). NO SILENT DEFAULTS. Static methods, object
 * params/returns, no for/while, async/await, English only.
 */

import { readdir, readFile } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

import { ProviderProof } from '../src/ProviderProof.mjs'


const HERE = dirname( fileURLToPath( import.meta.url ) )
const DEFAULT_PROOFS_OUT = resolve( HERE, '../../flowmcp-schemas-private/providers' )
const DEFAULT_GRADING_DATA = join( homedir(), '.flowmcp', 'grading' )
const PRETEST_BLOCKED_REASON = 'api-down'


class PretestBaseline {
    static async run( { proofsOut, gradingDataRoot, only, limit, dryRun } ) {
        const listed = await PretestBaseline.#listNamespaces( { proofsOut } )
        if( !listed.status ) { return { status: false, errors: listed.errors } }

        const selected = listed.namespaces
            .filter( ( ns ) => only === null || ns === only )
            .slice( 0, limit === null ? listed.namespaces.length : limit )

        const summary = { reachable: 0, partial: 0, blocked: 0, transient: 0, unknown: 0, written: 0 }
        const changed = []
        const errors = []

        await selected
            .reduce( async ( prev, ns ) => {
                await prev
                const one = await PretestBaseline.#classifyOne( { ns, proofsOut, gradingDataRoot, dryRun } )
                if( one.errors.length > 0 ) { errors.push( { namespace: ns, errors: one.errors } ) }
                summary[ one.klass ] += 1
                if( one.written === true ) { summary.written += 1; changed.push( { namespace: ns, klass: one.klass } ) }
            }, Promise.resolve() )

        return { status: errors.length === 0, summary, changed, errors }
    }


    static async #classifyOne( { ns, proofsOut, gradingDataRoot, dryRun } ) {
        const promptsPath = join( gradingDataRoot, 'providers', ns, 'prompts.json' )
        const promptsRead = await PretestBaseline.#readJson( { path: promptsPath } )
        if( !promptsRead.status || Array.isArray( promptsRead.json.pretests ) === false || promptsRead.json.pretests.length === 0 ) {
            return { klass: 'unknown', written: false, errors: [] }
        }

        const pretests = promptsRead.json.pretests
        const total = pretests.length
        // `ok` is the authoritative per-schema pass (enough downloadable tests). The
        // passedDownloadable count is NOT used for pass/fail (a tool can pass overall
        // yet sit below the per-tool floor).
        const passing = pretests.filter( ( p ) => p.ok === true ).length

        // Transient-failure guard (reachability tuning): a rate-limit / timeout / reset is
        // NOT a real block — it's noise from pacing. Only HARD failures (missing key,
        // handler bug, 4xx/5xx, no-response) get blocked; transient ones stay Pending
        // and go on the recheck list. NO SILENT mislabel of a healthy-but-throttled API.
        const allErrors = pretests
            .flatMap( ( p ) => Array.isArray( p.errors ) ? p.errors : [] )
            .join( ' | ' )
        const isTransient = /429|too many requests|etimedout|timeout|econnreset|esockettimedout/i.test( allErrors )

        const klass = passing === total
            ? 'reachable'
            : ( passing > 0 ? 'partial' : ( isTransient ? 'transient' : 'blocked' ) )

        // reachable + transient leave the proof untouched (Pending is already correct).
        if( klass === 'reachable' || klass === 'transient' ) { return { klass, written: false, errors: [] } }
        if( dryRun === true ) { return { klass, written: false, errors: [] } }

        const indexPath = join( gradingDataRoot, 'providers', ns, 'index.json' )
        const indexRead = await PretestBaseline.#readJson( { path: indexPath } )
        if( !indexRead.status ) { return { klass, written: false, errors: indexRead.errors } }

        const index = indexRead.json
        if( klass === 'blocked' ) {
            index.status = 'blocked'
            index.namespaceAggregate = { ...index.namespaceAggregate, status: 'blocked', reason: PRETEST_BLOCKED_REASON }
            index.blockers = ( Array.isArray( index.blockers ) ? index.blockers : [] )
                .concat( [ { node: 'pretest', reason: `${PRETEST_BLOCKED_REASON}: 0/${total} schemas downloadable` } ] )
        } else {
            index.status = 'partial'
            index.blockers = ( Array.isArray( index.blockers ) ? index.blockers : [] )
                .concat( [ { node: 'pretest', reason: `partial: ${passing}/${total} schemas downloadable` } ] )
        }

        const proof = await ProviderProof.write( { namespaceIndex: index, providerDir: join( proofsOut, ns ) } )
        if( !proof.status ) { return { klass, written: false, errors: proof.errors } }
        return { klass, written: true, errors: [] }
    }


    static async #listNamespaces( { proofsOut } ) {
        try {
            const entries = await readdir( proofsOut, { withFileTypes: true } )
            const namespaces = entries
                .filter( ( e ) => e.isDirectory() === true )
                .map( ( e ) => e.name )
                .sort( ( a, b ) => a.localeCompare( b ) )
            return { status: true, namespaces, errors: [] }
        } catch( error ) {
            return { status: false, namespaces: [], errors: [ `BASE-001: cannot list ${proofsOut}: ${error.message}` ] }
        }
    }


    static async #readJson( { path } ) {
        try {
            const content = await readFile( path, 'utf-8' )
            return { status: true, json: JSON.parse( content ), errors: [] }
        } catch( error ) {
            return { status: false, json: null, errors: [ `BASE-002: cannot read ${path}: ${error.message}` ] }
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
        proofsOut: flag( 'proofs-out' ) === null ? DEFAULT_PROOFS_OUT : flag( 'proofs-out' ),
        gradingDataRoot: flag( 'grading-data' ) === null ? DEFAULT_GRADING_DATA : flag( 'grading-data' ),
        only: flag( 'only' ),
        limit: limitRaw === null ? null : Number.parseInt( limitRaw, 10 ),
        dryRun: argv.includes( '--dry-run' )
    }
}


const cli = async () => {
    const args = parseArgs( { argv: process.argv.slice( 2 ) } )
    if( args.limit !== null && Number.isNaN( args.limit ) ) {
        process.stdout.write( 'BASE-000: --limit must be an integer (no silent default).\n' )
        process.exit( 1 )
    }

    process.stdout.write( `=== Pretest Baseline ${args.dryRun ? '[DRY-RUN]' : ''} ===\n` )
    const result = await PretestBaseline.run( args )

    process.stdout.write( `classified: ${JSON.stringify( result.summary )}\n` )
    if( result.changed.length > 0 ) {
        process.stdout.write( `changed proofs (${result.changed.length}) — feed these to the sync:\n` )
        result.changed.forEach( ( c ) => process.stdout.write( `  ${c.namespace} (${c.klass})\n` ) )
    }
    if( result.errors.length > 0 ) {
        process.stdout.write( `ERRORS (${result.errors.length}):\n` )
        result.errors.slice( 0, 40 ).forEach( ( e ) => process.stdout.write( `  - ${e.namespace}: ${e.errors.join( '; ' )}\n` ) )
    }
    process.stdout.write( result.status ? 'BASELINE OK.\n' : 'BASELINE completed WITH errors.\n' )
}


const isMain = process.argv[ 1 ] === fileURLToPath( import.meta.url )
if( isMain === true ) { cli() }

export { PretestBaseline }
