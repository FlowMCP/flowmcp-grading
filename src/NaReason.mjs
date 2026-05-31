/**
 * NaReason — closed-set validator for `gradings[i].naReason` fields.
 *
 * Per the grading spec (08-grading-model §5.3 n/a convention):
 *   - A score of `n/a` is only allowed with a naReason from the closed set.
 *
 * Closed set of six allowed `naReason` values (exactly the spec §5.3 set). Any
 * free-text reason is rejected with NA-001. Additional values can only be added
 * through a spec bump, so no `not-applicable-to-selection` is introduced here.
 * The validator is static, takes object params, returns object — NO SILENT
 * DEFAULTS.
 */


const ALLOWED_NA_REASONS = Object.freeze( [
    'not-applicable-to-tool-type',
    'requires-private-data',
    'blocked-by-precondition',
    'out-of-scope-resource',
    'out-of-scope-prompt',
    'out-of-scope-procedure'
] )


class NaReason {
    static getAllowed() {
        return { allowed: ALLOWED_NA_REASONS.slice() }
    }


    static isAllowed( { naReason } ) {
        if( typeof naReason !== 'string' ) { return { allowed: false } }
        return { allowed: ALLOWED_NA_REASONS.includes( naReason ) }
    }


    static validate( { grade, naReason } ) {
        const messages = []
        const struct = { status: false, messages }

        if( grade === undefined || grade === null ) {
            messages.push( 'NA-001: Required field missing: grade' )
            return struct
        }
        if( typeof grade !== 'string' ) {
            messages.push( `NA-001: Type mismatch for field grade: expected string, got ${typeof grade}` )
            return struct
        }

        if( grade !== 'n/a' ) {
            struct.status = true
            return struct
        }

        if( naReason === undefined || naReason === null ) {
            messages.push( 'NA-001: naReason required when grade === "n/a"' )
            return struct
        }
        if( typeof naReason !== 'string' ) {
            messages.push( `NA-001: Type mismatch for field naReason: expected string, got ${typeof naReason}` )
            return struct
        }
        if( !ALLOWED_NA_REASONS.includes( naReason ) ) {
            messages.push( `NA-001: naReason "${naReason}" not in closed-set (allowed: ${ALLOWED_NA_REASONS.join( ', ' )})` )
            return struct
        }

        struct.status = true
        return struct
    }
}


export { NaReason, ALLOWED_NA_REASONS }
