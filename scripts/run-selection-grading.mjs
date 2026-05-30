// Run Selection-Grading for crypto-domain-full.
//
// Selection-grading workflow:
//   Step 0 — Pre-Condition-Check (read lockfile, require all members 'stable')
//   Step 1 — Selection-Validator S1-S4
//   Step 2 — Persist grading-JSON
//   Step 3 — Re-Grade on changes (driven by external loop, not this script)
//
// REALITY-CHECK (2026-05-29):
//   Pre-Condition cannot be fulfilled in this single subagent run because the
//   Single-Schema-Validator (src/Phases/SingleSchema.mjs) is partly stubbed
//   (P1/P2/P7) and a full LLM-grading of 64 members would take hours.
//   This script ALWAYS runs the Pre-Condition-Check first. If it fails, the
//   script exits with a clear BLOCK message; nothing is graded.
//
// Flags:
//   --mode=full         (default; only 'full' is meaningful here)
//   --persona=<id>      (default crypto-trader-2026)
//   --skip-precondition (override — debug only, requires --i-know-what-i-do)
//   --verbose
//
// NO SILENT DEFAULTS.


import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PreConditionCheck } from '../src/PreConditionCheck.mjs'
import { SelectionPhases } from '../src/Phases/Selection.mjs'


const __filename = fileURLToPath( import.meta.url )
const __dirname = dirname( __filename )
const REPO_ROOT = resolve( __dirname, '..' )
const GRADING_DATA = join( REPO_ROOT, 'grading-data' )
const SELECTION_ID = 'crypto-domain-full'


const parseArgs = ( { argv } ) => {
    const modeArg = argv.find( ( a ) => a.startsWith( '--mode=' ) )
    const mode = modeArg !== undefined ? modeArg.slice( '--mode='.length ) : 'full'
    const personaArg = argv.find( ( a ) => a.startsWith( '--persona=' ) )
    const persona = personaArg !== undefined ? personaArg.slice( '--persona='.length ) : 'crypto-trader-2026'
    const skipPrecond = argv.includes( '--skip-precondition' )
    const override = argv.includes( '--i-know-what-i-do' )
    const verbose = argv.includes( '--verbose' )
    return { mode, persona, skipPrecond, override, verbose }
}


const fileExists = async ( { path } ) => {
    try { await stat( path ); return true } catch { return false }
}


const formatTimestampForFilename = ( { iso } ) => {
    return iso.replace( /[:.]/g, '-' )
}


const main = async () => {
    const { mode, persona, skipPrecond, override, verbose } = parseArgs( { argv: process.argv.slice( 2 ) } )

    if( mode !== 'full' ) {
        console.error( `[sel-grade] WARN: --mode=${mode} ignored; initial grading requires 'full'` )
    }

    const selectionPath = join( GRADING_DATA, 'selection', SELECTION_ID, 'selection.json' )
    const lockfilePath = join( GRADING_DATA, 'selection', SELECTION_ID, 'selection.lock.json' )

    if( !await fileExists( { path: selectionPath } ) ) {
        console.error( `[sel-grade] ERROR: selection.json missing at ${selectionPath}` )
        process.exit( 1 )
    }
    if( !await fileExists( { path: lockfilePath } ) ) {
        console.error( '[sel-grade] ERROR: selection.lock.json missing. Run: node scripts/run-lockfile-build.mjs' )
        process.exit( 1 )
    }

    const selectionJson = JSON.parse( await readFile( selectionPath, 'utf-8' ) )
    const lockfile = JSON.parse( await readFile( lockfilePath, 'utf-8' ) )

    // Step 0 — Pre-Condition
    if( skipPrecond && override ) {
        console.error( '[sel-grade] WARN: --skip-precondition active (debug)' )
    } else {
        const { passed, missingSingleGradings, errors } = await PreConditionCheck.check( {
            gradingDataRoot: GRADING_DATA,
            selectionId: SELECTION_ID
        } )

        if( !passed ) {
            console.error( '[sel-grade] PRE-CONDITION-BLOCK:' )
            errors.forEach( ( e ) => console.error( `  ${e}` ) )
            if( Array.isArray( missingSingleGradings ) && missingSingleGradings.length > 0 ) {
                console.error( `  pending members: ${missingSingleGradings.length}` )
                missingSingleGradings.slice( 0, 10 ).forEach( ( ns ) => console.error( `    - ${ns}` ) )
                if( missingSingleGradings.length > 10 ) {
                    console.error( `    ... (+${missingSingleGradings.length - 10} more)` )
                }
            }
            console.error( '' )
            console.error( '  Resolution:' )
            console.error( '    1. Single-Full-Grading per member:  node scripts/batch-single-gradings-phase-4.mjs --mode=grade' )
            console.error( '    2. Refresh lockfile:                 node scripts/run-lockfile-build.mjs' )
            console.error( '    3. Re-run this script.' )
            process.exit( 2 )
        }
        if( verbose ) { console.error( '[sel-grade] Pre-Condition PASS — all members stable' ) }
    }

    // Step 1 — Selection-Validator S1-S4
    const entry = {
        gradingTier: 'group-bound',
        gradingMode: mode,
        persona
    }
    const result = await SelectionPhases.runAll( {
        entry,
        selectionId: SELECTION_ID,
        selectionJson,
        lockfile,
        gradingDataRoot: GRADING_DATA,
        personaIndex: { ids: selectionJson.personaIds },
        schemaEntries: [],
        domainDocPath: null,
        personaIds: selectionJson.personaIds
    } )

    // Step 2 — Persist
    const now = new Date().toISOString()
    const tsForFile = formatTimestampForFilename( { iso: now } )
    const gradingId = `${lockfile.selectionHash}--${tsForFile}`

    const grading = {
        gradingId,
        selectionId: SELECTION_ID,
        selectionHash: lockfile.selectionHash,
        selectionVersion: lockfile.selectionVersion,
        gradingMode: mode,
        persona,
        phases: result.phases,
        errors: result.errors,
        tier: result.tier,
        createdAt: now
    }

    const gradingsDir = join( GRADING_DATA, 'selection', SELECTION_ID, 'gradings' )
    await mkdir( gradingsDir, { recursive: true } )
    const gradingPath = join( gradingsDir, `${gradingId}.json` )
    await writeFile( gradingPath, JSON.stringify( grading, null, 4 ), 'utf-8' )

    console.error( `[sel-grade] grading written: ${gradingPath}` )
    console.error( `[sel-grade] phases: ${result.phases.map( ( p ) => `${p.phase}(${p.errors.length})` ).join( ' ' )}` )
    process.stdout.write( JSON.stringify( grading, null, 2 ) + '\n' )
}


main()
    .catch( ( err ) => {
        console.error( `[sel-grade] ERROR: ${err.message}` )
        process.exit( 1 )
    } )
