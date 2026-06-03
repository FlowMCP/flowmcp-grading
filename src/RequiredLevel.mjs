/**
 * RequiredLevel — derives a 4-level readiness level from existing signals and
 * compares a level against a required level using a fixed ordered ladder.
 *
 * The level is DERIVED on demand from signals that already exist elsewhere in the
 * grading engine. NO new persisted status field is introduced — this module never
 * writes a level into any grading artifact. The caller (a later phase) supplies
 * the already-computed signals; this module is pure.
 *
 * Ladder (lowest to highest):
 *   imported            — present in the island (import gate passed)
 *   structural-valid    — passes `flowmcp validate` (structure validation)
 *   deterministic-green — structural-valid AND data-pretest ok AND deterministic
 *                         dimensions green (HTTP 200). HTTP 4xx is NEVER a pass.
 *                         The data-pretest `ok` signal encodes the Test-Leiter
 *                         pass bar of >= 2 working tests per tool (Memo 101 Kap. 5,
 *                         DataPretest.DEFAULT_MIN_WORKING_TESTS = 2): a tool at the
 *                         `schema-validatable` rung (2 working) makes the schema
 *                         deterministic-green; 1 working (`reachable`) does NOT.
 *   stable              — full grading promoted to stable (StablePromotion output)
 *
 * Hard rules (binding):
 *   - static methods only, object parameters, object returns
 *   - private-by-default (# prefix) for all helpers
 *   - NO silent defaults — an unresolvable input returns null + an explicit error
 *   - NO for/while loops, NO then/catch
 *
 * Error prefix RLV-* (RequiredLevel):
 *   RLV-001 — Required parameter missing
 *   RLV-002 — Type mismatch for parameter
 *   RLV-003 — Unknown level / requiredLevel (not on the ladder)
 *   RLV-004 — Level cannot be derived from the supplied signals
 *
 * Signal-gathering wrappers (added per PRD-006):
 *   deriveSchemaLevel    — collect one schema's runtime signals, delegate to derive
 *   deriveNamespaceLevel — fold the per-schema levels of a namespace to the LOWEST
 *                          reached level (the namespace is only as ready as its
 *                          weakest schema; this is the Provider-Namespace-Gate
 *                          basis: namespace-areas require deterministic-green on
 *                          ALL schemas)
 */


const LEVEL_LADDER = Object.freeze( [
    'imported',
    'structural-valid',
    'deterministic-green',
    'stable'
] )


class RequiredLevel {
    static getLadder() {
        return { ladder: [ ...LEVEL_LADDER ], errors: [] }
    }


