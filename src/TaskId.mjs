/**
 * TaskId — pure generator/parser for the multidimensional grading Task-ID.
 *
 * A Task-ID lets one grading handover carry a *set* of areas instead of a single
 * area. The format is additive to the existing `schemaIdSlug`:
 *
 *   taskId       := schemaIdSlug "--" areaSetHash
 *   areaSetHash  := 8*HEXDIG
 *
 * The area set is order-independent and duplicate-free: the unique area names are
 * sorted ascending before hashing, so [A,B], [B,A] and [A,A,B] all produce the
 * same hash (a set, not a list). The hash reuses HashGenerator.computeHash for
 * determinism and the `--` prefix-convention consistency — no new hashing
 * algorithm is introduced.
 *
 * Hard rules (binding):
 *   - static methods only, object parameters, object returns
 *   - private-by-default (# prefix) for all helpers
 *   - NO silent defaults — an invalid area / malformed tail raises a TID-* error
 *   - NO for/while loops, NO then/catch
 *   - schemaIdSlug is never mutated (strictly additive)
 *
 * Error prefix TID-* (TaskId):
 *   TID-001 — Required parameter missing
 *   TID-002 — Type mismatch for parameter
 *   TID-003 — Parameter must not be empty
 *   TID-004 — Invalid area (not in the area whitelist)
 *   TID-005 — Hash computation failed (delegated from HashGenerator)
 *   TID-006 — Malformed Task-ID (no `--` separator)
 *   TID-007 — Malformed area-set hash tail (not 8-hex)
 */

import { HashGenerator, HASH_REGEX } from './HashGenerator.mjs'
import { VALID_AREAS } from './PromptBuilder.mjs'


const SEPARATOR = '--'


class TaskId {
    static generate( { schemaIdSlug, areas } ) {
        const { status, messages } = TaskId.#validationGenerate( { schemaIdSlug, areas } )
        if( !status ) { return { taskId: null, areaSetHash: null, errors: messages } }

        const canonicalSet = [ ...new Set( areas ) ].sort()
        const computed = HashGenerator.computeHash( { value: canonicalSet } )
        if( computed.errors.length > 0 ) {
            return {
                taskId: null,
                areaSetHash: null,
                errors: [ `TID-005: Hash computation failed: ${computed.errors.join( '; ' )}` ]
            }
        }

        const areaSetHash = computed.hash
        const taskId = `${schemaIdSlug}${SEPARATOR}${areaSetHash}`

        return { taskId, areaSetHash, errors: [] }
    }


    static parse( { taskId } ) {
        const { status, messages } = TaskId.#validationTaskId( { taskId } )
        if( !status ) { return { schemaIdSlug: null, areaSetHash: null, errors: messages } }

        const lastIndex = taskId.lastIndexOf( SEPARATOR )
        if( lastIndex === -1 ) {
            return {
                schemaIdSlug: null,
                areaSetHash: null,
                errors: [ `TID-006: Malformed Task-ID (no '--' separator): ${taskId}` ]
            }
        }

        const schemaIdSlug = taskId.slice( 0, lastIndex )
        const areaSetHash = taskId.slice( lastIndex + SEPARATOR.length )

        if( schemaIdSlug.length === 0 ) {
            return {
                schemaIdSlug: null,
                areaSetHash: null,
                errors: [ `TID-003: Parameter must not be empty: schemaIdSlug (in ${taskId})` ]
            }
        }
        if( HASH_REGEX.test( areaSetHash ) === false ) {
            return {
                schemaIdSlug: null,
                areaSetHash: null,
                errors: [ `TID-007: Malformed area-set hash tail (not 8-hex): ${areaSetHash}` ]
            }
        }

        return { schemaIdSlug, areaSetHash, errors: [] }
    }


    static matchesAreaSet( { taskId, areas } ) {
        const parsed = TaskId.parse( { taskId } )
        if( parsed.errors.length > 0 ) { return { ok: false, errors: parsed.errors } }

        const regenerated = TaskId.generate( { schemaIdSlug: parsed.schemaIdSlug, areas } )
        if( regenerated.errors.length > 0 ) { return { ok: false, errors: regenerated.errors } }

        return { ok: regenerated.areaSetHash === parsed.areaSetHash, errors: [] }
    }


    static #validationGenerate( { schemaIdSlug, areas } ) {
        const messages = []
        const struct = { status: false, messages }

        if( schemaIdSlug === undefined || schemaIdSlug === null ) {
            messages.push( 'TID-001: Required field missing: schemaIdSlug' )
        } else if( typeof schemaIdSlug !== 'string' ) {
            messages.push( `TID-002: Type mismatch for field schemaIdSlug: expected string, got ${typeof schemaIdSlug}` )
        } else if( schemaIdSlug.length === 0 ) {
            messages.push( 'TID-003: Parameter must not be empty: schemaIdSlug' )
        }

        if( areas === undefined || areas === null ) {
            messages.push( 'TID-001: Required field missing: areas' )
        } else if( !Array.isArray( areas ) ) {
            messages.push( `TID-002: Type mismatch for field areas: expected array, got ${typeof areas}` )
        } else if( areas.length === 0 ) {
            messages.push( 'TID-003: Parameter must not be empty: areas' )
        } else {
            areas
                .forEach( ( area, idx ) => {
                    if( typeof area !== 'string' ) {
                        messages.push( `TID-002: Type mismatch for field areas[${idx}]: expected string, got ${typeof area}` )
                        return
                    }
                    if( !VALID_AREAS.includes( area ) ) {
                        messages.push( `TID-004: Invalid area: ${area} (expected one of [${VALID_AREAS.join( ', ' )}])` )
                    }
                } )
        }

        if( messages.length > 0 ) { return struct }

        struct.status = true
        return struct
    }


    static #validationTaskId( { taskId } ) {
        const messages = []
        const struct = { status: false, messages }

        if( taskId === undefined || taskId === null ) {
            messages.push( 'TID-001: Required field missing: taskId' )
            return struct
        }
        if( typeof taskId !== 'string' ) {
            messages.push( `TID-002: Type mismatch for field taskId: expected string, got ${typeof taskId}` )
            return struct
        }
        if( taskId.length === 0 ) {
            messages.push( 'TID-003: Parameter must not be empty: taskId' )
            return struct
        }

        struct.status = true
        return struct
    }
}


export { TaskId }
