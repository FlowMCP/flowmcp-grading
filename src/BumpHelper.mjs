/**
 * BumpHelper — diff-based bump-rule application for schemas and selections.
 *
 * Memo 080 anchors:
 *   Kap 10 — Bump-Tabellen (schemaVersion + selectionVersion)
 *   Z. 448 — Same schemaVersion + different schemaHash = bump rule violation
 *
 * NO SILENT DEFAULTS. Static methods only, object params, object returns.
 */


const BUMP_ORDER = Object.freeze( {
    major: 3,
    minor: 2,
    patch: 1,
    none: 0
} )


class BumpHelper {
    static diffSchemas( { oldSchema, newSchema } ) {
        const { status, messages } = BumpHelper.#validationDiff( { oldSchema, newSchema, key: 'schema' } )
        if( !status ) { return { bump: null, reasons: [], errors: messages } }

        const reasons = []

        const oldTools = oldSchema.tools === undefined ? {} : oldSchema.tools
        const newTools = newSchema.tools === undefined ? {} : newSchema.tools
        const oldToolNames = Object.keys( oldTools ).sort()
        const newToolNames = Object.keys( newTools ).sort()

        // tool-renamed: when count is identical but names differ in both directions
        const removedTools = oldToolNames.filter( ( n ) => !newToolNames.includes( n ) )
        const addedTools = newToolNames.filter( ( n ) => !oldToolNames.includes( n ) )

        if( removedTools.length > 0 && addedTools.length > 0 && removedTools.length === addedTools.length ) {
            reasons.push( { category: 'tool-renamed', detail: `${removedTools.join( ',' )} -> ${addedTools.join( ',' )}`, bump: 'major' } )
        } else {
            if( removedTools.length > 0 ) {
                reasons.push( { category: 'tool-removed', detail: removedTools.join( ',' ), bump: 'major' } )
            }
            if( addedTools.length > 0 ) {
                reasons.push( { category: 'tool-added', detail: addedTools.join( ',' ), bump: 'minor' } )
            }
        }

        // Per-tool diff for shared names
        const sharedTools = oldToolNames.filter( ( n ) => newToolNames.includes( n ) )
        sharedTools
            .forEach( ( name ) => {
                const oldTool = oldTools[ name ]
                const newTool = newTools[ name ]

                // description
                const oldDesc = oldTool.description === undefined ? '' : oldTool.description
                const newDesc = newTool.description === undefined ? '' : newTool.description
                if( oldDesc !== newDesc ) {
                    const classification = BumpHelper.#classifyDescription( { oldDesc, newDesc } )
                    if( classification.kind === 'semantic' ) {
                        reasons.push( { category: 'tool-description-semantic', detail: `${name}: ${classification.detail}`, bump: 'minor' } )
                    } else if( classification.kind === 'stylistic' ) {
                        reasons.push( { category: 'tool-description-stylistic', detail: `${name}: ${classification.detail}`, bump: 'patch' } )
                    }
                }

                // parameters
                const paramDiff = BumpHelper.#diffParameters( { oldParams: oldTool.parameters, newParams: newTool.parameters, toolName: name } )
                paramDiff.forEach( ( r ) => reasons.push( r ) )

                // outputs
                const outputDiff = BumpHelper.#diffOutputs( { oldOutput: oldTool.output, newOutput: newTool.output, toolName: name } )
                outputDiff.forEach( ( r ) => reasons.push( r ) )
            } )

        // requiredServerParams
        const oldRsp = Array.isArray( oldSchema.requiredServerParams ) ? oldSchema.requiredServerParams.slice().sort() : []
        const newRsp = Array.isArray( newSchema.requiredServerParams ) ? newSchema.requiredServerParams.slice().sort() : []
        if( oldRsp.join( ',' ) !== newRsp.join( ',' ) ) {
            reasons.push( { category: 'required-server-params-changed', detail: `${oldRsp.join( ',' )} -> ${newRsp.join( ',' )}`, bump: 'minor' } )
        }

        // schema-level description
        if( oldSchema.description !== newSchema.description ) {
            const classification = BumpHelper.#classifyDescription( {
                oldDesc: oldSchema.description === undefined ? '' : oldSchema.description,
                newDesc: newSchema.description === undefined ? '' : newSchema.description
            } )
            if( classification.kind === 'semantic' ) {
                reasons.push( { category: 'tool-description-semantic', detail: `schema.description: ${classification.detail}`, bump: 'minor' } )
            } else if( classification.kind === 'stylistic' ) {
                reasons.push( { category: 'tool-description-stylistic', detail: `schema.description: ${classification.detail}`, bump: 'patch' } )
            }
        }

        const bump = BumpHelper.#highestBump( { reasons } )
        return { bump, reasons, errors: bump === 'none' ? [ 'BMP-INFO-001: No diff detected — bump: none' ] : [] }
    }


    static diffSelections( { oldSelection, newSelection } ) {
        const { status, messages } = BumpHelper.#validationDiff( { oldSchema: oldSelection, newSchema: newSelection, key: 'selection' } )
        if( !status ) { return { bump: null, reasons: [], errors: messages } }

        const reasons = []

        const oldMembers = Array.isArray( oldSelection.members ) ? oldSelection.members.map( ( m ) => m.schemaId ).sort() : []
        const newMembers = Array.isArray( newSelection.members ) ? newSelection.members.map( ( m ) => m.schemaId ).sort() : []
        const removedMembers = oldMembers.filter( ( id ) => !newMembers.includes( id ) )
        const addedMembers = newMembers.filter( ( id ) => !oldMembers.includes( id ) )

        if( removedMembers.length > 0 ) {
            reasons.push( { category: 'member-removed', detail: removedMembers.join( ',' ), bump: 'major' } )
        }
        if( addedMembers.length > 0 ) {
            reasons.push( { category: 'member-added', detail: addedMembers.join( ',' ), bump: 'minor' } )
        }

        // personaIds: any change → major (per memo bump-table)
        const oldPersonas = Array.isArray( oldSelection.personaIds ) ? oldSelection.personaIds.slice().sort() : []
        const newPersonas = Array.isArray( newSelection.personaIds ) ? newSelection.personaIds.slice().sort() : []
        if( oldPersonas.join( ',' ) !== newPersonas.join( ',' ) ) {
            reasons.push( { category: 'persona-list-changed', detail: `${oldPersonas.join( ',' )} -> ${newPersonas.join( ',' )}`, bump: 'major' } )
        }

        // skills
        const oldSkills = Array.isArray( oldSelection.skills ) ? oldSelection.skills.slice().sort() : []
        const newSkills = Array.isArray( newSelection.skills ) ? newSelection.skills.slice().sort() : []
        if( oldSkills.join( ',' ) !== newSkills.join( ',' ) ) {
            if( newSkills.length > oldSkills.length ) {
                reasons.push( { category: 'skills-extended', detail: `${oldSkills.length} -> ${newSkills.length}`, bump: 'minor' } )
            } else {
                reasons.push( { category: 'skill-implementation-changed', detail: 'skill list changed', bump: 'patch' } )
            }
        }

        // description
        if( oldSelection.description !== newSelection.description ) {
            const classification = BumpHelper.#classifyDescription( {
                oldDesc: oldSelection.description === undefined ? '' : oldSelection.description,
                newDesc: newSelection.description === undefined ? '' : newSelection.description
            } )
            if( classification.kind === 'semantic' ) {
                reasons.push( { category: 'description-semantic', detail: classification.detail, bump: 'minor' } )
            } else if( classification.kind === 'stylistic' ) {
                reasons.push( { category: 'description-stylistic', detail: classification.detail, bump: 'patch' } )
            }
        }

        const bump = BumpHelper.#highestBump( { reasons } )
        return { bump, reasons, errors: bump === 'none' ? [ 'BMP-INFO-001: No diff detected — bump: none' ] : [] }
    }


    static checkVersionHashConsistency( { snapshots } ) {
        if( snapshots === undefined || snapshots === null ) {
            return { violations: [], errors: [ 'BMP-001: Required field missing: snapshots' ] }
        }
        if( !Array.isArray( snapshots ) ) {
            return { violations: [], errors: [ 'BMP-002: Type mismatch for field snapshots: expected array' ] }
        }

        const byVersion = snapshots
            .reduce( ( acc, snap ) => {
                const v = snap.schemaVersion
                if( v === undefined || v === null ) { return acc }
                if( acc[ v ] === undefined ) { acc[ v ] = new Set() }
                if( snap.schemaHash !== undefined && snap.schemaHash !== null ) {
                    acc[ v ].add( snap.schemaHash )
                }
                return acc
            }, {} )

        const violations = Object.keys( byVersion )
            .filter( ( v ) => byVersion[ v ].size > 1 )
            .map( ( v ) => ( { schemaVersion: v, hashes: [ ...byVersion[ v ] ].sort() } ) )

        const warnings = violations
            .map( ( v ) => `BMP-WARN-001: Bump-Rule violation: same schemaVersion ${v.schemaVersion} with different schemaHashes [${v.hashes.join( ', ' )}]` )

        return { violations, errors: warnings }
    }


    static #classifyDescription( { oldDesc, newDesc } ) {
        const normOld = oldDesc.replace( /\s+/g, ' ' ).trim().toLowerCase()
        const normNew = newDesc.replace( /\s+/g, ' ' ).trim().toLowerCase()
        if( normOld === normNew ) {
            return { kind: 'none', detail: 'whitespace-only' }
        }

        // Token-extraction: strip punctuation, drop tokens < 4 chars
        const tokenize = ( text ) => text
            .split( /\s+/ )
            .map( ( w ) => w.replace( /[^a-z0-9]/g, '' ) )
            .filter( ( w ) => w.length >= 4 )

        const oldWords = new Set( tokenize( normOld ) )
        const newWords = new Set( tokenize( normNew ) )
        const newOnly = [ ...newWords ].filter( ( w ) => !oldWords.has( w ) )

        if( newOnly.length === 0 ) {
            return { kind: 'stylistic', detail: 'word order / punctuation only' }
        }

        return { kind: 'semantic', detail: `new keywords: ${newOnly.slice( 0, 5 ).join( ', ' )}` }
    }


    static #diffParameters( { oldParams, newParams, toolName } ) {
        const oldArr = BumpHelper.#paramsAsArray( { params: oldParams } )
        const newArr = BumpHelper.#paramsAsArray( { params: newParams } )

        const oldNames = oldArr.map( ( p ) => p.name )
        const newNames = newArr.map( ( p ) => p.name )

        const removed = oldNames.filter( ( n ) => !newNames.includes( n ) )
        const added = newNames.filter( ( n ) => !oldNames.includes( n ) )

        const reasons = []

        if( removed.length > 0 && added.length > 0 && removed.length === added.length ) {
            reasons.push( { category: 'param-renamed', detail: `${toolName}: ${removed.join( ',' )} -> ${added.join( ',' )}`, bump: 'major' } )
        } else {
            added
                .forEach( ( n ) => {
                    const param = newArr.find( ( p ) => p.name === n )
                    const required = param !== undefined && param.required === true
                    if( required ) {
                        reasons.push( { category: 'param-added-required', detail: `${toolName}.${n}`, bump: 'major' } )
                    } else {
                        reasons.push( { category: 'param-added-optional', detail: `${toolName}.${n}`, bump: 'minor' } )
                    }
                } )
            removed
                .forEach( ( n ) => {
                    reasons.push( { category: 'param-removed', detail: `${toolName}.${n}`, bump: 'major' } )
                } )
        }

        // shared params: default change check
        const shared = oldNames.filter( ( n ) => newNames.includes( n ) )
        shared
            .forEach( ( n ) => {
                const oldP = oldArr.find( ( p ) => p.name === n )
                const newP = newArr.find( ( p ) => p.name === n )
                if( oldP.default !== newP.default ) {
                    reasons.push( { category: 'param-default-changed', detail: `${toolName}.${n}: ${oldP.default} -> ${newP.default}`, bump: 'minor' } )
                }
            } )

        return reasons
    }


    static #diffOutputs( { oldOutput, newOutput, toolName } ) {
        if( oldOutput === undefined && newOutput === undefined ) { return [] }
        const oldProps = BumpHelper.#extractOutputProps( { output: oldOutput } )
        const newProps = BumpHelper.#extractOutputProps( { output: newOutput } )

        const removed = oldProps.filter( ( n ) => !newProps.includes( n ) )
        const added = newProps.filter( ( n ) => !oldProps.includes( n ) )

        const reasons = []
        if( removed.length > 0 ) {
            reasons.push( { category: 'output-renamed-or-removed', detail: `${toolName}: removed ${removed.join( ',' )}`, bump: 'major' } )
        }
        if( added.length > 0 ) {
            reasons.push( { category: 'output-added', detail: `${toolName}: added ${added.join( ',' )}`, bump: 'minor' } )
        }
        return reasons
    }


    static #paramsAsArray( { params } ) {
        if( params === undefined || params === null ) { return [] }
        if( Array.isArray( params ) ) {
            return params
                .map( ( p ) => ( {
                    name: p.name === undefined ? p.key : p.name,
                    required: p.required,
                    default: p.default
                } ) )
                .filter( ( p ) => p.name !== undefined )
        }
        return Object.keys( params )
            .map( ( name ) => ( {
                name,
                required: params[ name ].required,
                default: params[ name ].default
            } ) )
    }


    static #extractOutputProps( { output } ) {
        if( output === undefined || output === null ) { return [] }
        if( output.schema !== undefined && output.schema.properties !== undefined ) {
            return Object.keys( output.schema.properties ).sort()
        }
        return []
    }


    static #highestBump( { reasons } ) {
        if( reasons.length === 0 ) { return 'none' }
        const sorted = reasons
            .map( ( r ) => BUMP_ORDER[ r.bump ] === undefined ? 0 : BUMP_ORDER[ r.bump ] )
            .sort( ( a, b ) => b - a )
        const highestValue = sorted[ 0 ]
        return Object.keys( BUMP_ORDER )
            .find( ( k ) => BUMP_ORDER[ k ] === highestValue )
    }


    static #validationDiff( { oldSchema, newSchema, key } ) {
        const messages = []
        const struct = { status: false, messages }

        if( oldSchema === undefined || oldSchema === null ) {
            messages.push( `BMP-001: Required field missing: old${key.charAt( 0 ).toUpperCase()}${key.slice( 1 )}` )
            return struct
        }
        if( newSchema === undefined || newSchema === null ) {
            messages.push( `BMP-001: Required field missing: new${key.charAt( 0 ).toUpperCase()}${key.slice( 1 )}` )
            return struct
        }
        if( typeof oldSchema !== 'object' || Array.isArray( oldSchema ) ) {
            messages.push( `BMP-002: Type mismatch for field old${key}: expected object` )
            return struct
        }
        if( typeof newSchema !== 'object' || Array.isArray( newSchema ) ) {
            messages.push( `BMP-002: Type mismatch for field new${key}: expected object` )
            return struct
        }

        struct.status = true
        return struct
    }
}


export { BumpHelper, BUMP_ORDER }