    static derive( { imported, structuralValid, dataPretest, detGreen, gradingStatus } ) {
        const { status, messages } = RequiredLevel.#validationDerive( {
            imported, structuralValid, dataPretest, detGreen, gradingStatus
        } )
        if( !status ) { return { level: null, errors: messages } }

        if( gradingStatus === 'stable' ) {
            return { level: 'stable', errors: [] }
        }

        const dataPretestOk = dataPretest !== undefined && dataPretest !== null && dataPretest.ok === true
        if( structuralValid === true && dataPretestOk === true && detGreen === true ) {
            return { level: 'deterministic-green', errors: [] }
        }

        if( structuralValid === true ) {
            return { level: 'structural-valid', errors: [] }
        }

        if( imported === true ) {
            return { level: 'imported', errors: [] }
        }

        return {
            level: null,
            errors: [ 'RLV-004: Level cannot be derived from the supplied signals (not imported)' ]
        }
    }


    static meets( { level, requiredLevel } ) {
        const { status, messages } = RequiredLevel.#validationMeets( { level, requiredLevel } )
        if( !status ) { return { ok: false, errors: messages } }

        const levelIndex = LEVEL_LADDER.indexOf( level )
        const requiredIndex = LEVEL_LADDER.indexOf( requiredLevel )

        return { ok: levelIndex >= requiredIndex, errors: [] }
    }


    // deriveSchemaLevel — signal-gathering wrapper for ONE schema. Collects the
    // runtime signals (snapshot present, structural validation, DataPretest result,
    // grading status) into the shape `derive` expects, then delegates. The pure
    // ladder logic stays in `derive`; this wrapper only marshals signals. The
    // `imported` signal is `snapshotPresent` (present in the island = import gate
    // passed). NO silent default — every signal is required and explicit.
    static deriveSchemaLevel( { snapshotPresent, structuralValid, dataPretest, detGreen, gradingStatus } ) {
        const { status, messages } = RequiredLevel.#validationDeriveSchemaLevel( {
            snapshotPresent, structuralValid, dataPretest, detGreen, gradingStatus
        } )
        if( !status ) { return { level: null, errors: messages } }

        return RequiredLevel.derive( {
            imported: snapshotPresent,
            structuralValid,
            dataPretest,
            detGreen,
            gradingStatus
        } )
    }


    // deriveNamespaceLevel — fold per-schema levels to the namespace level. The
    // namespace is only as ready as its WEAKEST schema (lowest ladder index). This
    // is the data basis for the Provider-Namespace-Gate: non-deterministic
    // namespace areas require `deterministic-green` on ALL schemas, which holds iff
    // the folded namespace level is at least `deterministic-green`. An empty
    // schema list is an explicit error (a namespace with zero schemas cannot reach
    // any level) — NO silent default.
    static deriveNamespaceLevel( { schemaLevels } ) {
        const { status, messages } = RequiredLevel.#validationNamespaceLevel( { schemaLevels } )
        if( !status ) { return { level: null, errors: messages } }

        const lowestIndex = schemaLevels
            .reduce( ( acc, level ) => {
                const idx = LEVEL_LADDER.indexOf( level )
                return idx < acc ? idx : acc
            }, LEVEL_LADDER.length - 1 )

        return { level: LEVEL_LADDER[ lowestIndex ], errors: [] }
    }


    static #validationDerive( { imported, structuralValid, dataPretest, detGreen, gradingStatus } ) {
        const messages = []
        const struct = { status: false, messages }

        const booleanPairs = [
            [ 'imported', imported ],
            [ 'structuralValid', structuralValid ],
            [ 'detGreen', detGreen ]
        ]
        booleanPairs
            .forEach( ( [ key, value ] ) => {
                if( value === undefined || value === null ) {
                    messages.push( `RLV-001: Required field missing: ${key}` )
                    return
                }
                if( typeof value !== 'boolean' ) {
                    messages.push( `RLV-002: Type mismatch for field ${key}: expected boolean, got ${typeof value}` )
                }
            } )

        if( dataPretest === undefined || dataPretest === null ) {
            messages.push( 'RLV-001: Required field missing: dataPretest' )
        } else if( typeof dataPretest !== 'object' || Array.isArray( dataPretest ) ) {
            messages.push( `RLV-002: Type mismatch for field dataPretest: expected object, got ${Array.isArray( dataPretest ) ? 'array' : typeof dataPretest}` )
        }

        if( gradingStatus === undefined || gradingStatus === null ) {
            messages.push( 'RLV-001: Required field missing: gradingStatus' )
        } else if( typeof gradingStatus !== 'string' ) {
            messages.push( `RLV-002: Type mismatch for field gradingStatus: expected string, got ${typeof gradingStatus}` )
        }

        if( messages.length > 0 ) { return struct }

        struct.status = true
        return struct
    }


    static #validationDeriveSchemaLevel( { snapshotPresent, structuralValid, dataPretest, detGreen, gradingStatus } ) {
        const messages = []
        const struct = { status: false, messages }

        const booleanPairs = [
            [ 'snapshotPresent', snapshotPresent ],
            [ 'structuralValid', structuralValid ],
            [ 'detGreen', detGreen ]
        ]
        booleanPairs
            .forEach( ( [ key, value ] ) => {
                if( value === undefined || value === null ) {
                    messages.push( `RLV-001: Required field missing: ${key}` )
                    return
                }
                if( typeof value !== 'boolean' ) {
                    messages.push( `RLV-002: Type mismatch for field ${key}: expected boolean, got ${typeof value}` )
                }
            } )

        if( dataPretest === undefined || dataPretest === null ) {
            messages.push( 'RLV-001: Required field missing: dataPretest' )
        } else if( typeof dataPretest !== 'object' || Array.isArray( dataPretest ) ) {
            messages.push( `RLV-002: Type mismatch for field dataPretest: expected object, got ${Array.isArray( dataPretest ) ? 'array' : typeof dataPretest}` )
        }

        if( gradingStatus === undefined || gradingStatus === null ) {
            messages.push( 'RLV-001: Required field missing: gradingStatus' )
        } else if( typeof gradingStatus !== 'string' ) {
            messages.push( `RLV-002: Type mismatch for field gradingStatus: expected string, got ${typeof gradingStatus}` )
        }

        if( messages.length > 0 ) { return struct }

        struct.status = true
        return struct
    }


    static #validationNamespaceLevel( { schemaLevels } ) {
        const messages = []
        const struct = { status: false, messages }

        if( schemaLevels === undefined || schemaLevels === null ) {
            messages.push( 'RLV-001: Required field missing: schemaLevels' )
            return struct
        }
        if( !Array.isArray( schemaLevels ) ) {
            messages.push( `RLV-002: Type mismatch for field schemaLevels: expected array, got ${typeof schemaLevels}` )
            return struct
        }
        if( schemaLevels.length === 0 ) {
            messages.push( 'RLV-004: Level cannot be derived from the supplied signals: schemaLevels is empty' )
            return struct
        }

        schemaLevels
            .forEach( ( level, idx ) => {
                if( typeof level !== 'string' ) {
                    messages.push( `RLV-002: Type mismatch for field schemaLevels[${idx}]: expected string, got ${typeof level}` )
                    return
                }
                if( !LEVEL_LADDER.includes( level ) ) {
                    messages.push( `RLV-003: Unknown level: ${level} (expected one of [${LEVEL_LADDER.join( ', ' )}])` )
                }
            } )

        if( messages.length > 0 ) { return struct }

        struct.status = true
        return struct
    }


    static #validationMeets( { level, requiredLevel } ) {
        const messages = []
        const struct = { status: false, messages }

        const pairs = [
            [ 'level', level ],
            [ 'requiredLevel', requiredLevel ]
        ]
        pairs
            .forEach( ( [ key, value ] ) => {
                if( value === undefined || value === null ) {
                    messages.push( `RLV-001: Required field missing: ${key}` )
                    return
                }
                if( typeof value !== 'string' ) {
                    messages.push( `RLV-002: Type mismatch for field ${key}: expected string, got ${typeof value}` )
                    return
                }
                if( !LEVEL_LADDER.includes( value ) ) {
                    messages.push( `RLV-003: Unknown level: ${value} (expected one of [${LEVEL_LADDER.join( ', ' )}])` )
                }
            } )

        if( messages.length > 0 ) { return struct }

        struct.status = true
        return struct
    }
}


export { RequiredLevel, LEVEL_LADDER }
