/**
 * ErrorCodes — PREFIX-NUMBER error catalog for the flowmcp-grading repo.
 *
 * Three prefixes match the three core components:
 *   GRD-* — Grading-System (data model, tier, re-grading)
 *   SCO-* — Scoring-System (dimensions, score range, aggregation)
 *   VET-* — Veto (closed trigger list, evidence requirement)
 *
 * Code format (strict):
 *   ERROR    → ^[A-Z]{3}-\d{3}$           (e.g. GRD-001)
 *   WARNING  → ^[A-Z]{3}-WARN-\d{3}$      (e.g. GRD-WARN-001)
 *   INFO     → ^[A-Z]{3}-INFO-\d{3}$      (e.g. GRD-INFO-001)
 *
 * Inventory:
 *
 * | Code            | Severity | Trigger                                       | Memo Ref |
 * |-----------------|----------|-----------------------------------------------|----------|
 * | GRD-001         | ERROR    | Required field missing                        | Kap 7    |
 * | GRD-002         | ERROR    | Type mismatch                                 | Kap 7    |
 * | GRD-003         | ERROR    | Invalid gradingTier                           | Z. 263   |
 * | GRD-004         | ERROR    | selectionId required when group-bound         | Z. 263   |
 * | GRD-005         | ERROR    | personaIds required when non-deterministic    | Z. 311   |
 * | GRD-006         | ERROR    | previousGradingId required for regrading      | Z. 307   |
 * | GRD-007         | ERROR    | llmModel required for graderIdentity.kind=llm | Z. 273   |
 * | GRD-WARN-001    | WARNING  | Entry exceeds retention threshold             | Z. 302   |
 * | GRD-INFO-001    | INFO     | Re-grading triggered, previous preserved      | Z. 307   |
 * | SCO-001         | ERROR    | Score out of range                            | Z. 269   |
 * | SCO-002         | ERROR    | Unknown dimension                             | Z. 268   |
 * | SCO-003         | ERROR    | Invalid score enum                            | Z. 269   |
 * | SCO-004         | ERROR    | weight must be positive float                 | Z. 269   |
 * | SCO-WARN-001    | WARNING  | Score stale due to aging                      | Z. 302   |
 * | SCO-INFO-001    | INFO     | Dimension set to n/a per pragma               | Z. 309   |
 * | VET-001         | ERROR    | Invalid veto trigger                          | Z. 279   |
 * | VET-002         | ERROR    | evidence required for categoricalVeto         | Z. 281   |
 * | VET-003         | ERROR    | reasoning required for ai-security-veto       | Z. 373   |
 * | VET-004         | ERROR    | graderIdentity required for categoricalVeto   | Z. 281   |
 * | VET-INFO-001    | INFO     | Entry marked as REJECTED via categoricalVeto  | Z. 281   |
 */

