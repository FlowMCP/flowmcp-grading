// Phase-Status separation script for Memo 080 Phase 2 (PRD-08).
//
// Migrates the legacy grading-data/phase-status/<ns>--<tool>.json files into
// grading-data/phase-status/single/<ns>--<tool>.json with the new schema:
//
//   { schemaId, gradingStatus, lastGradingHash, lastGradingMode, lastGradedAt, phases[] }
//
// Creates initial phase-status files for the pilot namespaces that don't yet have one
// (etherscan, abgeordnetenwatch). Existing phase[] entries are preserved when migrating
// the brightsky file. Originals are backed up to
// grading-data/.migration-backup/pre-080-phase-2-status/ before being moved.
//
// Properties:
// - idempotent (rerun produces SKIP logs)
// - dry-run via --dry-run
// - no for/while loops


import { readFile, writeFile, mkdir, copyFile, unlink, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'


const __filename = fileURLToPath( import.meta.url )
const __dirname = dirname( __filename )
const REPO_ROOT = resolve( __dirname, '..' )


const PILOTS = [
    { namespace: 'brightsky', tool: 'bright-sky', schemaId: 'brightsky.bright-sky' },
    { namespace: 'etherscan', tool: 'getContractEthereum', schemaId: 'etherscan.getContractEthereum' },
    { namespace: 'abgeordnetenwatch', tool: 'abgeordnetenwatch', schemaId: 'abgeordnetenwatch.abgeordnetenwatch' }
]


const DEFAULT_PHASES = [
    { phaseId: 'P1', status: 'pending', dimensionsConsidered: [ 'tosMatch', 'legalAssessment' ] },
    { phaseId: 'P2', status: 'pending', dimensionsConsidered: [ 'apiAvailability' ] },
    { phaseId: 'P3', status: 'pending', dimensionsConsidered: [] },
    { phaseId: 'P4', status: 'pending', dimensionsConsidered: [ 'apiAvailability', 'outputSchemaConformance' ] },
    { phaseId: 'P5', status: 'pending', dimensionsConsidered: [ 'whenToUse', 'parameters', 'descriptionNeutrality', 'completeness' ] },
    { phaseId: 'P6', status: 'pending', dimensionsConsidered: [ 'aboutConventionCompliance', 'namespaceSkillValidity' ] },
    { phaseId: 'P7', status: 'pending', dimensionsConsidered: [] }
]


const TOP_LEVEL_DIR = join( REPO_ROOT, 'grading-data/phase-status' )
const SINGLE_DIR = join( TOP_LEVEL_DIR, 'single' )
const SELECTION_DIR = join( TOP_LEVEL_DIR, 'selection' )
const BACKUP_DIR = join( REPO_ROOT, 'grading-data/.migration-backup/pre-080-phase-2-status' )


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


const filterToSinglePhases = ( { phases } ) => {
    return phases.filter( ( phase ) => phase.phaseId.startsWith( 'P' ) === true )
}


const buildNewStatus = ( { schemaId, existingPhases } ) => {
    const phases = existingPhases !== null ? filterToSinglePhases( { phases: existingPhases } ) : DEFAULT_PHASES
    return {
        schemaId,
        gradingStatus: 'pending',
        lastGradingHash: null,
        lastGradingMode: null,
        lastGradedAt: null,
        phases
    }
}


const ensureDir = async ( { absolutePath, dryRun, log } ) => {
    if( existsSync( absolutePath ) === true ) {
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
        await mkdir( absoluteDir, { recursive: true } )
        await writeFile( gitkeepPath, '', 'utf-8' )
    }
    log.push( { action: 'CREATE_GITKEEP', path: gitkeepPath } )
    return { created: true }
}


const migratePilot = async ( { pilot, dryRun, log } ) => {
    const { namespace, tool, schemaId } = pilot
    const oldPath = join( TOP_LEVEL_DIR, namespace + '--' + tool + '.json' )
    const newPath = join( SINGLE_DIR, namespace + '--' + tool + '.json' )
    const backupPath = join( BACKUP_DIR, namespace + '--' + tool + '.json' )

    let existingPhases = null
    const oldExists = await fileExists( { path: oldPath } )
    if( oldExists === true ) {
        const raw = await readFile( oldPath, 'utf-8' )
        const parsed = JSON.parse( raw )
        existingPhases = parsed.phases !== undefined ? parsed.phases : null

        // backup-first
        const backupExists = await fileExists( { path: backupPath } )
        if( backupExists === false ) {
            if( dryRun === false ) {
                await mkdir( dirname( backupPath ), { recursive: true } )
                await copyFile( oldPath, backupPath )
            }
            log.push( { action: 'BACKUP', namespace, tool, from: oldPath, to: backupPath } )
        } else {
            log.push( { action: 'SKIP_BACKUP', namespace, tool, path: backupPath } )
        }
    } else {
        // Idempotency: if the migrated file already exists, preserve its phases
        // so rerun does not reset to DEFAULT_PHASES.
        const alreadyMigrated = await fileExists( { path: newPath } )
        if( alreadyMigrated === true ) {
            const raw = await readFile( newPath, 'utf-8' )
            const parsed = JSON.parse( raw )
            existingPhases = parsed.phases !== undefined ? parsed.phases : null
        }
    }

    const newStatus = buildNewStatus( { schemaId, existingPhases } )
    const newContent = JSON.stringify( newStatus, null, 4 ) + '\n'

    const newExists = await fileExists( { path: newPath } )
    if( newExists === true ) {
        const current = await readFile( newPath, 'utf-8' )
        if( current === newContent ) {
            log.push( { action: 'SKIP_STATUS', namespace, tool, path: newPath } )
        } else {
            if( dryRun === false ) {
                await writeFile( newPath, newContent, 'utf-8' )
            }
            log.push( { action: 'UPDATE_STATUS', namespace, tool, path: newPath } )
        }
    } else {
        if( dryRun === false ) {
            await mkdir( dirname( newPath ), { recursive: true } )
            await writeFile( newPath, newContent, 'utf-8' )
        }
        log.push( { action: 'CREATE_STATUS', namespace, tool, path: newPath } )
    }

    // Remove old top-level file after successful backup + new write (only when not dry-run)
    if( oldExists === true && dryRun === false ) {
        const stillExists = await fileExists( { path: oldPath } )
        if( stillExists === true ) {
            await unlink( oldPath )
            log.push( { action: 'REMOVE_OLD', namespace, tool, path: oldPath } )
        }
    } else if( oldExists === true && dryRun === true ) {
        log.push( { action: 'WOULD_REMOVE_OLD', namespace, tool, path: oldPath } )
    }

    return { pilot: schemaId, oldExisted: oldExists, newStatus }
}


const run = async ( { argv } ) => {
    const { dryRun } = parseArgs( { argv } )
    const log = []

    console.log( '[separate-phase-status] mode=' + ( dryRun === true ? 'DRY-RUN' : 'APPLY' ) )
    console.log( '[separate-phase-status] repo-root=' + REPO_ROOT )

    await ensureDir( { absolutePath: SINGLE_DIR, dryRun, log } )
    await ensureDir( { absolutePath: SELECTION_DIR, dryRun, log } )
    await writeGitkeep( { absoluteDir: SELECTION_DIR, dryRun, log } )

    const pilotResults = await PILOTS.reduce( async ( accPromise, pilot ) => {
        const acc = await accPromise
        const result = await migratePilot( { pilot, dryRun, log } )
        return acc.concat( [ result ] )
    }, Promise.resolve( [] ) )

    log.forEach( ( entry ) => {
        const parts = [ '[' + entry.action + ']' ]
        if( entry.namespace !== undefined ) { parts.push( 'ns=' + entry.namespace ) }
        if( entry.tool !== undefined ) { parts.push( 'tool=' + entry.tool ) }
        if( entry.path !== undefined ) { parts.push( entry.path.replace( REPO_ROOT + '/', '' ) ) }
        if( entry.from !== undefined ) { parts.push( 'from=' + entry.from.replace( REPO_ROOT + '/', '' ) ) }
        if( entry.to !== undefined ) { parts.push( 'to=' + entry.to.replace( REPO_ROOT + '/', '' ) ) }
        console.log( parts.join( ' ' ) )
    } )

    console.log( '' )
    console.log( '[separate-phase-status] processed pilots:' )
    pilotResults.forEach( ( r ) => {
        console.log( '  - ' + r.pilot + ' oldExisted=' + r.oldExisted + ' phases=' + r.newStatus.phases.length )
    } )

    return { pilotResults, log }
}


const main = async () => {
    return run( { argv: process.argv.slice( 2 ) } )
}


main()
    .then( ( { log } ) => {
        const errors = log.filter( ( e ) => e.action.startsWith( 'ERROR' ) )
        process.exit( errors.length > 0 ? 1 : 0 )
    } )
    .catch( ( err ) => {
        console.error( '[separate-phase-status] FATAL', err )
        process.exit( 2 )
    } )


export { run, PILOTS, DEFAULT_PHASES, buildNewStatus }
