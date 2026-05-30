#!/usr/bin/env node
/**
 * validate-folder.mjs — standalone CLI entry point for FolderScanner.
 *
 * Memo 080 PRD-14: documented under `flowmcp dev grading validate-folder` —
 * standalone form for callers that don't yet have CLI sub-subcommand wiring.
 *
 * Usage:
 *   node bin/validate-folder.mjs --root=./grading-data
 *   node bin/validate-folder.mjs --root=./grading-data --verbose
 *
 * Exit codes:
 *   0 — only warnings (or clean)
 *   1 — errors found (or invalid input)
 */

import { FolderScanner } from '../src/FolderScanner.mjs'


const parseArgs = () => {
    const args = process.argv.slice( 2 )
    const flags = { root: null, verbose: false, help: false }
    args
        .forEach( ( arg ) => {
            if( arg === '--help' || arg === '-h' ) { flags.help = true }
            else if( arg === '--verbose' ) { flags.verbose = true }
            else if( arg.startsWith( '--root=' ) ) { flags.root = arg.split( '=' )[ 1 ] }
        } )
    return flags
}


const printHelp = () => {
    console.log( 'Usage: node bin/validate-folder.mjs --root=<path> [--verbose]' )
    console.log( '' )
    console.log( 'Validates a grading-data/ folder against Memo 080 Kap 2 / 17.' )
    console.log( '' )
    console.log( 'Flags:' )
    console.log( '  --root=<path>   Path to the grading-data/ root folder.' )
    console.log( '  --verbose       Print every issue (default: summary + errors).' )
    console.log( '  --help, -h      Show this help.' )
}


const main = async () => {
    const flags = parseArgs()

    if( flags.help ) {
        printHelp()
        process.exit( 0 )
    }

    if( flags.root === null ) {
        console.error( 'Error: --root=<path> is required.' )
        printHelp()
        process.exit( 1 )
    }

    const result = await FolderScanner.scan( { gradingDataRoot: flags.root } )

    if( result.errors.length > 0 ) {
        console.error( 'Scanner errors:' )
        result.errors.forEach( ( e ) => console.error( `  ${e}` ) )
        process.exit( 1 )
    }

    const summary = result.summary
    if( summary !== null ) {
        console.log( `Scanned grading-data: ${summary.namespaces} namespaces, ${summary.schemas} schemas, ${summary.singles} singles, ${summary.selections} selections, ${summary.gaps} gaps` )
    }

    if( flags.verbose ) {
        result.issues
            .forEach( ( i ) => {
                console.log( `  [${i.severity}] ${i.code} ${i.path}: ${i.message}` )
            } )
    } else {
        const errors = result.issues.filter( ( i ) => i.severity === 'error' )
        if( errors.length > 0 ) {
            console.log( '\nErrors:' )
            errors.forEach( ( i ) => console.log( `  [${i.code}] ${i.path}: ${i.message}` ) )
        }
    }

    const hasErrors = result.issues.filter( ( i ) => i.severity === 'error' ).length > 0
    process.exit( hasErrors ? 1 : 0 )
}


main()
    .catch( ( err ) => {
        console.error( 'Unhandled error:', err )
        process.exit( 1 )
    } )
