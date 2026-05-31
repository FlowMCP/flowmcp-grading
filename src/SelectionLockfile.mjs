/**
 * SelectionLockfile — override validation salvage (gradingSpec/1.2.0).
 *
 * The selection.lock.json LIFECYCLE (generate / read / diff) is DROPPED in v2:
 * there is no standalone lockfile any more — the frozen member pins live in
 * `selections/<sel>/index.json.lockSnapshot`, built by `RebuildIndex` (the
 * salvaged `generate`-body lives there as the lockSnapshot builder).
 *
 * What is SALVAGED and still lives here (RebuildIndex imports `validateOverride`):
 *
 * Reference + override (on-top, non-mutating):
 *   A selection member references a flat-base schema by schemaId and MAY carry an
 *   optional `override` layer. The override is applied on-top at selection level only:
 *   it adapts the presented tool `name` / `description` WITHOUT mutating the frozen
 *   schema snapshot. Only the whitelisted keys are accepted (OVERRIDE_WHITELIST).
 *
 * NO SILENT DEFAULTS. Static methods only, object params, object returns.
 */


const OVERRIDE_WHITELIST = Object.freeze( [ 'name', 'description' ] )


class SelectionLockfile {
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
}


export { SelectionLockfile, OVERRIDE_WHITELIST }
