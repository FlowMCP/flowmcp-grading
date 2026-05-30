// Build (or refresh) selection.lock.json for crypto-domain-full.
//
// Invokes SelectionLockfile.generate.
// Reports a clear PRE-CONDITION-BLOCK message when not all members are stable
// (see the selection pre-conditions).
//
// Flags:
//   --strict   — exit code 2 if any member is not 'stable'
//   --verbose
//
// NO SILENT DEFAULTS.


import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFile, readFile } from 'node:fs/promises'

import { SelectionLockfile } from '../src/SelectionLockfile.mjs'


const __filename = fileURLToPath( import.meta.url )
const __dirname = dirname( __filename )
const REPO_ROOT = resolve( __dirname, '..' )
const GRADING_DATA = join( REPO_ROOT, 'grading-data' )
const SELECTION_ID = 'crypto-domain-full'


const parseArgs = ( { argv } ) => ( {
    strict: argv.includes( '--strict' ),
    verbose: argv.includes( '--verbose' )
} )


const main = async () => {
    const { strict, verbose } = parseArgs( { argv: process.argv.slice( 2 ) } )

    if( verbose ) {
        console.error( `[lockfile] generating for ${SELECTION_ID} ...` )
    }

    const { lockfilePath, lockfile, errors } = await SelectionLockfile.generate( {
        gradingDataRoot: GRADING_DATA,
        selectionId: SELECTION_ID
    } )

    if( errors.length > 0 ) {
        errors.forEach( ( e ) => console.error( `[lockfile] ${e}` ) )
    }

    if( lockfile === null ) {
        console.error( '[lockfile] FAILED to generate' )
        process.exit( 1 )
    }

    const totals = {
        total: lockfile.members.length,
        stable: lockfile.members.filter( ( m ) => m.gradingStatus === 'stable' ).length,
        pending: lockfile.members.filter( ( m ) => m.gradingStatus === 'pending' ).length
    }

    console.error( `[lockfile] written ${lockfilePath}` )
    console.error( `[lockfile] members total=${totals.total} stable=${totals.stable} pending=${totals.pending}` )

    if( totals.pending > 0 ) {
        const pendingList = lockfile.members
            .filter( ( m ) => m.gradingStatus === 'pending' )
            .map( ( m ) => m.schemaId )
        console.error( '' )
        console.error( 'PRE-CONDITION-BLOCK — Cannot proceed with selection-grading:' )
        console.error( `  ${totals.pending} of ${totals.total} members are NOT 'stable' (see selection pre-conditions).` )
        console.error( '  pending namespaces:' )
        pendingList
            .slice( 0, 10 )
            .forEach( ( ns ) => console.error( `    - ${ns}` ) )
        if( pendingList.length > 10 ) {
            console.error( `    ... (+${pendingList.length - 10} more)` )
        }
        console.error( '' )
        console.error( 'Resolution:' )
        console.error( '  1. Run the single full gradings:' )
        console.error( '     node scripts/batch-single-gradings-phase-4.mjs --mode=grade' )
        console.error( '     (or per member: --single=<schemaId>)' )
        console.error( '  2. Re-run this script to refresh the lockfile.' )
        console.error( '  3. Then run the selection grading.' )

        // Update selection.json.selectionHash with the lockfile-computed value
        // so the data layer stays in sync (a no-op if hashes already match).
        await syncSelectionHash( { lockfile, verbose } )

        if( strict ) { process.exit( 2 ) }
        return
    }

    await syncSelectionHash( { lockfile, verbose } )
    console.error( '[lockfile] OK — all members stable. Selection-grading can proceed.' )
}


const syncSelectionHash = async ( { lockfile, verbose } ) => {
    const selectionPath = join( GRADING_DATA, 'selection', SELECTION_ID, 'selection.json' )
    const sel = JSON.parse( await readFile( selectionPath, 'utf-8' ) )
    if( sel.selectionHash === lockfile.selectionHash ) {
        if( verbose ) { console.error( '[lockfile] selectionHash already in sync' ) }
        return
    }
    sel.selectionHash = lockfile.selectionHash
    await writeFile( selectionPath, JSON.stringify( sel, null, 4 ), 'utf-8' )
    if( verbose ) { console.error( `[lockfile] synced selection.json.selectionHash → ${lockfile.selectionHash}` ) }
}


main()
    .catch( ( err ) => {
        console.error( `[lockfile] ERROR: ${err.message}` )
        process.exit( 1 )
    } )
