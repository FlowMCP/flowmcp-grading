/**
 * PreConditionCheck — universal stable-gate shared by Selection-Grading and About-Verification.
 *
 * Per the grading spec:
 *   - Defines the universal pre-condition.
 *   - Step 0 — pre-condition check (mandatory).
 *
 * Rule: aggregated checks are blocked until every member-schema carries
 * gradingStatus: 'stable' in its corresponding phase-status/single/<ns>--<tool>.json.
 *
 * NO SILENT DEFAULTS. Static methods only, object params, object returns.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'


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

        const lockfilePath = join( gradingDataRoot, 'selection', selectionId, 'selection.lock.json' )
        const lockfileRead = await PreConditionCheck.#readLockfile( { path: lockfilePath } )
        if( lockfileRead.errors.length > 0 ) {
            return {
                passed: false,
                blockedMembers: [],
                missingSingleGradings: [],
                errors: lockfileRead.errors
            }
        }

        return PreConditionCheck.checkLockfile( { lockfile: lockfileRead.lockfile } )
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
                errors: [ 'PRE-WARN-001: Lockfile is empty — no members to check' ]
            }
        }

        const blockedMembers = lockfile.members
            .filter( ( m ) => m.gradingStatus !== 'stable' )
            .map( ( m ) => ( {
                schemaId: m.schemaId,
                gradingStatus: m.gradingStatus === undefined ? null : m.gradingStatus,
                missingGrading: m.gradingStatus === undefined || m.gradingStatus === null
            } ) )

        const missingSingleGradings = blockedMembers
            .filter( ( m ) => m.missingGrading || m.gradingStatus === 'pending' )
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


    static async #readLockfile( { path } ) {
        try {
            const content = await readFile( path, 'utf-8' )
            try {
                const parsed = JSON.parse( content )
                return { lockfile: parsed, errors: [] }
            } catch( parseError ) {
                return { lockfile: null, errors: [ `PRE-003: Lockfile format invalid: ${parseError.message}` ] }
            }
        } catch( ioError ) {
            return { lockfile: null, errors: [ `PRE-002: Lockfile not readable: ${path}` ] }
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
            messages.push( 'PRE-003: Lockfile format invalid: expected object' )
            return struct
        }
        if( !Array.isArray( lockfile.members ) ) {
            messages.push( 'PRE-003: Lockfile format invalid: members[] missing' )
            return struct
        }

        struct.status = true
        return struct
    }
}


export { PreConditionCheck }
