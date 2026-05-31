/**
 * PreConditionCheck — universal stable-gate shared by Selection-Grading and About-Verification.
 *
 * Per the grading spec (gradingSpec/1.2.0 §21):
 *   - Defines the universal pre-condition.
 *   - Step 0 — pre-condition check (mandatory).
 *
 * Rule: aggregated checks are blocked until every member-schema carries the
 * 5-status `gradingStatus: 'stable'` in the frozen `lockSnapshot` of the
 * selection's `selections/<sel>/index.json` (the `selection.lock.json` lifecycle
 * is dropped — pins live in index.json.lockSnapshot). Of the 5 statuses
 * (pending/blocked/graded/stable/rejected) ONLY `stable` passes the gate.
 *
 * NO SILENT DEFAULTS. Static methods only, object params, object returns.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'


const VALID_NODE_STATUSES = [ 'pending', 'blocked', 'graded', 'stable', 'rejected' ]


class PreConditionCheck {
    static async check( { gradingDataRoot, selectionId } ) {
        const { status, messages } = PreConditionCheck.#validationCheck( { gradingDataRoot, selectionId } )
        if( !status ) {
            return {
                passed: false,
                blockedMembers: [],
                missingSingleGradings: [],
                errors: messages
            }
        }

        // v2 source: the frozen lockSnapshot inside selections/<sel>/index.json.
        const indexPath = join( gradingDataRoot, 'selections', selectionId, 'index.json' )
        const indexRead = await PreConditionCheck.#readIndex( { path: indexPath } )
        if( indexRead.errors.length > 0 ) {
            return {
                passed: false,
                blockedMembers: [],
                missingSingleGradings: [],
                errors: indexRead.errors
            }
        }

        const lockSnapshot = indexRead.index.lockSnapshot
        if( lockSnapshot === undefined || lockSnapshot === null ) {
            return {
                passed: false,
                blockedMembers: [],
                missingSingleGradings: [],
                errors: [ `PRE-002: index.json has no lockSnapshot: ${indexPath}` ]
            }
        }

        return PreConditionCheck.checkLockfile( { lockfile: lockSnapshot } )
    }


    static checkLockfile( { lockfile } ) {
        const { status, messages } = PreConditionCheck.#validationLockfile( { lockfile } )
        if( !status ) {
            return {
                passed: false,
                blockedMembers: [],
                missingSingleGradings: [],
                errors: messages
            }
        }

        if( lockfile.members.length === 0 ) {
            return {
                passed: true,
                blockedMembers: [],
                missingSingleGradings: [],
                errors: [ 'PRE-WARN-001: lockSnapshot is empty — no members to check' ]
            }
        }

        // 5-status gate: only `stable` passes. Every other status (pending,
        // blocked, graded, rejected) blocks the member — no silent default.
        const blockedMembers = lockfile.members
            .filter( ( m ) => m.gradingStatus !== 'stable' )
            .map( ( m ) => ( {
                schemaId: m.schemaId,
                gradingStatus: m.gradingStatus === undefined ? null : m.gradingStatus,
                missingGrading: m.gradingStatus === undefined || m.gradingStatus === null || m.gradingStatus === 'pending'
            } ) )

        const missingSingleGradings = blockedMembers
            .map( ( m ) => m.schemaId )

        if( blockedMembers.length === 0 ) {
            return {
                passed: true,
                blockedMembers: [],
                missingSingleGradings: [],
                errors: []
            }
        }

        return {
            passed: false,
            blockedMembers,
            missingSingleGradings,
            errors: [ `PRE-004: Pre-Condition not met: missing stable single-gradings: ${missingSingleGradings.join( ', ' )}` ]
        }
    }


    static async #readIndex( { path } ) {
        try {
            const content = await readFile( path, 'utf-8' )
            try {
                const parsed = JSON.parse( content )
                return { index: parsed, errors: [] }
            } catch( parseError ) {
                return { index: null, errors: [ `PRE-003: index.json format invalid: ${parseError.message}` ] }
            }
        } catch( ioError ) {
            return { index: null, errors: [ `PRE-002: index.json not readable: ${path}` ] }
        }
    }


    static #validationCheck( { gradingDataRoot, selectionId } ) {
        const messages = []
        const struct = { status: false, messages }

        const pairs = [
            [ 'gradingDataRoot', gradingDataRoot, 'string' ],
            [ 'selectionId', selectionId, 'string' ]
        ]
        pairs
            .forEach( ( [ key, value, type ] ) => {
                if( value === undefined || value === null ) {
                    messages.push( `PRE-001: Required field missing: ${key}` )
                    return
                }
                if( type === 'string' && typeof value !== 'string' ) {
                    messages.push( `PRE-001: Type mismatch for field ${key}: expected string, got ${typeof value}` )
                }
            } )

        if( messages.length > 0 ) { return struct }

        struct.status = true
        return struct
    }


    static #validationLockfile( { lockfile } ) {
        const messages = []
        const struct = { status: false, messages }

        if( lockfile === undefined || lockfile === null ) {
            messages.push( 'PRE-001: Required field missing: lockfile' )
            return struct
        }
        if( typeof lockfile !== 'object' || Array.isArray( lockfile ) ) {
            messages.push( 'PRE-003: lockSnapshot format invalid: expected object' )
            return struct
        }
        if( !Array.isArray( lockfile.members ) ) {
            messages.push( 'PRE-003: lockSnapshot format invalid: members[] missing' )
            return struct
        }

        struct.status = true
        return struct
    }
}


export { PreConditionCheck }
