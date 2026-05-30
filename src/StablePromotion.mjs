/**
 * StablePromotion — promotes a schema to `stable` when conditions are met.
 *
 * Memo 080 anchors:
 *   Kap 4 — Last grading entry before stable MUST be full
 *   Kap 11 — gradingStatus field, phase-status/single/<ns>--<tool>.json
 *
 * Conditions for stable:
 *   - At least one grading file exists
 *   - The last (most-recent) entry is gradingMode: full
 *   - aggregateGrade >= threshold (default 'A')
 *   - Sequence is valid (Rules from PartialGrading)
 *
 * NO SILENT DEFAULTS. Static methods only, object params, object returns.
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'

import { PartialGrading } from './Phases/PartialGrading.mjs'


const GRADE_ORDER = Object.freeze( {
    A: 5,
    B: 4,
    C: 3,
    D: 2,
    F: 1
} )

const VALID_THRESHOLDS = [ 'A', 'B', 'C', 'D', 'F' ]
const DEFAULT_THRESHOLD = 'A'


class StablePromotion {
    static getDefaultThreshold() {
        return { threshold: DEFAULT_THRESHOLD }
    }


    static checkEligibility( { gradingFiles, threshold } ) {
        const { status, messages } = StablePromotion.#validationEligibility( { gradingFiles, threshold } )
        if( !status ) { return { eligible: false, reason: 'invalid-input', errors: messages } }

        if( gradingFiles.length === 0 ) {
            return { eligible: false, reason: 'no-gradings', errors: [] }
        }

        const last = gradingFiles[ gradingFiles.length - 1 ]
        if( last.gradingMode !== 'full' ) {
            return {
                eligible: false,
                reason: 'last-not-full',
                errors: [ 'STB-WARN-001: Stable-Promotion blocked: last grading entry is partial' ]
            }
        }

        const passes = StablePromotion.#compareGrade( {
            actual: last.aggregateGrade,
            threshold
        } )
        if( !passes ) {
            return {
                eligible: false,
                reason: 'below-threshold',
                errors: [ `STB-WARN-002: Stable-Promotion blocked: aggregateGrade ${last.aggregateGrade} below threshold ${threshold}` ]
            }
        }

        const sequence = PartialGrading.validateSequence( { gradingFiles } )
        if( !sequence.valid ) {
            return {
                eligible: false,
                reason: 'sequence-invalid',
                errors: sequence.violations.map( ( v ) => v.message )
            }
        }

        return { eligible: true, reason: 'ok', errors: [] }
    }


    static async promoteIfEligible( { gradingDataRoot, namespaceTool, gradingFiles, threshold } ) {
        const { status, messages } = StablePromotion.#validationPromote( {
            gradingDataRoot, namespaceTool, gradingFiles, threshold
        } )
        if( !status ) { return { status: 'pending', written: false, errors: messages } }

        const eligibility = StablePromotion.checkEligibility( { gradingFiles, threshold } )

        const targetDir = join( gradingDataRoot, 'phase-status', 'single' )
        await mkdir( targetDir, { recursive: true } )
        const targetPath = join( targetDir, `${namespaceTool}.json` )

        const last = gradingFiles.length > 0 ? gradingFiles[ gradingFiles.length - 1 ] : null

        const payload = {
            namespaceTool,
            schemaHash: last !== null ? ( last.schemaHash === undefined ? null : last.schemaHash ) : null,
            schemaVersion: last !== null ? ( last.schemaVersion === undefined ? null : last.schemaVersion ) : null,
            gradingStatus: eligibility.eligible ? 'stable' : 'pending',
            aggregateGrade: last !== null ? ( last.aggregateGrade === undefined ? null : last.aggregateGrade ) : null,
            lastGradingPath: last !== null ? ( last.path === undefined ? null : last.path ) : null,
            lastGradingMode: last !== null ? ( last.gradingMode === undefined ? null : last.gradingMode ) : null,
            promotedAt: new Date().toISOString(),
            threshold,
            reason: eligibility.reason
        }

        const serialized = JSON.stringify( payload, null, 4 )
        await writeFile( targetPath, serialized, 'utf-8' )

        return {
            status: payload.gradingStatus,
            written: true,
            path: targetPath,
            errors: eligibility.errors
        }
    }


    static #compareGrade( { actual, threshold } ) {
        const a = GRADE_ORDER[ actual ]
        const t = GRADE_ORDER[ threshold ]
        if( a === undefined || t === undefined ) { return false }
        return a >= t
    }


    static #validationEligibility( { gradingFiles, threshold } ) {
        const messages = []
        const struct = { status: false, messages }

        if( gradingFiles === undefined || gradingFiles === null ) {
            messages.push( 'STB-001: Required field missing: gradingFiles' )
            return struct
        }
        if( !Array.isArray( gradingFiles ) ) {
            messages.push( 'STB-002: Type mismatch for field gradingFiles: expected array, got ' + typeof gradingFiles )
            return struct
        }
        if( threshold === undefined || threshold === null ) {
            messages.push( 'STB-001: Required field missing: threshold' )
            return struct
        }
        if( !VALID_THRESHOLDS.includes( threshold ) ) {
            messages.push( `STB-003: Invalid threshold: ${threshold} (expected one of [${VALID_THRESHOLDS.join( ', ' )}])` )
            return struct
        }

        struct.status = true
        return struct
    }


    static #validationPromote( { gradingDataRoot, namespaceTool, gradingFiles, threshold } ) {
        const messages = []
        const struct = { status: false, messages }

        const pairs = [
            [ 'gradingDataRoot', gradingDataRoot, 'string' ],
            [ 'namespaceTool', namespaceTool, 'string' ]
        ]
        pairs
            .forEach( ( [ key, value, type ] ) => {
                if( value === undefined || value === null ) {
                    messages.push( `STB-001: Required field missing: ${key}` )
                    return
                }
                if( type === 'string' && typeof value !== 'string' ) {
                    messages.push( `STB-002: Type mismatch for field ${key}: expected string, got ${typeof value}` )
                }
            } )

        if( messages.length > 0 ) { return struct }

        const eligValidation = StablePromotion.#validationEligibility( { gradingFiles, threshold } )
        if( !eligValidation.status ) {
            eligValidation.messages
                .forEach( ( m ) => messages.push( m ) )
            return struct
        }

        struct.status = true
        return struct
    }
}


export { StablePromotion, DEFAULT_THRESHOLD, GRADE_ORDER, VALID_THRESHOLDS }
