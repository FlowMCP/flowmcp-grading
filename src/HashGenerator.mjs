/**
 * HashGenerator — deterministic canonical-JSON + sha256-prefix hashing.
 *
 * Per the grading spec (neutrality / B3):
 *   - The hash is the stable identifier for a schema / selection / namespace.
 *   - It is a pure compute: every method only RETURNS a hash string. The hash
 *     sink is the versioned filename and the derived index.json — it is NEVER
 *     written back into the neutral source body (computeSchemaHash /
 *     computeSelectionHash even strip any pre-existing schemaHash/selectionHash
 *     before hashing so a stale in-source value cannot drift the result).
 *
 * Algorithm:
 *   1. canonicalize(value) — sorted-key, no-whitespace JSON, undefined removed
 *   2. sha256(canonical(value)).slice(0, 8) — 8-hex-char prefix
 *
 * NO SILENT DEFAULTS. Static methods only, object params, object returns.
 */

import { createHash } from 'node:crypto'


const HASH_FAMILY_FIELDS = Object.freeze( {
    schema: 'schemaHash',
    selection: 'selectionHash'
} )

const HASH_LENGTH = 8
const HASH_REGEX = /^[0-9a-f]{8}$/


class HashGenerator {
    static canonicalize( { value } ) {
        const { status, messages } = HashGenerator.#validationCanonicalize( { value } )
        if( !status ) { return { json: null, errors: messages } }

        const result = HashGenerator.#canonicalizeRecursive( { value } )
        if( result.errors.length > 0 ) {
            return { json: null, errors: result.errors }
        }

        return { json: result.json, errors: [] }
    }


    static computeHash( { value } ) {
        const { status, messages } = HashGenerator.#validationCanonicalize( { value } )
        if( !status ) { return { hash: null, errors: messages } }

        const canonical = HashGenerator.canonicalize( { value } )
        if( canonical.errors.length > 0 ) {
            return { hash: null, errors: canonical.errors }
        }

        const fullHash = createHash( 'sha256' )
            .update( canonical.json )
            .digest( 'hex' )

        return { hash: fullHash.slice( 0, HASH_LENGTH ), errors: [] }
    }


