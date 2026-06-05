/**
 * StablePromotion — promotes a schema to the 5-status `stable` when conditions are met.
 *
 * Per the grading spec (gradingSpec/3.0.0):
 *   - The last grading entry before stable MUST be full.
 *   - The node status lives in the rollup `index.json` (the legacy
 *     phase-status/single/<ns>--<tool>.json is dropped); StablePromotion writes
 *     the node-status outcome into the namespace/selection index.json (the only
 *     overwritable artifact).
 *
 * Conditions for stable:
 *   - At least one grading file exists
 *   - The last (most-recent) entry is gradingMode: full
 *   - aggregateGrade >= threshold (default 'A')
 *   - Sequence is valid (Rules from PartialGrading)
 *
 * The eligibility `reason` is mapped to one of the FIVE node statuses
 * (pending/blocked/graded/stable/rejected) via an explicit map — no silent default.
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

// Explicit eligibility-reason → 5-status node-status map (no silent default).
// `ok` is the only reason that promotes to `stable`; every other reason keeps
// the node at a non-stable status. A rejected veto is terminal (handled upstream
// via aggregateGrade=REJECTED → rejected), so it is not produced here.
const REASON_TO_NODE_STATUS = Object.freeze( {
    ok: 'stable',
    'no-gradings': 'pending',
    'last-not-full': 'graded',
    'below-threshold': 'graded',
    'sequence-invalid': 'blocked',
    'invalid-input': 'blocked'
} )


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


    /**
     * mapReasonToStatus — explicit eligibility-reason → 5-status node-status map.
     * No silent default: an unmapped reason errors.
     */
    static mapReasonToStatus( { reason } ) {
        if( reason === undefined || reason === null ) {
            return { nodeStatus: null, errors: [ 'STB-001: Required field missing: reason' ] }
        }
        const mapped = REASON_TO_NODE_STATUS[ reason ]
        if( mapped === undefined ) {
            return { nodeStatus: null, errors: [ `STB-004: Unknown eligibility reason: ${reason}` ] }
        }
        return { nodeStatus: mapped, errors: [] }
    }


    static async promoteIfEligible( { gradingDataRoot, namespaceTool, gradingFiles, threshold } ) {
        const { status, messages } = StablePromotion.#validationPromote( {
            gradingDataRoot, namespaceTool, gradingFiles, threshold
        } )
        if( !status ) { return { status: 'pending', written: false, errors: messages } }

        const eligibility = StablePromotion.checkEligibility( { gradingFiles, threshold } )

        // 5-status node status, derived from the eligibility reason via the explicit map.
        const mappedStatus = StablePromotion.mapReasonToStatus( { reason: eligibility.reason } )
        if( mappedStatus.errors.length > 0 ) {
            return { status: 'pending', written: false, errors: mappedStatus.errors }
        }

        // v2 write-target: the per-namespace node-status snapshot lives next to the
        // rollup index.json under providers/<ns>/ (the legacy phase-status/single/
        // tree is dropped). The filename keeps the <ns>--<tool> key for lookup.
        const namespace = namespaceTool.split( '--' )[ 0 ]
        const targetDir = join( gradingDataRoot, 'providers', namespace )
        await mkdir( targetDir, { recursive: true } )
        const targetPath = join( targetDir, `${namespaceTool}--status.json` )

        const last = gradingFiles.length > 0 ? gradingFiles[ gradingFiles.length - 1 ] : null

        const payload = {
            namespaceTool,
            schemaHash: last !== null ? ( last.schemaHash === undefined ? null : last.schemaHash ) : null,
            schemaVersion: last !== null ? ( last.schemaVersion === undefined ? null : last.schemaVersion ) : null,
            gradingStatus: mappedStatus.nodeStatus,
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
