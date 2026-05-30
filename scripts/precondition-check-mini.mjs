#!/usr/bin/env node
/**
 * precondition-check-mini.mjs — Pre-Condition-Check for crypto-mini (PRD-26, Memo 082 Phase 6).
 *
 * Reads selection.lock.json, verifies that all 7 schemas are `stable` per the
 * 4-criteria rule (PRD-26 §4.2 step 4):
 *   1. gradingMode === "full"
 *   2. aggregateGrade in ["A", "B"]
 *   3. aboutHash is set (non-empty)
 *   4. schemaHash matches the stored hash from the lockfile
 *
 * Exit codes (PRD-26 §4.3):
 *   0 — PASS (all 7 stable)
 *   1 — FAIL-BLOCKER (any schema not stable)
 *   2 — Structural error (lockfile missing, malformed, or hard-threshold violation)
 *   3 — Parse error (grading JSON malformed)
 *
 * Output:
 *   - Terminal: per-schema PASS/FAIL line + Verdict
 *   - JSON Report: written to --report-out (gitignored under grading-data/precondition/)
 *
 * NO SILENT DEFAULTS. All three CLI parameters required.
 */

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'


const ALLOWED_GRADES = new Set( [ 'A', 'B' ] )


class PreconditionMiniCheck {
    static async run( { selectionLock, gradingRoot, reportOut } ) {
        const validation = PreconditionMiniCheck.#validationRun( {
            selectionLock, gradingRoot, reportOut
        } )
        if( !validation.status ) {
            return { exitCode: 2, report: null, errors: validation.messages }
        }

        if( !existsSync( selectionLock ) ) {
            return {
                exitCode: 2,
                report: null,
                errors: [ `PRE-MINI-002: Lock-File not found: ${selectionLock} — run Phase 4 (PRD-23) first.` ]
            }
        }

        let lock
        try {
            const raw = await readFile( selectionLock, 'utf-8' )
            lock = JSON.parse( raw )
        } catch( ioError ) {
            return {
                exitCode: 2,
                report: null,
                errors: [ `PRE-MINI-002: Lock-File not readable/parseable: ${ioError.message}` ]
            }
        }

        if( !Array.isArray( lock.members ) ) {
            return {
                exitCode: 2,
                report: null,
                errors: [ 'PRE-MINI-002: Lock-File malformed: members[] missing or not an array.' ]
            }
        }

        if( lock.members.length !== 7 ) {
            return {
                exitCode: 2,
                report: null,
                errors: [ `PRE-MINI-002: Hard-Threshold violation — expected 7 members, got ${lock.members.length} (Spec 10 §2).` ]
            }
        }

        // Per-member status derivation
        const memberResults = []
        let parseError = null

        await lock.members
            .reduce( async ( prev, member ) => {
                await prev

                const ns = member.schemaId
                const memberFolder = path.join( gradingRoot, `${ns}--${member.schemaId}`, 'gradings' )
                // Lockfile uses schemaId for the namespace identifier (Memo 082 P4 lock format).
                // The fleet path convention is <ns>--<tool>; for these single-tool selections we
                // try both folders: <schemaId>--<schemaId> and just <schemaId>--* (first match).
                const candidate = await PreconditionMiniCheck.#findMemberFolder( {
                    gradingRoot, schemaId: member.schemaId
                } )

                if( candidate.folder === null ) {
                    memberResults.push( {
                        schemaId: member.schemaId,
                        status: 'not-stable',
                        reason: 'no-grading-found',
                        gradingMode: null,
                        aggregateGrade: null,
                        aboutHash: null,
                        schemaHashOnDisk: null,
                        schemaHashExpected: member.schemaHash
                    } )
                    return
                }

                let latest
                try {
                    latest = await PreconditionMiniCheck.#readLatestGrading( { folder: candidate.folder } )
                } catch( err ) {
                    parseError = `PRE-MINI-003: Grading JSON malformed in ${candidate.folder}: ${err.message}`
                    return
                }

                if( latest === null ) {
                    memberResults.push( {
                        schemaId: member.schemaId,
                        status: 'not-stable',
                        reason: 'no-grading-found',
                        gradingMode: null,
                        aggregateGrade: null,
                        aboutHash: null,
                        schemaHashOnDisk: null,
                        schemaHashExpected: member.schemaHash
                    } )
                    return
                }

                const evaluation = PreconditionMiniCheck.#evaluateStatus( {
                    grading: latest, expectedHash: member.schemaHash
                } )
                memberResults.push( {
                    schemaId: member.schemaId,
                    ...evaluation,
                    schemaHashExpected: member.schemaHash
                } )
            }, Promise.resolve() )

        if( parseError !== null ) {
            return { exitCode: 3, report: null, errors: [ parseError ] }
        }

        const allStable = memberResults.every( ( m ) => m.status === 'stable' )
        const verdict = allStable ? 'PASS' : 'FAIL-BLOCKER'

        const report = {
            selectionId: lock.selectionId,
            checkedAt: new Date().toISOString(),
            verdict,
            members: memberResults
        }

        // Write report (gitignored path)
        await mkdir( path.dirname( reportOut ), { recursive: true } )
        await writeFile( reportOut, JSON.stringify( report, null, 4 ), 'utf-8' )

        return { exitCode: allStable ? 0 : 1, report, errors: [] }
    }


    static async #findMemberFolder( { gradingRoot, schemaId } ) {
        if( !existsSync( gradingRoot ) ) {
            return { folder: null }
        }
        let entries
        try {
            entries = await readdir( gradingRoot, { withFileTypes: true } )
        } catch( _ ) {
            return { folder: null }
        }
        const match = entries
            .filter( ( e ) => e.isDirectory() )
            .find( ( e ) => e.name === `${schemaId}--${schemaId}` || e.name.startsWith( `${schemaId}--` ) )
        if( match === undefined ) { return { folder: null } }
        const gradingsFolder = path.join( gradingRoot, match.name, 'gradings' )
        if( !existsSync( gradingsFolder ) ) { return { folder: null } }
        return { folder: gradingsFolder }
    }


    static async #readLatestGrading( { folder } ) {
        const files = await readdir( folder )
        const jsonFiles = files
            .filter( ( f ) => f.endsWith( '.json' ) )
            .sort()
            .reverse()
        if( jsonFiles.length === 0 ) { return null }
        const raw = await readFile( path.join( folder, jsonFiles[ 0 ] ), 'utf-8' )
        return JSON.parse( raw )
    }


    static #evaluateStatus( { grading, expectedHash } ) {
        const gradingMode = grading.gradingMode === undefined ? null : grading.gradingMode
        const aggregateGrade = grading.aggregateGrade === undefined ? null : grading.aggregateGrade
        const aboutHash = grading.aboutHash === undefined || grading.aboutHash === ''
            ? null
            : grading.aboutHash
        const schemaHashOnDisk = grading.schemaHash === undefined ? null : grading.schemaHash

        // Criterion 1 — gradingMode === "full"
        if( gradingMode !== 'full' ) {
            return {
                status: 'not-stable',
                reason: 'no-full-grading',
                gradingMode,
                aggregateGrade,
                aboutHash,
                schemaHashOnDisk
            }
        }

        // Criterion 2 — aggregateGrade in A or B
        if( !ALLOWED_GRADES.has( aggregateGrade ) ) {
            return {
                status: 'not-stable',
                reason: 'grade-too-low',
                gradingMode,
                aggregateGrade,
                aboutHash,
                schemaHashOnDisk
            }
        }

        // Criterion 3 — aboutHash set
        if( aboutHash === null ) {
            return {
                status: 'not-stable',
                reason: 'about-hash-missing',
                gradingMode,
                aggregateGrade,
                aboutHash,
                schemaHashOnDisk
            }
        }

        // Criterion 4 — schemaHash matches
        if( schemaHashOnDisk !== expectedHash ) {
            return {
                status: 'not-stable',
                reason: 'hash-mismatch',
                gradingMode,
                aggregateGrade,
                aboutHash,
                schemaHashOnDisk
            }
        }

        return {
            status: 'stable',
            reason: null,
            gradingMode,
            aggregateGrade,
            aboutHash,
            schemaHashOnDisk
        }
    }


    static #validationRun( { selectionLock, gradingRoot, reportOut } ) {
        const messages = []
        const struct = { status: false, messages }

        const pairs = [
            [ 'selectionLock', selectionLock, 'string' ],
            [ 'gradingRoot', gradingRoot, 'string' ],
            [ 'reportOut', reportOut, 'string' ]
        ]
        pairs
            .forEach( ( [ key, value, type ] ) => {
                if( value === undefined || value === null || value === '' ) {
                    messages.push( `PRE-MINI-001: Required parameter missing: --${key.replace( /([A-Z])/g, '-$1' ).toLowerCase()}` )
                    return
                }
                if( typeof value !== type ) {
                    messages.push( `PRE-MINI-001: Parameter --${key} must be ${type}, got ${typeof value}` )
                }
            } )
        if( messages.length === 0 ) { struct.status = true }
        return struct
    }
}