const ERROR_CODE_TABLE = Object.freeze( {
    GRD: Object.freeze( {
        'GRD-001': Object.freeze( {
            code: 'GRD-001',
            severity: 'ERROR',
            message: 'Required field missing: {field}'
        } ),
        'GRD-002': Object.freeze( {
            code: 'GRD-002',
            severity: 'ERROR',
            message: 'Type mismatch for field {field}: expected {expected}, got {actual}'
        } ),
        'GRD-003': Object.freeze( {
            code: 'GRD-003',
            severity: 'ERROR',
            message: 'Invalid gradingTier: {value} (expected `autonomous` or `group-bound`)'
        } ),
        'GRD-004': Object.freeze( {
            code: 'GRD-004',
            severity: 'ERROR',
            message: 'selectionId required when gradingTier=group-bound'
        } ),
        'GRD-005': Object.freeze( {
            code: 'GRD-005',
            severity: 'ERROR',
            message: 'personaIds[] required when determinism=non-deterministic'
        } ),
        'GRD-006': Object.freeze( {
            code: 'GRD-006',
            severity: 'ERROR',
            message: 'previousGradingId required when applying regradingTrigger'
        } ),
        'GRD-007': Object.freeze( {
            code: 'GRD-007',
            severity: 'ERROR',
            message: 'llmModel required when graderIdentity.kind=llm'
        } ),
        'GRD-WARN-001': Object.freeze( {
            code: 'GRD-WARN-001',
            severity: 'WARNING',
            message: 'Grading entry exceeds retention threshold of {days} days'
        } ),
        'GRD-INFO-001': Object.freeze( {
            code: 'GRD-INFO-001',
            severity: 'INFO',
            message: 'Re-grading triggered by {triggeredBy}; previous entry preserved'
        } )
    } ),
    SCO: Object.freeze( {
        'SCO-001': Object.freeze( {
            code: 'SCO-001',
            severity: 'ERROR',
            message: 'Score out of range: {value} (expected 1.0-5.0 or enum)'
        } ),
        'SCO-002': Object.freeze( {
            code: 'SCO-002',
            severity: 'ERROR',
            message: 'Unknown dimension: {dimension} (not in dimension enum)'
        } ),
        'SCO-003': Object.freeze( {
            code: 'SCO-003',
            severity: 'ERROR',
            message: 'Invalid score enum: {value} (expected `pass`/`fail`/`stale`/`n/a`)'
        } ),
        'SCO-004': Object.freeze( {
            code: 'SCO-004',
            severity: 'ERROR',
            message: 'weight must be a positive float, got {value}'
        } ),
        'SCO-WARN-001': Object.freeze( {
            code: 'SCO-WARN-001',
            severity: 'WARNING',
            message: 'Score is `stale` due to aging threshold ({days} days)'
        } ),
        'SCO-INFO-001': Object.freeze( {
            code: 'SCO-INFO-001',
            severity: 'INFO',
            message: 'Dimension `{dimension}` set to `n/a` per pragma — Memo 054'
        } )
    } ),
    VET: Object.freeze( {
        'VET-001': Object.freeze( {
            code: 'VET-001',
            severity: 'ERROR',
            message: 'Invalid veto trigger: {value} (expected one of [malicious-module, api-key-domain-mismatch, illegal-content, ai-security-veto])'
        } ),
        'VET-002': Object.freeze( {
            code: 'VET-002',
            severity: 'ERROR',
            message: 'evidence required for categoricalVeto'
        } ),
        'VET-003': Object.freeze( {
            code: 'VET-003',
            severity: 'ERROR',
            message: 'reasoning required for ai-security-veto trigger'
        } ),
        'VET-004': Object.freeze( {
            code: 'VET-004',
            severity: 'ERROR',
            message: 'graderIdentity required for categoricalVeto'
        } ),
        'VET-INFO-001': Object.freeze( {
            code: 'VET-INFO-001',
            severity: 'INFO',
            message: 'Entry marked as REJECTED due to categoricalVeto.triggeredBy={trigger}'
        } )
    } )
} )


const CODE_FORMAT_REGEX = /^[A-Z]{3}(-WARN|-INFO)?-\d{3}$/
const VALID_PREFIXES = [ 'GRD', 'SCO', 'VET' ]
const VALID_SEVERITIES = [ 'ERROR', 'WARNING', 'INFO' ]


class ErrorCodes {
    static getCode( { code } ) {
        const { status, messages } = ErrorCodes.#validationGetCode( { code } )
        if( !status ) { return { entry: null, found: false, errors: messages } }

        const allEntries = ErrorCodes.#flattenTable()
        const match = allEntries
            .find( ( item ) => item.code === code )

        if( match === undefined ) {
            return { entry: null, found: false }
        }

        return { entry: match, found: true }
    }


    static formatMessage( { code, context } ) {
        const { status, messages } = ErrorCodes.#validationFormatMessage( { code, context } )
        if( !status ) { return { message: null, errors: messages } }

        const lookup = ErrorCodes.getCode( { code } )
        if( !lookup.found ) {
            return { message: null, errors: [ `GRD-002: Type mismatch for field code: expected known code, got ${code}` ] }
        }

        const template = lookup.entry.message
        const rendered = template
            .replace( /\{(\w+)\}/g, ( _, key ) => {
                if( Object.prototype.hasOwnProperty.call( context, key ) ) {
                    return String( context[ key ] )
                }
                return `{${key}}`
            } )

        return { message: rendered }
    }


    static listByPrefix( { prefix } ) {
        const { status, messages } = ErrorCodes.#validationListByPrefix( { prefix } )
        if( !status ) { return { codes: [], errors: messages } }

        const branch = ERROR_CODE_TABLE[ prefix ]
        const codes = Object
            .values( branch )
            .map( ( entry ) => entry.code )

        return { codes }
    }


