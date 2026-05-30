#!/usr/bin/env node
/**
 * migrate-080-phase-5-shared-lists.mjs
 *
 * Migrate shared-lists from flowmcp-schemas-private
 * into grading-data/shared-lists/<listname>/<hash>--v<X.Y.Z>.json.
 *
 * Sources (Phase 5 initial batch):
 *   - schemas/v4.0.0/_lists/evm-chains.mjs           -> shared-lists/evmChains/
 *   - schemas/v4.0.0/_lists/trading-exchanges.mjs    -> shared-lists/tradingExchanges/
 *
 * NOTE — the PRD originally mentioned `solanaTokens` as second candidate.
 * No shared-list file `solanaTokens.mjs` exists in flowmcp-schemas-private
 * at this time, so the second migration target is `tradingExchanges`
 * (also a stable v4 list). The migration script is idempotent — re-running
 * with additional source pointers is safe.
 *
 * NO SILENT DEFAULTS. CLI flags must be passed explicitly when overriding.
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

import { HashGenerator } from '../src/HashGenerator.mjs'


const __filename = fileURLToPath( import.meta.url )
const __dirname = dirname( __filename )
const REPO_ROOT = resolve( __dirname, '..' )
const SCHEMAS_PRIVATE_ROOT = resolve( REPO_ROOT, '..', 'flowmcp-schemas-private' )


const MIGRATION_TARGETS = [
    {
        listname: 'evmChains',
        sourcePath: 'schemas/v4.0.0/_lists/evm-chains.mjs',
        sourceExport: 'list',
        initialVersion: '1.0.0'
    },
    {
        listname: 'tradingExchanges',
        sourcePath: 'schemas/v4.0.0/_lists/trading-exchanges.mjs',
        sourceExport: 'list',
        initialVersion: '1.0.0'
    }
]


async function migrateOne( { target, gradingDataRoot, dryRun } ) {
    const sourceAbs = resolve( SCHEMAS_PRIVATE_ROOT, target.sourcePath )
    if( !existsSync( sourceAbs ) ) {
        return { listname: target.listname, status: 'missing-source', sourcePath: sourceAbs }
    }

    const mod = await import( pathToFileURL( sourceAbs ).href )
    const list = mod[ target.sourceExport ]
    if( list === undefined || list === null ) {
        return { listname: target.listname, status: 'missing-export', export: target.sourceExport }
    }

    const { hash, errors } = HashGenerator.computeHash( { value: list } )
    if( errors.length > 0 ) {
        return { listname: target.listname, status: 'hash-failed', errors }
    }

    const outDir = join( gradingDataRoot, 'shared-lists', target.listname )
    const outFilename = `${hash}--v${target.initialVersion}.json`
    const outPath = join( outDir, outFilename )
    const readmePath = join( outDir, 'README.md' )

    const json = JSON.stringify( list, null, 2 )
    const readmeContent = [
        `# Shared-List \`${target.listname}\``,
        '',
        '| Field | Value |',
        '|-------|-------|',
        `| Source | \`${target.sourcePath}\` (flowmcp-schemas-private) |`,
        `| Export | \`${target.sourceExport}\` |`,
        `| Migrated at | ${new Date().toISOString().replace( /:/g, '-' ).slice( 0, 16 )}Z |`,
        `| Initial version | \`${target.initialVersion}\` |`,
        `| Hash | \`${hash}\` |`,
        '',
        'Source-of-truth lives in `flowmcp-schemas-private`. This snapshot is the',
        'frozen reference used by Grading-Pipelines and is hashed via',
        '`HashGenerator.computeHash` (sha256, 8-hex prefix).',
        '',
        'Bump rule: any entry change = Patch bump.',
        ''
    ]
        .join( '\n' )

    if( dryRun === true ) {
        return {
            listname: target.listname,
            status: 'dry-run',
            hash,
            outPath,
            sourcePath: sourceAbs,
            bytes: Buffer.byteLength( json )
        }
    }

    await mkdir( outDir, { recursive: true } )

    if( existsSync( outPath ) ) {
        const existing = await readFile( outPath, 'utf-8' )
        if( existing === json ) {
            return { listname: target.listname, status: 'unchanged', hash, outPath }
        }
        return { listname: target.listname, status: 'conflict', hash, outPath }
    }

    await writeFile( outPath, json, 'utf-8' )
    await writeFile( readmePath, readmeContent, 'utf-8' )
    return { listname: target.listname, status: 'created', hash, outPath, readmePath }
}


async function main() {
    const args = process.argv.slice( 2 )
    const dryRun = args.includes( '--dry-run' )
    const gradingDataRoot = resolve( REPO_ROOT, 'grading-data' )

    console.log( '== migrate-080-phase-5-shared-lists ==' )
    console.log( `repo root         : ${REPO_ROOT}` )
    console.log( `private schemas   : ${SCHEMAS_PRIVATE_ROOT}` )
    console.log( `grading-data root : ${gradingDataRoot}` )
    console.log( `dry-run           : ${dryRun}` )
    console.log( '' )

    const results = []
    let i = 0
    while( i < MIGRATION_TARGETS.length ) {
        const target = MIGRATION_TARGETS[ i ]
        const result = await migrateOne( { target, gradingDataRoot, dryRun } )
        results.push( result )
        console.log( `- ${target.listname}: ${result.status} hash=${result.hash || '?'} path=${result.outPath || '?'}` )
        i = i + 1
    }

    const failed = results.filter( ( r ) => r.status === 'conflict' || r.status === 'hash-failed' || r.status === 'missing-source' || r.status === 'missing-export' )
    if( failed.length > 0 ) {
        console.error( 'FAIL — migration issues:' )
        console.error( JSON.stringify( failed, null, 2 ) )
        process.exit( 1 )
    }

    console.log( '' )
    console.log( 'OK — Phase 5 shared-lists migrated.' )
}


main()
    .catch( ( error ) => {
        console.error( 'FATAL', error )
        process.exit( 1 )
    } )