function parseArgs( { argv } ) {
    const out = { selectionLock: null, gradingRoot: null, reportOut: null, help: false }
    argv
        .forEach( ( arg ) => {
            if( arg === '--help' || arg === '-h' ) {
                out.help = true
                return
            }
            const eqIdx = arg.indexOf( '=' )
            if( eqIdx === -1 ) { return }
            const key = arg.substring( 0, eqIdx )
            const value = arg.substring( eqIdx + 1 )
            if( key === '--selection-lock' ) { out.selectionLock = value }
            else if( key === '--grading-root' ) { out.gradingRoot = value }
            else if( key === '--report-out' ) { out.reportOut = value }
        } )
    return out
}


function printHelp() {
    const lines = [
        'precondition-check-mini.mjs — Pre-Condition-Check for crypto-mini (PRD-26)',
        '',
        'Usage:',
        '  node scripts/precondition-check-mini.mjs \\',
        '    --selection-lock=<path>  \\',
        '    --grading-root=<path>    \\',
        '    --report-out=<path>',
        '',
        'All three parameters are required (NO SILENT DEFAULTS).',
        '',
        'Exit codes:',
        '  0 — PASS (all 7 schemas stable)',
        '  1 — FAIL-BLOCKER (any schema not stable)',
        '  2 — Structural error (lockfile missing / malformed / hard-threshold violation)',
        '  3 — Parse error (grading JSON malformed)'
    ]
    console.log( lines.join( '\n' ) )
}


