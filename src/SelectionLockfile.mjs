/**
 * SelectionLockfile — generate + read + diff selection.lock.json files.
 *
 * Per the grading spec:
 *   - Defines the selection.lock.json lockfile contract.
 *
 * Layout:
 *   grading-data/
 *   └── selection/
 *       └── <selectionId>/
 *           ├── selection.json          # source
 *           └── selection.lock.json     # snapshot
 *
 * Reference + override (on-top, non-mutating):
 *   A selection member references a flat-base schema by schemaId and MAY carry an
 *   optional `override` layer. The override is applied on-top at selection level only:
 *   it adapts the presented tool `name` / `description` WITHOUT mutating the frozen
 *   schema snapshot. Because the override is part of selection.json, it flows into the
 *   selectionHash; the schemaHash of the referenced snapshot stays untouched. Only the
 *   whitelisted keys are accepted (see OVERRIDE_WHITELIST).
 *
 * NO SILENT DEFAULTS. Static methods only, object params, object returns.
 */

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'

import { HashGenerator } from './HashGenerator.mjs'


const OVERRIDE_WHITELIST = Object.freeze( [ 'name', 'description' ] )


class SelectionLockfile {
    static async generate( { gradingDataRoot, selectionId } ) {
        const { status, messages } = SelectionLockfile.#validation( { gradingDataRoot, selectionId } )
        if( !status ) { return { lockfilePath: null, lockfile: null, errors: messages } }

        const selectionDir = join( gradingDataRoot, 'selection', selectionId )
        const selectionPath = join( selectionDir, 'selection.json' )
        const lockfilePath = join( selectionDir, 'selection.lock.json' )

        const selRead = await SelectionLockfile.#readJson( { path: selectionPath } )
        if( selRead.errors.length > 0 ) {
            const code = selRead.notFound ? 'LCK-002' : 'LCK-003'
            const reformatted = selRead.errors
                .map( ( e ) => e.replace( /^LCK-\d{3}/, code ) )
            return { lockfilePath: null, lockfile: null, errors: reformatted }
        }

        const selectionJson = selRead.json
        if( !Array.isArray( selectionJson.members ) ) {
            return {
                lockfilePath: null,
                lockfile: null,
                errors: [ 'LCK-003: selection.json malformed: members[] missing' ]
            }
        }

        const overrideErrors = selectionJson.members
            .flatMap( ( m ) => {
                if( m.override === undefined || m.override === null ) { return [] }
                const check = SelectionLockfile.validateOverride( { override: m.override } )
                return check.valid
                    ? []
                    : check.errors.map( ( e ) => `${e} (member ${m.schemaId})` )
            } )
        if( overrideErrors.length > 0 ) {
            return { lockfilePath: null, lockfile: null, errors: overrideErrors }
        }

        const memberStatuses = await Promise.all(
            selectionJson.members
                .map( async ( m ) => {
                    const override = m.override === undefined ? null : m.override
                    const psPath = join( gradingDataRoot, 'phase-status', 'single', `${SelectionLockfile.#asNamespaceTool( { schemaId: m.schemaId } )}.json` )
                    const psRead = await SelectionLockfile.#readJson( { path: psPath } )
                    if( psRead.errors.length > 0 ) {
                        return {
                            schemaId: m.schemaId,
                            schemaVersion: null,
                            schemaHash: null,
                            gradingStatus: 'pending',
                            override
                        }
                    }
                    return {
                        schemaId: m.schemaId,
                        schemaVersion: psRead.json.schemaVersion === undefined ? null : psRead.json.schemaVersion,
                        schemaHash: psRead.json.schemaHash === undefined ? null : psRead.json.schemaHash,
                        gradingStatus: psRead.json.gradingStatus === undefined ? 'pending' : psRead.json.gradingStatus,
                        override
                    }
                } )
        )

        const selectionHashResult = HashGenerator.computeSelectionHash( { selection: selectionJson } )
        if( selectionHashResult.errors.length > 0 ) {
            return {
                lockfilePath: null,
                lockfile: null,
                errors: selectionHashResult.errors
                    .map( ( e ) => `LCK-004: Lockfile generation failed: ${e}` )
            }
        }

        const lockfile = {
            selectionId,
            selectionVersion: selectionJson.selectionVersion === undefined ? null : selectionJson.selectionVersion,
            selectionHash: selectionHashResult.hash,
            generatedAt: new Date().toISOString(),
            members: memberStatuses
        }

        await mkdir( selectionDir, { recursive: true } )

        const existed = await SelectionLockfile.#fileExists( { path: lockfilePath } )
        const warnings = existed ? [ 'LCK-WARN-001: Lockfile already exists — overwriting with new state' ] : []

        await writeFile( lockfilePath, JSON.stringify( lockfile, null, 4 ), 'utf-8' )

        return { lockfilePath, lockfile, errors: warnings }
    }


