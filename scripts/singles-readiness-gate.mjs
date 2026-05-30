#!/usr/bin/env node
/**
 * singles-readiness-gate.mjs — Zwischen-Gate fuer Mini-Praxis-Selection (Memo 082 Phase 6, PRD-26 redesigned).
 *
 * Laeuft NACH den 7 Single-Gradings, VOR dem Selection-Grading.
 * Prueft fuer jeden Schema-Eintrag der Lockfile:
 *   1. gradingMode === "full"
 *   2. aggregateGrade in ["A", "B"]
 *   3. aboutHash is set (non-empty)
 *
 * Kriterium 4 (schemaHash-Match gegen Lockfile) entfaellt bewusst: die Singles erzeugen
 * den Hash selbst — ein Vergleich gegen den Lockfile-Hash ist zirkulaer und blockiert
 * fuer frisch ausgewaehlte Schemas immer. Die Hash-Drift-Pruefung passiert spaeter
 * im Flywheel-Loop (Spec 18, Memo 080).
 *
 * Semantik-Wechsel zu PRD-26 v1 (Memo 082 REV-05):
 * - VORHER: Hard-Block-Vorbedingung BEVOR Mini-Praxis startet — Henne-Ei (Singles wurden
 *   noch nicht produziert, Stable kann es nicht geben).
 * - JETZT:  Zwischen-Gate zwischen Singles-Done und Selection-Start — semantisch sauber.
 *
 * Exit codes:
 *   0 — PASS (alle 7 Schemas bestanden Singles-Readiness)
 *   1 — FAIL-BLOCKER (mindestens ein Schema nicht ready — Selection-Grading wird blockiert)
 *   2 — Strukturfehler (Lockfile fehlt/malformed, Hard-Threshold-Verletzung)
 *   3 — Parse error (Grading JSON malformed)
 *
 * Output:
 *   - Terminal: per-schema PASS/FAIL line + Verdict
 *   - JSON Report: --report-out (gitignored unter grading-data/)
 *
 * NO SILENT DEFAULTS. Alle drei CLI-Parameter Pflicht.
 */

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'


const ALLOWED_GRADES = new Set( [ 'A', 'B' ] )