    static listBySeverity( { severity } ) {
        const { status, messages } = ErrorCodes.#validationListBySeverity( { severity } )
        if( !status ) { return { codes: [], errors: messages } }

        const allEntries = ErrorCodes.#flattenTable()
        const codes = allEntries
            .filter( ( entry ) => entry.severity === severity )
            .map( ( entry ) => entry.code )

        return { codes }
    }


    static validateCodeFormat( { code } ) {
        const errors = []
        if( code === undefined || code === null ) {
            errors.push( 'GRD-001: Required field missing: code' )
            return { valid: false, errors }
        }
        if( typeof code !== 'string' ) {
            errors.push( `GRD-002: Type mismatch for field code: expected string, got ${typeof code}` )
            return { valid: false, errors }
        }

        const matches = CODE_FORMAT_REGEX.test( code )
        if( !matches ) {
            errors.push( `Invalid code format: ${code} (expected ^[A-Z]{3}(-WARN|-INFO)?-\\d{3}$)` )
            return { valid: false, errors }
        }

        return { valid: true, errors: [] }
    }


    static #flattenTable() {
        return VALID_PREFIXES
            .map( ( prefix ) => Object.values( ERROR_CODE_TABLE[ prefix ] ) )
            .reduce( ( acc, list ) => acc.concat( list ), [] )
    }


    static #validationGetCode( { code } ) {
        const messages = []
        const struct = { status: false, messages }

        if( code === undefined || code === null ) {
            messages.push( 'GRD-001: Required field missing: code' )
            return struct
        }
        if( typeof code !== 'string' ) {
            messages.push( `GRD-002: Type mismatch for field code: expected string, got ${typeof code}` )
            return struct
        }

        struct.status = true
        return struct
    }


    static #validationFormatMessage( { code, context } ) {
        const messages = []
        const struct = { status: false, messages }

        const pairs = [
            [ 'code', code, 'string' ],
            [ 'context', context, 'object' ]
        ]

        pairs
            .forEach( ( [ key, value, type ] ) => {
                if( value === undefined || value === null ) {
                    messages.push( `GRD-001: Required field missing: ${key}` )
                    return
                }
                if( type === 'object' && ( typeof value !== 'object' || Array.isArray( value ) ) ) {
                    messages.push( `GRD-002: Type mismatch for field ${key}: expected object, got ${Array.isArray( value ) ? 'array' : typeof value}` )
                    return
                }
                if( type === 'string' && typeof value !== 'string' ) {
                    messages.push( `GRD-002: Type mismatch for field ${key}: expected string, got ${typeof value}` )
                }
            } )

        if( messages.length > 0 ) { return struct }

        struct.status = true
        return struct
    }


    static #validationListByPrefix( { prefix } ) {
        const messages = []
        const struct = { status: false, messages }

        if( prefix === undefined || prefix === null ) {
            messages.push( 'GRD-001: Required field missing: prefix' )
            return struct
        }
        if( typeof prefix !== 'string' ) {
            messages.push( `GRD-002: Type mismatch for field prefix: expected string, got ${typeof prefix}` )
            return struct
        }
        if( !VALID_PREFIXES.includes( prefix ) ) {
            messages.push( `Unknown prefix: ${prefix} (expected one of [${VALID_PREFIXES.join( ', ' )}])` )
            return struct
        }

        struct.status = true
        return struct
    }


    static #validationListBySeverity( { severity } ) {
        const messages = []
        const struct = { status: false, messages }

        if( severity === undefined || severity === null ) {
            messages.push( 'GRD-001: Required field missing: severity' )
            return struct
        }
        if( typeof severity !== 'string' ) {
            messages.push( `GRD-002: Type mismatch for field severity: expected string, got ${typeof severity}` )
            return struct
        }
        if( !VALID_SEVERITIES.includes( severity ) ) {
            messages.push( `Unknown severity: ${severity} (expected one of [${VALID_SEVERITIES.join( ', ' )}])` )
            return struct
        }

        struct.status = true
        return struct
    }
}


export { ErrorCodes, ERROR_CODE_TABLE }
