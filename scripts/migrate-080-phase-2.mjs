// Migration script — Source-of-Truth Layout Migration.
//
// Moves the three pilot gradings (brightsky, etherscan, abgeordnetenwatch) from
// the flat layout grading-data/gradings/<ns>--<tool>/<timestamp>.json into the
// new SoT layout grading-data/single/<ns>--<tool>/gradings/<schema-hash>--<timestamp>.json
// and snapshots the source schemas from flowmcp-schemas-private/ into
// grading-data/schemas/<namespace>/<schema-hash>--v<X.Y.Z>.mjs.
//
// Hash values are explicit MIGRATION-PLACEHOLDER strings (PLACEHOLDER001/002/003).
// A later phase (HashGenerator) replaces them with deterministic sha256 hashes.
//
// Properties:
// - idempotent (rerun produces SKIP logs without filesystem changes)
// - dry-run via --dry-run (no filesystem writes)
// - backup-first (originals copied to .migration-backup/pre-080-phase-2/ before move)
// - no for/while loops (sequential via reduce)


import { readFile, writeFile, mkdir, copyFile, readdir, stat, unlink, rmdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'


const __filename = fileURLToPath( import.meta.url )
const __dirname = dirname( __filename )
const REPO_ROOT = resolve( __dirname, '..' )
const WORKBENCH_FLOWMCP_ROOT = resolve( REPO_ROOT, '..', '..' )


const PILOTS = [
    {
        namespace: 'brightsky',
        tool: 'bright-sky',
        schemaId: 'brightsky.bright-sky',
        oldGradingDir: 'grading-data/gradings/brightsky--bright-sky',
        sourceSchemaRelative: 'repos/flowmcp-schemas-private/schemas/v4.0.0/providers/brightsky/bright-sky.mjs',
        placeholderHash: 'PLACEHOLDER001',
        schemaVersion: '1.0.0'
    },
    {
        namespace: 'etherscan',
        tool: 'getContractEthereum',
        schemaId: 'etherscan.getContractEthereum',
        oldGradingDir: 'grading-data/gradings/etherscan--getContractEthereum',
        sourceSchemaRelative: 'repos/flowmcp-schemas-private/schemas/v4.0.0/providers/etherscan/getContractEthereum.mjs',
        placeholderHash: 'PLACEHOLDER002',
        schemaVersion: '1.0.0'
    },
    {
        namespace: 'abgeordnetenwatch',
        tool: 'abgeordnetenwatch',
        schemaId: 'abgeordnetenwatch.abgeordnetenwatch',
        oldGradingDir: 'grading-data/gradings/abgeordnetenwatch--abgeordnetenwatch',
        sourceSchemaRelative: 'repos/flowmcp-schemas-private/schemas/v4.0.0/providers/abgeordnetenwatch/abgeordnetenwatch.mjs',
        placeholderHash: 'PLACEHOLDER003',
        schemaVersion: '1.0.0'
    }
]


const SKELETON_DIRS = [
    'grading-data/schemas',
    'grading-data/shared-lists',
    'grading-data/single',
    'grading-data/selection',
    'grading-data/phase-status/single',
    'grading-data/phase-status/selection',
    'grading-data/.migration-backup/pre-080-phase-2',
    'grading-data/.migration-backup/pre-080-phase-2-status'
]


const GITKEEP_DIRS = [
    'grading-data/shared-lists',
    'grading-data/selection',
    'grading-data/phase-status/selection'
]


const SNAPSHOT_HEADER = ( { namespace, tool, placeholderHash, schemaVersion, sourceRelative } ) => {
    const lines = [
        '// MIGRATION-PLACEHOLDER hash, replaced in a later phase via the HashGenerator.',
        '// Source-of-Truth schema snapshot.',
        '// Namespace:      ' + namespace,
        '// Tool:           ' + tool,
        '// Placeholder:    ' + placeholderHash,
        '// SchemaVersion:  ' + schemaVersion,
        '// SourcePath:     ' + sourceRelative,
        '// Snapshot is frozen — do NOT edit. Re-run scripts/migrate-080-phase-2.mjs for refresh.',
        ''
    ]
    return lines.join( '\n' )
}


const parseArgs = ( { argv } ) => {
    const dryRun = argv.includes( '--dry-run' )
    return { dryRun }
}


const fileExists = async ( { path } ) => {
    try {
        await stat( path )
        return true
    } catch {
        return false
    }
}


const ensureDir = async ( { absolutePath, dryRun, log } ) => {
    const exists = existsSync( absolutePath )
    if( exists === true ) {
        log.push( { action: 'SKIP_DIR', path: absolutePath } )
        return { created: false }
    }
    if( dryRun === false ) {
        await mkdir( absolutePath, { recursive: true } )
    }
    log.push( { action: 'CREATE_DIR', path: absolutePath } )
    return { created: true }
}


const writeGitkeep = async ( { absoluteDir, dryRun, log } ) => {
    const gitkeepPath = join( absoluteDir, '.gitkeep' )
    if( existsSync( gitkeepPath ) === true ) {
        log.push( { action: 'SKIP_GITKEEP', path: gitkeepPath } )
        return { created: false }
    }
    if( dryRun === false ) {
        await writeFile( gitkeepPath, '', 'utf-8' )
    }
    log.push( { action: 'CREATE_GITKEEP', path: gitkeepPath } )
    return { created: true }
}


const createSkeleton = async ( { dryRun, log } ) => {
    const dirResults = await SKELETON_DIRS.reduce( async ( accPromise, dir ) => {
        const acc = await accPromise
        const absolutePath = join( REPO_ROOT, dir )
        const result = await ensureDir( { absolutePath, dryRun, log } )
        return acc.concat( [ { dir, result } ] )
    }, Promise.resolve( [] ) )

    const keepResults = await GITKEEP_DIRS.reduce( async ( accPromise, dir ) => {
        const acc = await accPromise
        const absoluteDir = join( REPO_ROOT, dir )
        const result = await writeGitkeep( { absoluteDir, dryRun, log } )
        return acc.concat( [ { dir, result } ] )
    }, Promise.resolve( [] ) )

    return { dirResults, keepResults }
}


const findTimestampFile = async ( { dirPath } ) => {
    const exists = await fileExists( { path: dirPath } )
    if( exists === false ) {
        return { fileName: null }
    }
    const entries = await readdir( dirPath )
    const candidates = entries
        .filter( ( name ) => name.endsWith( '.json' ) )
        .filter( ( name ) => name !== '.DS_Store' )
    if( candidates.length === 0 ) {
        return { fileName: null }
    }
    const sorted = candidates.slice().sort()
    return { fileName: sorted[ 0 ] }
}


const backupFile = async ( { sourceAbsolute, destinationAbsolute, dryRun, log } ) => {
    const exists = existsSync( destinationAbsolute )
    if( exists === true ) {
        log.push( { action: 'SKIP_BACKUP', path: destinationAbsolute } )
        return { copied: false }
    }
    if( dryRun === false ) {
        await mkdir( dirname( destinationAbsolute ), { recursive: true } )
        await copyFile( sourceAbsolute, destinationAbsolute )
    }
    log.push( { action: 'BACKUP', from: sourceAbsolute, to: destinationAbsolute } )
    return { copied: true }
}


const snapshotSchema = async ( { pilot, dryRun, log } ) => {
    const { namespace, tool, placeholderHash, schemaVersion, sourceSchemaRelative } = pilot
    const sourceAbsolute = join( WORKBENCH_FLOWMCP_ROOT, sourceSchemaRelative )
    const destinationRelative = 'grading-data/schemas/' + namespace + '/' + placeholderHash + '--v' + schemaVersion + '.mjs'
    const destinationAbsolute = join( REPO_ROOT, destinationRelative )

    const sourceExists = await fileExists( { path: sourceAbsolute } )
    if( sourceExists === false ) {
        log.push( { action: 'ERROR_SOURCE_MISSING', namespace, path: sourceAbsolute } )
        return { snapshotted: false, reason: 'source-missing' }
    }

    const namespaceDir = join( REPO_ROOT, 'grading-data/schemas/' + namespace )
    if( dryRun === false ) {
        await mkdir( namespaceDir, { recursive: true } )
    }

    const sourceBody = await readFile( sourceAbsolute, 'utf-8' )
    const header = SNAPSHOT_HEADER( { namespace, tool, placeholderHash, schemaVersion, sourceRelative: sourceSchemaRelative } )
    const snapshotContent = header + sourceBody

    const destinationExists = existsSync( destinationAbsolute )
    if( destinationExists === true ) {
        const currentContent = await readFile( destinationAbsolute, 'utf-8' )
        if( currentContent === snapshotContent ) {
            log.push( { action: 'SKIP_SNAPSHOT', namespace, path: destinationAbsolute } )
            return { snapshotted: false, reason: 'identical' }
        }
        log.push( { action: 'WARN_SNAPSHOT_DIVERGENT', namespace, path: destinationAbsolute } )
        if( dryRun === false ) {
            await writeFile( destinationAbsolute, snapshotContent, 'utf-8' )
        }
        return { snapshotted: true, reason: 'updated' }
    }

    if( dryRun === false ) {
        await writeFile( destinationAbsolute, snapshotContent, 'utf-8' )
    }
    log.push( { action: 'CREATE_SNAPSHOT', namespace, path: destinationAbsolute } )
    return { snapshotted: true, reason: 'created' }
}


const migrateGrading = async ( { pilot, dryRun, log } ) => {
    const { namespace, tool, placeholderHash, oldGradingDir } = pilot
    const oldDirAbsolute = join( REPO_ROOT, oldGradingDir )

    const { fileName } = await findTimestampFile( { dirPath: oldDirAbsolute } )

    const newDirRelative = 'grading-data/single/' + namespace + '--' + tool + '/gradings'
    const newDirAbsolute = join( REPO_ROOT, newDirRelative )

    if( dryRun === false ) {
        await mkdir( newDirAbsolute, { recursive: true } )
    }

    if( fileName === null ) {
        log.push( { action: 'SKIP_MIGRATION_NO_SOURCE', namespace, tool, oldGradingDir } )
        return { migrated: false, reason: 'no-source' }
    }

    const timestamp = fileName.replace( /\.json$/, '' )
    const newFileName = placeholderHash + '--' + timestamp + '.json'
    const sourceAbsolute = join( oldDirAbsolute, fileName )
    const newAbsolute = join( newDirAbsolute, newFileName )

    // backup-first
    const backupAbsolute = join( REPO_ROOT, 'grading-data/.migration-backup/pre-080-phase-2', 'gradings--' + namespace + '--' + tool + '--' + fileName )
    await backupFile( { sourceAbsolute, destinationAbsolute: backupAbsolute, dryRun, log } )

    const newExists = existsSync( newAbsolute )
    if( newExists === true ) {
        const currentContent = await readFile( newAbsolute, 'utf-8' )
        const sourceContent = await readFile( sourceAbsolute, 'utf-8' )
        if( currentContent === sourceContent ) {
            log.push( { action: 'SKIP_GRADING', namespace, tool, path: newAbsolute } )
            return { migrated: false, reason: 'identical' }
        }
        log.push( { action: 'WARN_GRADING_DIVERGENT', namespace, tool, path: newAbsolute } )
        if( dryRun === false ) {
            await copyFile( sourceAbsolute, newAbsolute )
        }
        return { migrated: true, reason: 'updated' }
    }

    if( dryRun === false ) {
        await copyFile( sourceAbsolute, newAbsolute )
    }
    log.push( { action: 'CREATE_GRADING', namespace, tool, path: newAbsolute } )
    return { migrated: true, reason: 'created' }
}


const cleanupOldGradingDir = async ( { pilot, dryRun, log } ) => {
    const { namespace, tool, oldGradingDir } = pilot
    const oldDirAbsolute = join( REPO_ROOT, oldGradingDir )

    const dirExists = existsSync( oldDirAbsolute )
    if( dirExists === false ) {
        log.push( { action: 'SKIP_CLEANUP_NO_DIR', namespace, tool, path: oldGradingDir } )
        return { removed: false, reason: 'no-dir' }
    }

    const backupBase = join( REPO_ROOT, 'grading-data/.migration-backup/pre-080-phase-2' )
    const backupExists = existsSync( backupBase )
    if( backupExists === false ) {
        log.push( { action: 'WARN_CLEANUP_NO_BACKUP', namespace, tool, hint: 'backup directory missing, refusing to remove originals' } )
        return { removed: false, reason: 'no-backup' }
    }

    const entries = await readdir( oldDirAbsolute )
    const files = entries.filter( ( name ) => name !== '.DS_Store' )

    if( dryRun === false ) {
        await files.reduce( async ( accPromise, fileName ) => {
            await accPromise
            await unlink( join( oldDirAbsolute, fileName ) )
        }, Promise.resolve() )
        try {
            await rmdir( oldDirAbsolute )
        } catch ( err ) {
            log.push( { action: 'WARN_RMDIR_FAILED', namespace, tool, hint: err.code } )
            return { removed: false, reason: 'rmdir-failed' }
        }
    }
    log.push( { action: 'CLEANUP_OLD_DIR', namespace, tool, path: oldGradingDir } )
    return { removed: true, reason: 'cleaned' }
}


const cleanupOldGradingsRoot = async ( { dryRun, log } ) => {
    const oldRoot = join( REPO_ROOT, 'grading-data/gradings' )
    if( existsSync( oldRoot ) === false ) {
        return { removed: false, reason: 'no-dir' }
    }
    const entries = await readdir( oldRoot )
    const nonHidden = entries.filter( ( name ) => name !== '.DS_Store' )
    if( nonHidden.length > 0 ) {
        log.push( { action: 'SKIP_CLEANUP_ROOT', hint: 'not empty', remaining: nonHidden.length } )
        return { removed: false, reason: 'not-empty' }
    }
    if( dryRun === false ) {
        await entries.reduce( async ( accPromise, fileName ) => {
            await accPromise
            await unlink( join( oldRoot, fileName ) )
        }, Promise.resolve() )
        await rmdir( oldRoot )
    }
    log.push( { action: 'CLEANUP_OLD_ROOT', path: 'grading-data/gradings' } )
    return { removed: true }
}


const processPilot = async ( { pilot, dryRun, log } ) => {
    const snapshotResult = await snapshotSchema( { pilot, dryRun, log } )
    const gradingResult = await migrateGrading( { pilot, dryRun, log } )
    const cleanupResult = await cleanupOldGradingDir( { pilot, dryRun, log } )
    return { pilot: pilot.schemaId, snapshotResult, gradingResult, cleanupResult }
}


const summarize = ( { log } ) => {
    const counts = log.reduce( ( acc, entry ) => {
        const next = Object.assign( {}, acc )
        next[ entry.action ] = ( next[ entry.action ] === undefined ? 0 : next[ entry.action ] ) + 1
        return next
    }, {} )
    return { counts, total: log.length }
}


const run = async ( { argv } ) => {
    const { dryRun } = parseArgs( { argv } )
    const log = []

    console.log( '[migrate-080-phase-2] mode=' + ( dryRun === true ? 'DRY-RUN' : 'APPLY' ) )
    console.log( '[migrate-080-phase-2] repo-root=' + REPO_ROOT )
    console.log( '[migrate-080-phase-2] workbench-flowmcp-root=' + WORKBENCH_FLOWMCP_ROOT )

    await createSkeleton( { dryRun, log } )

    const pilotResults = await PILOTS.reduce( async ( accPromise, pilot ) => {
        const acc = await accPromise
        const result = await processPilot( { pilot, dryRun, log } )
        return acc.concat( [ result ] )
    }, Promise.resolve( [] ) )

    await cleanupOldGradingsRoot( { dryRun, log } )

    log.forEach( ( entry ) => {
        const parts = [ '[' + entry.action + ']' ]
        if( entry.namespace !== undefined ) { parts.push( 'ns=' + entry.namespace ) }
        if( entry.tool !== undefined ) { parts.push( 'tool=' + entry.tool ) }
        if( entry.path !== undefined ) { parts.push( entry.path.replace( REPO_ROOT + '/', '' ) ) }
        if( entry.from !== undefined ) { parts.push( 'from=' + entry.from.replace( REPO_ROOT + '/', '' ) ) }
        if( entry.to !== undefined ) { parts.push( 'to=' + entry.to.replace( REPO_ROOT + '/', '' ) ) }
        console.log( parts.join( ' ' ) )
    } )

    const summary = summarize( { log } )
    console.log( '' )
    console.log( '[migrate-080-phase-2] summary:' )
    console.log( JSON.stringify( summary, null, 4 ) )

    return { pilotResults, summary, log }
}


const main = async () => {
    const result = await run( { argv: process.argv.slice( 2 ) } )
    return result
}


main()
    .then( ( { summary } ) => {
        const failureCount = Object.entries( summary.counts )
            .filter( ( [ action ] ) => action.startsWith( 'ERROR' ) )
            .reduce( ( acc, [ , count ] ) => acc + count, 0 )
        process.exit( failureCount > 0 ? 1 : 0 )
    } )
    .catch( ( err ) => {
        console.error( '[migrate-080-phase-2] FATAL', err )
        process.exit( 2 )
    } )


export { run, PILOTS, SKELETON_DIRS, GITKEEP_DIRS }
