#!/usr/bin/env node
/**
 * backfill-na-reasons.mjs
 *
 * Memo 080 Phase 5 PRD-20 — backfill `naReason` on existing pilot gradings.
 *
 * The three pilot gradings (Memo 076 PRD-25 stubs) carry `score: "n/a"` but
 * predate the closed-set `naReason` convention introduced in `gradingSpec/1.1.0`
 * §5.3. This script adds `naReason: "blocked-by-precondition"` to each `n/a`
 * dimension entry that lacks a `naReason` — pilots were blocked by Phase 7 scope
 * (no live LLM/ToS execution), which maps directly to that closed-set value.
 *
 * Idempotent: existing closed-set `naReason` values are preserved; free-text
 * `naReason` values are reported (but not changed) so the grader can audit them.
 *
 * NO SILENT DEFAULTS — script touches only `n/a` entries and only fills missing
 * `naReason`. Use --dry-run to inspect changes before writing.
 */

import { readFile, readdir, writeFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ALLOWED_NA_REASONS } from '../src/NaReason.mjs'


const __filename = fileURLToPath( import.meta.url )
const __dirname = dirname( __filename )
const REPO_ROOT = resolve( __dirname, '..' )
const SINGLE_ROOT = resolve( REPO_ROOT, 'grading-data', 'single' )

const DEFAULT_BACKFILL_REASON = 'blocked-by-precondition'


async function listGradingFiles() {
    if( !existsSync( SINGLE_ROOT ) ) { return [] }

    const namespaces = await readdir( SINGLE_ROOT )
    const collected = []
    let i = 0
    while( i < namespaces.length ) {
        const ns = namespaces[ i ]
        const gdir = join( SINGLE_ROOT, ns, 'gradings' )
        if( existsSync( gdir ) ) {
            const files = await readdir( gdir )
            files
                .filter( ( f ) => f.endsWith( '.json' ) )
                .forEach( ( f ) => collected.push( { ns, file: join( gdir, f ) } ) )
        }
        i = i + 1
    }
    return collected
}


function transformEntry( { entry } ) {
    const isNa = entry.grade === 'n/a' || entry.score === 'n/a'
    if( !isNa ) {
        return { entry, mutated: false, reason: 'not-na' }
    }
    if( typeof entry.naReason === 'string' && ALLOWED_NA_REASONS.includes( entry.naReason ) ) {
        return { entry, mutated: false, reason: 'already-closed-set' }
    }
    if( typeof entry.naReason === 'string' && !ALLOWED_NA_REASONS.includes( entry.naReason ) ) {
        return { entry, mutated: false, reason: 'free-text-detected-MANUAL-REVIEW' }
    }

    return {
        entry: { ...entry, naReason: DEFAULT_BACKFILL_REASON },
        mutated: true,
        reason: 'backfilled'
    }
}


async function processFile( { ns, file, dryRun } ) {
    const raw = await readFile( file, 'utf-8' )
    const json = JSON.parse( raw )
    if( !Array.isArray( json.gradings ) ) {
        return { file, ns, status: 'skipped-no-gradings' }
    }

    const transformed = json.gradings
        .map( ( entry ) => transformEntry( { entry } ) )

    const newGradings = transformed
        .map( ( t ) => t.entry )

    const counts = transformed
        .reduce( ( acc, t ) => {
            acc[ t.reason ] = ( acc[ t.reason ] || 0 ) + 1
            return acc
        }, {} )

    const mutatedCount = transformed.filter( ( t ) => t.mutated === true ).length
    if( mutatedCount === 0 ) {
        return { file, ns, status: 'unchanged', counts }
    }

    if( dryRun === true ) {
        return { file, ns, status: 'dry-run', counts, mutatedCount }
    }

    json.gradings = newGradings
    await writeFile( file, JSON.stringify( json, null, 4 ) + '\n', 'utf-8' )
    return { file, ns, status: 'written', counts, mutatedCount }
}


async function main() {
    const args = process.argv.slice( 2 )
    const dryRun = args.includes( '--dry-run' )

    console.log( '== backfill-na-reasons ==' )
    console.log( `single root : ${SINGLE_ROOT}` )
    console.log( `dry-run     : ${dryRun}` )
    console.log( `default naReason : ${DEFAULT_BACKFILL_REASON}` )
    console.log( '' )

    const files = await listGradingFiles()
    if( files.length === 0 ) {
        console.log( 'no grading files found.' )
        return
    }

    const results = []
    let i = 0
    while( i < files.length ) {
        const result = await processFile( {
            ns: files[ i ].ns,
            file: files[ i ].file,
            dryRun
        } )
        results.push( result )
        console.log( `- ${result.ns}/${result.file.split( '/' ).pop()}: ${result.status} ${JSON.stringify( result.counts || {} )}` )
        i = i + 1
    }

    const hasManual = results.some( ( r ) => r.counts && r.counts[ 'free-text-detected-MANUAL-REVIEW' ] > 0 )
    if( hasManual ) {
        console.warn( '' )
        console.warn( 'WARNING — free-text naReason values were detected. Manual review required.' )
    }

    console.log( '' )
    console.log( 'OK — backfill complete.' )
}


main()
    .catch( ( error ) => {
        console.error( 'FATAL', error )
        process.exit( 1 )
    } )