function printReport( { report, errors } ) {
    if( errors.length > 0 ) {
        errors.forEach( ( e ) => console.error( `[ERROR] ${e}` ) )
        return
    }
    if( report === null ) { return }
    console.log( `[PRE-CONDITION-CHECK] ${report.selectionId}  (${report.members.length}/7 expected)` )
    report.members
        .forEach( ( m ) => {
            const label = m.status === 'stable'
                ? `PASS  (${m.gradingMode}, ${m.aggregateGrade}, hash=${m.schemaHashOnDisk})`
                : `FAIL  (${m.reason}; mode=${m.gradingMode}, grade=${m.aggregateGrade}, about=${m.aboutHash})`
            console.log( `  ${m.schemaId.padEnd( 30 )}  ${label}` )
        } )
    console.log( `Verdict: ${report.verdict}` )
}


async function main() {
    const args = parseArgs( { argv: process.argv.slice( 2 ) } )
    if( args.help ) {
        printHelp()
        process.exit( 0 )
    }
    const { exitCode, report, errors } = await PreconditionMiniCheck.run( args )
    printReport( { report, errors } )
    process.exit( exitCode )
}


main().catch( ( err ) => {
    console.error( `[FATAL] ${err.message}` )
    process.exit( 3 )
} )


export { PreconditionMiniCheck }