    static async read( { gradingDataRoot, selectionId } ) {
        const { status, messages } = SelectionLockfile.#validation( { gradingDataRoot, selectionId } )
        if( !status ) { return { lockfile: null, errors: messages } }

        const lockfilePath = join( gradingDataRoot, 'selection', selectionId, 'selection.lock.json' )
        const read = await SelectionLockfile.#readJson( { path: lockfilePath } )
        if( read.errors.length > 0 ) {
            return { lockfile: null, errors: read.errors }
        }

        return { lockfile: read.json, errors: [] }
    }


    static diff( { oldLockfile, newLockfile } ) {
        if( oldLockfile === undefined || oldLockfile === null ) {
            return { changedMembers: [], addedMembers: [], removedMembers: [], errors: [ 'LCK-001: Required field missing: oldLockfile' ] }
        }
        if( newLockfile === undefined || newLockfile === null ) {
            return { changedMembers: [], addedMembers: [], removedMembers: [], errors: [ 'LCK-001: Required field missing: newLockfile' ] }
        }
        if( !Array.isArray( oldLockfile.members ) || !Array.isArray( newLockfile.members ) ) {
            return { changedMembers: [], addedMembers: [], removedMembers: [], errors: [ 'LCK-003: Lockfile members[] not an array' ] }
        }

        const oldMap = new Map(
            oldLockfile.members.map( ( m ) => [ m.schemaId, m ] )
        )
        const newMap = new Map(
            newLockfile.members.map( ( m ) => [ m.schemaId, m ] )
        )

        const addedMembers = [ ...newMap.keys() ]
            .filter( ( id ) => !oldMap.has( id ) )

        const removedMembers = [ ...oldMap.keys() ]
            .filter( ( id ) => !newMap.has( id ) )

        const changedMembers = [ ...newMap.keys() ]
            .filter( ( id ) => oldMap.has( id ) )
            .filter( ( id ) => {
                const o = oldMap.get( id )
                const n = newMap.get( id )
                return o.schemaHash !== n.schemaHash
                    || o.schemaVersion !== n.schemaVersion
                    || o.gradingStatus !== n.gradingStatus
            } )

        return { changedMembers, addedMembers, removedMembers, errors: [] }
    }


    static validateOverride( { override } ) {
        const errors = []

        if( override === undefined || override === null ) {
            errors.push( 'LCK-001: Required field missing: override' )
            return { valid: false, errors }
        }
        if( typeof override !== 'object' || Array.isArray( override ) ) {
            errors.push( `LCK-005: Invalid override: expected object, got ${Array.isArray( override ) ? 'array' : typeof override}` )
            return { valid: false, errors }
        }

        const keys = Object.keys( override )
        if( keys.length === 0 ) {
            errors.push( 'LCK-005: Invalid override: empty object — at least one of name/description required' )
            return { valid: false, errors }
        }

        const unknownKeys = keys
            .filter( ( key ) => !OVERRIDE_WHITELIST.includes( key ) )
        unknownKeys
            .forEach( ( key ) => {
                errors.push( `LCK-005: Invalid override key: ${key} (allowed: ${OVERRIDE_WHITELIST.join( ', ' )})` )
            } )

        keys
            .filter( ( key ) => OVERRIDE_WHITELIST.includes( key ) )
            .filter( ( key ) => typeof override[ key ] !== 'string' )
            .forEach( ( key ) => {
                errors.push( `LCK-005: Invalid override value for ${key}: expected string, got ${typeof override[ key ]}` )
            } )

        return { valid: errors.length === 0, errors }
    }


    static #asNamespaceTool( { schemaId } ) {
        // schemaId convention: '<namespace>.<tool>' → '<namespace>--<tool>'
        return schemaId.replace( /\./g, '--' )
    }


    static async #readJson( { path } ) {
        try {
            const content = await readFile( path, 'utf-8' )
            try {
                const parsed = JSON.parse( content )
                return { json: parsed, errors: [], notFound: false }
            } catch( parseError ) {
                return { json: null, errors: [ `LCK-003: JSON parse error at ${path}: ${parseError.message}` ], notFound: false }
            }
        } catch( ioError ) {
            return { json: null, errors: [ `LCK-002: File not found: ${path}` ], notFound: true }
        }
    }


    static async #fileExists( { path } ) {
        try {
            await stat( path )
            return true
        } catch( e ) {
            return false
        }
    }


    static #validation( { gradingDataRoot, selectionId } ) {
        const messages = []
        const struct = { status: false, messages }

        const pairs = [
            [ 'gradingDataRoot', gradingDataRoot, 'string' ],
            [ 'selectionId', selectionId, 'string' ]
        ]
        pairs
            .forEach( ( [ key, value, type ] ) => {
                if( value === undefined || value === null ) {
                    messages.push( `LCK-001: Required field missing: ${key}` )
                    return
                }
                if( type === 'string' && typeof value !== 'string' ) {
                    messages.push( `LCK-001: Type mismatch for field ${key}: expected string, got ${typeof value}` )
                }
            } )

        if( messages.length > 0 ) { return struct }

        struct.status = true
        return struct
    }
}


export { SelectionLockfile }