class SinglesReadinessGate {
    static async run( { selectionLock, gradingRoot, reportOut } ) {
        const validation = SinglesReadinessGate.#validationRun( {
            selectionLock, gradingRoot, reportOut
        } )
        if( !validation.status ) {
            return { exitCode: 2, report: null, errors: validation.messages }
        }

        if( !existsSync( selectionLock ) ) {
            return {
                exitCode: 2,
                report: null,
                errors: [ `SRG-002: Lock-File not found: ${selectionLock} — run Phase 4 (PRD-23) first.` ]
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
                errors: [ `SRG-002: Lock-File not readable/parseable: ${ioError.message}` ]
            }
        }

        if( !Array.isArray( lock.members ) ) {
            return {
                exitCode: 2,
                report: null,
                errors: [ 'SRG-002: Lock-File malformed: members[] missing or not an array.' ]
            }
        }

        if( lock.members.length !== 7 ) {
            return {
                exitCode: 2,
                report: null,
                errors: [ `SRG-002: Hard-Threshold violation — expected 7 members, got ${lock.members.length} (Spec 10 §2).` ]
            }
        }

        const memberResults = []
        let parseError = null

        await lock.members
            .reduce( async ( prev, member ) => {
                await prev

                const candidate = await SinglesReadinessGate.#findMemberFolder( {
                    gradingRoot, schemaId: member.schemaId
                } )

                if( candidate.folder === null ) {
                    memberResults.push( {
                        schemaId: member.schemaId,
                        status: 'not-ready',
                        reason: 'no-single-grading-found',
                        gradingMode: null,
                        aggregateGrade: null,
                        aboutHash: null
                    } )
                    return
                }

                let latest
                try {
                    latest = await SinglesReadinessGate.#readLatestGrading( { folder: candidate.folder } )
                } catch( err ) {
                    parseError = `SRG-003: Grading JSON malformed in ${candidate.folder}: ${err.message}`
                    return
                }

                if( latest === null ) {
                    memberResults.push( {
                        schemaId: member.schemaId,
                        status: 'not-ready',
                        reason: 'no-single-grading-found',
                        gradingMode: null,
                        aggregateGrade: null,
                        aboutHash: null
                    } )
                    return
                }

                const evaluation = SinglesReadinessGate.#evaluateReadiness( { grading: latest } )
                memberResults.push( {
                    schemaId: member.schemaId,
                    ...evaluation
                } )
            }, Promise.resolve() )

        if( parseError !== null ) {
            return { exitCode: 3, report: null, errors: [ parseError ] }
        }

        const allReady = memberResults.every( ( m ) => m.status === 'ready' )
        const verdict = allReady ? 'PASS' : 'FAIL-BLOCKER'

        const report = {
            selectionId: lock.selectionId,
            checkedAt: new Date().toISOString(),
            gateType: 'singles-readiness',
            verdict,
            members: memberResults
        }

        await mkdir( path.dirname( reportOut ), { recursive: true } )
        await writeFile( reportOut, JSON.stringify( report, null, 4 ), 'utf-8' )

        return { exitCode: allReady ? 0 : 1, report, errors: [] }
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


    static #evaluateReadiness( { grading } ) {
        const gradingMode = grading.gradingMode === undefined ? null : grading.gradingMode
        const aggregateGrade = grading.aggregateGrade === undefined ? null : grading.aggregateGrade
        const aboutHash = grading.aboutHash === undefined || grading.aboutHash === ''
            ? null
            : grading.aboutHash

        if( gradingMode !== 'full' ) {
            return {
                status: 'not-ready',
                reason: 'no-full-grading',
                gradingMode,
                aggregateGrade,
                aboutHash
            }
        }

        if( !ALLOWED_GRADES.has( aggregateGrade ) ) {
            return {
                status: 'not-ready',
                reason: 'grade-too-low',
                gradingMode,
                aggregateGrade,
                aboutHash
            }
        }

        if( aboutHash === null ) {
            return {
                status: 'not-ready',
                reason: 'about-hash-missing',
                gradingMode,
                aggregateGrade,
                aboutHash
            }
        }

        return {
            status: 'ready',
            reason: null,
            gradingMode,
            aggregateGrade,
            aboutHash
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
                    messages.push( `SRG-001: Required parameter missing: --${key.replace( /([A-Z])/g, '-$1' ).toLowerCase()}` )
                    return
                }
                if( typeof value !== type ) {
                    messages.push( `SRG-001: Parameter --${key} must be ${type}, got ${typeof value}` )
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
        'singles-readiness-gate.mjs — Zwischen-Gate zwischen Singles und Selection (Memo 082 PRD-26 redesigned)',
        '',
        'Run order in Phase 6:',
        '  1. PRD-27 Step A:  7 Single-Gradings (FleetRunner)',
        '  2. THIS GATE:      Singles-Readiness Check',
        '  3. PRD-27 Step B:  1 Selection-Grading (only if Gate = PASS)',
        '',
        'Usage:',
        '  node scripts/singles-readiness-gate.mjs \\',
        '    --selection-lock=<path>  \\',
        '    --grading-root=<path>    \\',
        '    --report-out=<path>',
        '',
        'All three parameters are required (NO SILENT DEFAULTS).',
        '',
        'Exit codes:',
        '  0 — PASS (all 7 schemas ready for selection-grading)',
        '  1 — FAIL-BLOCKER (any schema not ready)',
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
    console.log( `[SINGLES-READINESS-GATE] ${report.selectionId}  (${report.members.length}/7 expected)` )
    report.members
        .forEach( ( m ) => {
            const label = m.status === 'ready'
                ? `READY  (${m.gradingMode}, ${m.aggregateGrade}, about=${m.aboutHash})`
                : `NOT-READY  (${m.reason}; mode=${m.gradingMode}, grade=${m.aggregateGrade}, about=${m.aboutHash})`
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
    const { exitCode, report, errors } = await SinglesReadinessGate.run( args )
    printReport( { report, errors } )
    process.exit( exitCode )
}


main().catch( ( err ) => {
    console.error( `[FATAL] ${err.message}` )
    process.exit( 3 )
} )


export { SinglesReadinessGate }