    static computeSchemaHash( { schema } ) {
        const { status, messages } = HashGenerator.#validationSchemaObject( { schema, key: 'schema' } )
        if( !status ) { return { hash: null, errors: messages } }

        const cleaned = HashGenerator.#omitField( {
            obj: schema,
            field: HASH_FAMILY_FIELDS.schema
        } )

        return HashGenerator.computeHash( { value: cleaned } )
    }


    static computeSelectionHash( { selection } ) {
        const { status, messages } = HashGenerator.#validationSchemaObject( { schema: selection, key: 'selection' } )
        if( !status ) { return { hash: null, errors: messages } }

        const cleaned = HashGenerator.#omitField( {
            obj: selection,
            field: HASH_FAMILY_FIELDS.selection
        } )

        return HashGenerator.computeHash( { value: cleaned } )
    }


    static computeNamespaceHash( { members, aboutHash } ) {
        const { status, messages } = HashGenerator.#validationNamespaceHash( { members, aboutHash } )
        if( !status ) { return { hash: null, errors: messages } }

        const payload = { members, aboutHash }
        return HashGenerator.computeHash( { value: payload } )
    }


    static isValidHash( { hash } ) {
        if( hash === undefined || hash === null ) { return { valid: false } }
        if( typeof hash !== 'string' ) { return { valid: false } }
        return { valid: HASH_REGEX.test( hash ) }
    }


    static #canonicalizeRecursive( { value } ) {
        if( value === null ) {
            return { json: 'null', errors: [] }
        }
        if( value === undefined ) {
            // undefined values are skipped at object level. At root, raise HSH-003.
            return { json: null, errors: [ 'HSH-003: Invalid value: undefined cannot be canonicalized at root' ] }
        }

        const valueType = typeof value
        if( valueType === 'string' ) {
            return { json: JSON.stringify( value ), errors: [] }
        }
        if( valueType === 'number' ) {
            if( !Number.isFinite( value ) ) {
                return { json: null, errors: [ `HSH-003: Invalid value: number not finite (${value})` ] }
            }
            return { json: JSON.stringify( value ), errors: [] }
        }
        if( valueType === 'boolean' ) {
            return { json: value === true ? 'true' : 'false', errors: [] }
        }
        if( valueType === 'function' ) {
            return { json: null, errors: [ 'HSH-004: Hash computation failed: functions are not serialisable' ] }
        }
        if( valueType === 'bigint' ) {
            return { json: null, errors: [ 'HSH-004: Hash computation failed: bigint is not serialisable' ] }
        }

        if( Array.isArray( value ) ) {
            const childResults = value
                .map( ( item ) => HashGenerator.#canonicalizeRecursive( { value: item } ) )
            const childErrors = childResults
                .reduce( ( acc, r ) => acc.concat( r.errors ), [] )
            if( childErrors.length > 0 ) {
                return { json: null, errors: childErrors }
            }
            const joined = childResults
                .map( ( r ) => r.json === null ? 'null' : r.json )
                .join( ',' )
            return { json: `[${joined}]`, errors: [] }
        }

        // object
        const keys = Object.keys( value ).sort()
        const childResults = keys
            .map( ( key ) => {
                const child = value[ key ]
                if( child === undefined ) {
                    // skip undefined-values at object level
                    return { key, skip: true, json: null, errors: [] }
                }
                const sub = HashGenerator.#canonicalizeRecursive( { value: child } )
                return { key, skip: false, json: sub.json, errors: sub.errors }
            } )

        const childErrors = childResults
            .reduce( ( acc, r ) => acc.concat( r.errors ), [] )
        if( childErrors.length > 0 ) {
            return { json: null, errors: childErrors }
        }

        const entries = childResults
            .filter( ( r ) => !r.skip )
            .map( ( r ) => `${JSON.stringify( r.key )}:${r.json}` )

        return { json: `{${entries.join( ',' )}}`, errors: [] }
    }


    static #omitField( { obj, field } ) {
        const keys = Object.keys( obj )
            .filter( ( key ) => key !== field )

        return keys
            .reduce( ( acc, key ) => {
                acc[ key ] = obj[ key ]
                return acc
            }, {} )
    }


    static #validationCanonicalize( { value } ) {
        const messages = []
        const struct = { status: false, messages }

        if( value === undefined ) {
            messages.push( 'HSH-001: Required field missing: value' )
            return struct
        }

        struct.status = true
        return struct
    }


    static #validationSchemaObject( { schema, key } ) {
        const messages = []
        const struct = { status: false, messages }

        if( schema === undefined || schema === null ) {
            messages.push( `HSH-001: Required field missing: ${key}` )
            return struct
        }
        if( typeof schema !== 'object' || Array.isArray( schema ) ) {
            messages.push( `HSH-002: Type mismatch for field ${key}: expected object, got ${Array.isArray( schema ) ? 'array' : typeof schema}` )
            return struct
        }

        struct.status = true
        return struct
    }


    static #validationNamespaceHash( { members, aboutHash } ) {
        const messages = []
        const struct = { status: false, messages }

        if( members === undefined || members === null ) {
            messages.push( 'HSH-001: Required field missing: members' )
            return struct
        }
        if( !Array.isArray( members ) ) {
            messages.push( `HSH-002: Type mismatch for field members: expected array, got ${typeof members}` )
            return struct
        }
        if( aboutHash === undefined || aboutHash === null ) {
            messages.push( 'HSH-001: Required field missing: aboutHash' )
            return struct
        }
        if( typeof aboutHash !== 'string' ) {
            messages.push( `HSH-002: Type mismatch for field aboutHash: expected string, got ${typeof aboutHash}` )
            return struct
        }

        struct.status = true
        return struct
    }
}


export { HashGenerator, HASH_LENGTH, HASH_REGEX }
