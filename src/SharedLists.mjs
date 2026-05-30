/**
 * SharedLists — loader + hash binding for shared-lists/.
 *
 * Per the grading spec:
 *   - Shared lists are secondary in-scope.
 *   - Folder layout: `shared-lists/<listname>/<hash>--v<X.Y.Z>.json`.
 *   - Naming convention: `<hash>--v<X.Y.Z>.json`.
 *
 * Hash pipeline reuses HashGenerator: canonical JSON + sha256(8).
 * Bump rule: any list-entry change -> Patch bump.
 *
 * NO SILENT DEFAULTS. Static methods only, object params, object returns.
 */

import { readFile, readdir } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { HashGenerator, HASH_REGEX } from './HashGenerator.mjs'


const SHARED_LIST_FILENAME_REGEX = /^([0-9a-f]{8})--v(\d+\.\d+\.\d+)\.json$/


class SharedLists {
    static hash( { list } ) {
        const messages = []
        if( list === undefined || list === null ) {
            messages.push( 'SL-001: Required field missing: list' )
            return { hash: null, errors: messages }
        }
        if( typeof list !== 'object' ) {
            messages.push( `SL-002: Type mismatch for field list: expected object, got ${typeof list}` )
            return { hash: null, errors: messages }
        }

        const result = HashGenerator.computeHash( { value: list } )
        if( result.errors.length > 0 ) {
            return { hash: null, errors: result.errors }
        }

        return { hash: result.hash, errors: [] }
    }


    static validateFilename( { filename } ) {
        const messages = []
        if( filename === undefined || filename === null ) {
            messages.push( 'SL-001: Required field missing: filename' )
            return { status: false, messages }
        }
        if( typeof filename !== 'string' ) {
            messages.push( `SL-002: Type mismatch for field filename: expected string, got ${typeof filename}` )
            return { status: false, messages }
        }

        const matched = SHARED_LIST_FILENAME_REGEX.exec( filename )
        if( matched === null ) {
            messages.push( `SL-003: Invalid shared-list filename: ${filename} (expected <hash>--v<X.Y.Z>.json)` )
            return { status: false, messages }
        }

        return { status: true, messages: [], hash: matched[ 1 ], version: matched[ 2 ] }
    }


    static async load( { gradingDataRoot, listname } ) {
        const messages = []
        if( gradingDataRoot === undefined || gradingDataRoot === null ) {
            messages.push( 'SL-001: Required field missing: gradingDataRoot' )
            return { list: null, hash: null, version: null, errors: messages }
        }
        if( listname === undefined || listname === null ) {
            messages.push( 'SL-001: Required field missing: listname' )
            return { list: null, hash: null, version: null, errors: messages }
        }
        if( typeof gradingDataRoot !== 'string' || typeof listname !== 'string' ) {
            messages.push( 'SL-002: Type mismatch — gradingDataRoot and listname must be strings' )
            return { list: null, hash: null, version: null, errors: messages }
        }

        const listDir = join( gradingDataRoot, 'shared-lists', listname )
        if( !existsSync( listDir ) || !statSync( listDir ).isDirectory() ) {
            messages.push( `SL-003: shared-lists directory not found: ${listDir}` )
            return { list: null, hash: null, version: null, errors: messages }
        }

        const files = await readdir( listDir )
        const candidates = files
            .map( ( filename ) => {
                const v = SharedLists.validateFilename( { filename } )
                return { filename, valid: v.status, hash: v.hash, version: v.version }
            } )
            .filter( ( entry ) => entry.valid === true )

        if( candidates.length === 0 ) {
            messages.push( `SL-003: no valid shared-list files in ${listDir}` )
            return { list: null, hash: null, version: null, errors: messages }
        }

        const latest = candidates
            .slice()
            .sort( ( a, b ) => SharedLists.#compareSemver( { a: a.version, b: b.version } ) )
            .pop()

        const fileContent = await readFile( join( listDir, latest.filename ), 'utf-8' )
        let parsed = null
        try {
            parsed = JSON.parse( fileContent )
        } catch( error ) {
            messages.push( `SL-003: shared-list JSON malformed: ${latest.filename} (${error.message})` )
            return { list: null, hash: null, version: null, errors: messages }
        }

        return { list: parsed, hash: latest.hash, version: latest.version, errors: [] }
    }


    static #compareSemver( { a, b } ) {
        const partsA = a.split( '.' ).map( ( v ) => parseInt( v, 10 ) )
        const partsB = b.split( '.' ).map( ( v ) => parseInt( v, 10 ) )
        const len = Math.max( partsA.length, partsB.length )
        const sequence = Array.from( { length: len }, ( _, i ) => i )

        const diff = sequence
            .map( ( i ) => ( partsA[ i ] || 0 ) - ( partsB[ i ] || 0 ) )
            .find( ( d ) => d !== 0 )

        return diff === undefined ? 0 : diff
    }
}


export { SharedLists, SHARED_LIST_FILENAME_REGEX }
