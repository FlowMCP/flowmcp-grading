/**
 * ErrorCodes — PREFIX-NUMBER error catalog for the flowmcp-grading repo.
 *
 * Twelve prefixes:
 *   GRD-* — Grading-System (data model, tier, re-grading)
 *   SCO-* — Scoring-System (dimensions, score range, aggregation)
 *   VET-* — Veto (closed trigger list, evidence requirement)
 *   HSH-* — HashGenerator (canonical JSON + sha256 8-char prefix)
 *   SNP-* — SourceSnapshot (frozen schema snapshots, NO-OVERWRITE)
 *   PRT-* — PartialGrading (gradingMode, mandatory sequence)
 *   STB-* — StablePromotion (stable/pending gate)
 *   LCK-* — SelectionLockfile (lockfile generator/reader)
 *   PRE-* — PreConditionCheck (universal stable-gate)
 *   SEL-* — Selection-Validator S1-S4
 *   BMP-* — BumpHelper (diff + bump-rule)
 *   SCN-* — FolderScanner (grading-data/ structure check)
 *   ABT-* — AboutConsistencyCheck (text-vs-schema)
 *   SL-*  — SharedLists (loader + hash + filename)
 *   NA-*  — NaReason (closed-set n/a-Reason validator)
 *
 * Code format (strict):
 *   ERROR    → ^[A-Z]{3}-\d{3}$           (e.g. GRD-001)
 *   WARNING  → ^[A-Z]{3}-WARN-\d{3}$      (e.g. GRD-WARN-001)
 *   INFO     → ^[A-Z]{3}-INFO-\d{3}$      (e.g. GRD-INFO-001)
 *
 * Inventory:
 *
 * | Code            | Severity | Trigger                                       |
 * |-----------------|----------|-----------------------------------------------|
 * | GRD-001         | ERROR    | Required field missing                        |
 * | GRD-002         | ERROR    | Type mismatch                                 |
 * | GRD-003         | ERROR    | Invalid gradingTier                           |
 * | GRD-004         | ERROR    | selectionId required when group-bound         |
 * | GRD-005         | ERROR    | personaIds required when non-deterministic    |
 * | GRD-006         | ERROR    | previousGradingId required for regrading      |
 * | GRD-007         | ERROR    | llmModel required for graderIdentity.kind=llm |
 * | GRD-WARN-001    | WARNING  | Entry exceeds retention threshold             |
 * | GRD-INFO-001    | INFO     | Re-grading triggered, previous preserved      |
 * | SCO-001         | ERROR    | Score out of range                            |
 * | SCO-002         | ERROR    | Unknown dimension                             |
 * | SCO-003         | ERROR    | Invalid score enum                            |
 * | SCO-004         | ERROR    | weight must be positive float                 |
 * | SCO-WARN-001    | WARNING  | Score stale due to aging                      |
 * | SCO-INFO-001    | INFO     | Dimension set to n/a per pragma               |
 * | VET-001         | ERROR    | Invalid veto trigger                          |
 * | VET-002         | ERROR    | evidence required for categoricalVeto         |
 * | VET-003         | ERROR    | reasoning required for ai-security-veto       |
 * | VET-004         | ERROR    | graderIdentity required for categoricalVeto   |
 * | VET-INFO-001    | INFO     | Entry marked as REJECTED via categoricalVeto  |
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
            message: 'Dimension `{dimension}` set to `n/a` per the n/a pragma'
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
    } ),
    HSH: Object.freeze( {
        'HSH-001': Object.freeze( {
            code: 'HSH-001',
            severity: 'ERROR',
            message: 'Required field missing: {field}'
        } ),
        'HSH-002': Object.freeze( {
            code: 'HSH-002',
            severity: 'ERROR',
            message: 'Type mismatch for field {field}: expected {expected}, got {actual}'
        } ),
        'HSH-003': Object.freeze( {
            code: 'HSH-003',
            severity: 'ERROR',
            message: 'Invalid value: {detail}'
        } ),
        'HSH-004': Object.freeze( {
            code: 'HSH-004',
            severity: 'ERROR',
            message: 'Hash computation failed: {detail}'
        } ),
        'HSH-WARN-001': Object.freeze( {
            code: 'HSH-WARN-001',
            severity: 'WARNING',
            message: 'Empty input — hash defaulted to all zeros'
        } )
    } ),
    SNP: Object.freeze( {
        'SNP-001': Object.freeze( {
            code: 'SNP-001',
            severity: 'ERROR',
            message: 'Required field missing: {field}'
        } ),
        'SNP-002': Object.freeze( {
            code: 'SNP-002',
            severity: 'ERROR',
            message: 'Type mismatch for field {field}: expected {expected}, got {actual}'
        } ),
        'SNP-003': Object.freeze( {
            code: 'SNP-003',
            severity: 'ERROR',
            message: 'Invalid value: {detail}'
        } ),
        'SNP-004': Object.freeze( {
            code: 'SNP-004',
            severity: 'ERROR',
            message: 'Snapshot conflict — target file exists with different content'
        } ),
        'SNP-005': Object.freeze( {
            code: 'SNP-005',
            severity: 'ERROR',
            message: 'Source file not readable: {path}'
        } )
    } ),
    PRT: Object.freeze( {
        'PRT-001': Object.freeze( {
            code: 'PRT-001',
            severity: 'ERROR',
            message: 'Required field missing: {field}'
        } ),
        'PRT-002': Object.freeze( {
            code: 'PRT-002',
            severity: 'ERROR',
            message: 'Invalid gradingMode: {value} (expected `partial` or `full`)'
        } ),
        'PRT-003': Object.freeze( {
            code: 'PRT-003',
            severity: 'ERROR',
            message: 'First grading entry must be gradingMode: full'
        } ),
        'PRT-004': Object.freeze( {
            code: 'PRT-004',
            severity: 'ERROR',
            message: 'Partial entry changed aggregateGrade from {previous} to {current}'
        } ),
        'PRT-WARN-001': Object.freeze( {
            code: 'PRT-WARN-001',
            severity: 'WARNING',
            message: 'Partial entry has empty gradings[]'
        } )
    } ),
    STB: Object.freeze( {
        'STB-001': Object.freeze( {
            code: 'STB-001',
            severity: 'ERROR',
            message: 'Required field missing: {field}'
        } ),
        'STB-002': Object.freeze( {
            code: 'STB-002',
            severity: 'ERROR',
            message: 'Type mismatch for field {field}: expected {expected}, got {actual}'
        } ),
        'STB-003': Object.freeze( {
            code: 'STB-003',
            severity: 'ERROR',
            message: 'Invalid threshold: {value} (expected one of [A, B, C, D, F])'
        } ),
        'STB-WARN-001': Object.freeze( {
            code: 'STB-WARN-001',
            severity: 'WARNING',
            message: 'Stable-Promotion blocked: last grading entry is partial'
        } ),
        'STB-WARN-002': Object.freeze( {
            code: 'STB-WARN-002',
            severity: 'WARNING',
            message: 'Stable-Promotion blocked: aggregateGrade below threshold'
        } )
    } ),
    LCK: Object.freeze( {
        'LCK-001': Object.freeze( {
            code: 'LCK-001',
            severity: 'ERROR',
            message: 'Required field missing: {field}'
        } ),
        'LCK-002': Object.freeze( {
            code: 'LCK-002',
            severity: 'ERROR',
            message: 'selection.json not found: {path}'
        } ),
        'LCK-003': Object.freeze( {
            code: 'LCK-003',
            severity: 'ERROR',
            message: 'selection.json malformed: {detail}'
        } ),
        'LCK-004': Object.freeze( {
            code: 'LCK-004',
            severity: 'ERROR',
            message: 'Lockfile generation failed: {detail}'
        } ),
        'LCK-WARN-001': Object.freeze( {
            code: 'LCK-WARN-001',
            severity: 'WARNING',
            message: 'Lockfile already exists — overwriting with new state'
        } )
    } ),
    PRE: Object.freeze( {
        'PRE-001': Object.freeze( {
            code: 'PRE-001',
            severity: 'ERROR',
            message: 'Required field missing: {field}'
        } ),
        'PRE-002': Object.freeze( {
            code: 'PRE-002',
            severity: 'ERROR',
            message: 'Lockfile not readable: {path}'
        } ),
        'PRE-003': Object.freeze( {
            code: 'PRE-003',
            severity: 'ERROR',
            message: 'Lockfile format invalid: {detail}'
        } ),
        'PRE-004': Object.freeze( {
            code: 'PRE-004',
            severity: 'ERROR',
            message: 'Pre-Condition not met: missing stable single-gradings: {list}'
        } ),
        'PRE-WARN-001': Object.freeze( {
            code: 'PRE-WARN-001',
            severity: 'WARNING',
            message: 'Lockfile is empty — no members to check'
        } )
    } ),
    SEL: Object.freeze( {
        'SEL-S1': Object.freeze( {
            code: 'SEL-S1',
            severity: 'ERROR',
            message: 'Selection S1 (Member-Coverage) violation: {detail}'
        } ),
        'SEL-S2': Object.freeze( {
            code: 'SEL-S2',
            severity: 'ERROR',
            message: 'Selection S2 (Lockfile-Consistency) violation: {detail}'
        } ),
        'SEL-S3': Object.freeze( {
            code: 'SEL-S3',
            severity: 'ERROR',
            message: 'Selection S3 (Skills-Coverage) violation: {detail}'
        } ),
        'SEL-S4': Object.freeze( {
            code: 'SEL-S4',
            severity: 'ERROR',
            message: 'Selection S4 (Persona-Reference-Coherence) violation: {detail}'
        } )
    } ),
    BMP: Object.freeze( {
        'BMP-001': Object.freeze( {
            code: 'BMP-001',
            severity: 'ERROR',
            message: 'Required field missing: {field}'
        } ),
        'BMP-002': Object.freeze( {
            code: 'BMP-002',
            severity: 'ERROR',
            message: 'Type mismatch for field {field}: expected {expected}, got {actual}'
        } ),
        'BMP-003': Object.freeze( {
            code: 'BMP-003',
            severity: 'ERROR',
            message: 'Invalid schema/selection — not parsable: {detail}'
        } ),
        'BMP-WARN-001': Object.freeze( {
            code: 'BMP-WARN-001',
            severity: 'WARNING',
            message: 'Bump-Rule violation: same schemaVersion with different schemaHashes'
        } ),
        'BMP-INFO-001': Object.freeze( {
            code: 'BMP-INFO-001',
            severity: 'INFO',
            message: 'No diff detected — bump: none'
        } )
    } ),
    SCN: Object.freeze( {
        'SCN-001': Object.freeze( {
            code: 'SCN-001',
            severity: 'ERROR',
            message: 'gradingDataRoot does not exist: {path}'
        } ),
        'SCN-002': Object.freeze( {
            code: 'SCN-002',
            severity: 'ERROR',
            message: 'namespace.json missing: {path}'
        } ),
        'SCN-003': Object.freeze( {
            code: 'SCN-003',
            severity: 'ERROR',
            message: 'namespace.json malformed: {detail}'
        } ),
        'SCN-004': Object.freeze( {
            code: 'SCN-004',
            severity: 'ERROR',
            message: 'Orphan schema snapshot — hash not in namespace.json: {hash}'
        } ),
        'SCN-005': Object.freeze( {
            code: 'SCN-005',
            severity: 'ERROR',
            message: 'Hash-Mismatch — filename hash != recomputed hash: {detail}'
        } ),
        'SCN-006': Object.freeze( {
            code: 'SCN-006',
            severity: 'WARNING',
            message: 'About-Page-Hash does not match namespace.json#aboutHash'
        } ),
        'SCN-007': Object.freeze( {
            code: 'SCN-007',
            severity: 'ERROR',
            message: 'Dangling single-folder — no matching tool in namespace.json: {path}'
        } ),
        'SCN-008': Object.freeze( {
            code: 'SCN-008',
            severity: 'ERROR',
            message: 'Dangling selection-folder — selection.json missing: {path}'
        } ),
        'SCN-009': Object.freeze( {
            code: 'SCN-009',
            severity: 'ERROR',
            message: 'Lockfile-Consistency error (delegated): {detail}'
        } ),
        'SCN-010': Object.freeze( {
            code: 'SCN-010',
            severity: 'WARNING',
            message: 'phase-status references non-existent schemaHash: {hash}'
        } )
    } ),
    ABT: Object.freeze( {
        'ABT-001': Object.freeze( {
            code: 'ABT-001',
            severity: 'ERROR',
            message: 'Required field missing: {field}'
        } ),
        'ABT-002': Object.freeze( {
            code: 'ABT-002',
            severity: 'ERROR',
            message: 'About file not found: {path}'
        } ),
        'ABT-003': Object.freeze( {
            code: 'ABT-003',
            severity: 'ERROR',
            message: 'namespace.json malformed: {detail}'
        } ),
        'ABT-004': Object.freeze( {
            code: 'ABT-004',
            severity: 'ERROR',
            message: 'Tool name missing in About-Text: {toolName}'
        } ),
        'ABT-WARN-001': Object.freeze( {
            code: 'ABT-WARN-001',
            severity: 'WARNING',
            message: 'Description keyword overlap below threshold: {detail}'
        } )
    } ),
    SL: Object.freeze( {
        'SL-001': Object.freeze( {
            code: 'SL-001',
            severity: 'ERROR',
            message: 'Required field missing: {field}'
        } ),
        'SL-002': Object.freeze( {
            code: 'SL-002',
            severity: 'ERROR',
            message: 'Type mismatch for field {field}: expected {expected}, got {actual}'
        } ),
        'SL-003': Object.freeze( {
            code: 'SL-003',
            severity: 'ERROR',
            message: 'Invalid shared-list filename or path: {detail}'
        } )
    } ),
    NA: Object.freeze( {
        'NA-001': Object.freeze( {
            code: 'NA-001',
            severity: 'ERROR',
            message: 'naReason missing or outside closed-set: {detail}'
        } )
    } )
} )


const CODE_FORMAT_REGEX = /^[A-Z]{2,3}(-WARN|-INFO)?-(\d{3}|S\d)$/
const VALID_PREFIXES = [ 'GRD', 'SCO', 'VET', 'HSH', 'SNP', 'PRT', 'STB', 'LCK', 'PRE', 'SEL', 'BMP', 'SCN', 'ABT', 'SL', 'NA' ]
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
            errors.push( `Invalid code format: ${code} (expected ^[A-Z]{2,3}(-WARN|-INFO)?-(\\d{3}|S\\d)$)` )
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
