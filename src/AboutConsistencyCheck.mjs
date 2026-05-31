/**
 * AboutConsistencyCheck — text-vs-schema validator for About Resources.
 *
 * Per the grading spec (gradingSpec/1.2.0 §4 / §11):
 *   - Step 0 (pre-condition) + Step 1 (consistency check).
 *   - The About Resource is a markdown Resource declared in ONE schema of the
 *     namespace, stored at providers/<ns>/<schema>/resources/about/ — NOT a
 *     namespace route and NOT a namespace.json (F24 drops namespace.json).
 *   - A Resource never lives at namespace level, so the detector searches the
 *     About namespace-WIDE (across every schema folder).
 *
 * Checks:
 *   - Every tool-name from the namespace schemas is mentioned in the About-Text
 *   - Description keyword overlap >= threshold (default 0.5)
 *   - Selection-About additionally checks personaIds + domainDocId (Domain-Knowledge)
 *
 * NO SILENT DEFAULTS. Static methods only, object params, object returns.
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { PreConditionCheck } from './PreConditionCheck.mjs'
import { SourceSnapshot } from './SourceSnapshot.mjs'


const DEFAULT_OVERLAP_THRESHOLD = 0.5
const KEYWORD_MIN_LENGTH = 4


class AboutConsistencyCheck {
    static async checkNamespaceAbout( { gradingDataRoot, namespace, keywordOverlapThreshold } ) {
        const { status, messages } = AboutConsistencyCheck.#validationCheckNs( { gradingDataRoot, namespace } )
        if( !status ) { return { passed: false, issues: [], errors: messages } }

        const threshold = keywordOverlapThreshold === undefined ? DEFAULT_OVERLAP_THRESHOLD : keywordOverlapThreshold

        // The About Resource lives in ONE schema; the detector searches namespace-wide
        // across providers/<ns>/<schema>/resources/about/.
        const found = await AboutConsistencyCheck.#findNamespaceAbout( { gradingDataRoot, namespace } )
        if( found === null ) {
            return {
                passed: false,
                issues: [ { code: 'ABT-002', severity: 'error', message: `ABT-002: About Resource not found namespace-wide for ${namespace}` } ],
                errors: []
            }
        }
        const aboutText = await readFile( found.path, 'utf-8' )

        // Collect all tools from the namespace snapshots
        const tools = await AboutConsistencyCheck.#extractTools( { gradingDataRoot, namespace } )

        const issues = []
        const lowerAbout = aboutText.toLowerCase()

        tools
            .forEach( ( tool ) => {
                if( !lowerAbout.includes( tool.name.toLowerCase() ) ) {
                    issues.push( {
                        code: 'ABT-004',
                        severity: 'error',
                        message: `ABT-004: Tool name missing in About-Text: ${tool.name}`
                    } )
                }

                if( typeof tool.description === 'string' && tool.description.length > 0 ) {
                    const overlap = AboutConsistencyCheck.#descriptionOverlap( {
                        schemaDescription: tool.description,
                        aboutText
                    } )
                    if( overlap.ratio < threshold ) {
                        issues.push( {
                            code: 'ABT-WARN-001',
                            severity: 'warning',
                            message: `ABT-WARN-001: Description keyword overlap below threshold for ${tool.name}: ratio=${overlap.ratio.toFixed( 2 )} threshold=${threshold}`
                        } )
                    }
                }
            } )

        const passed = issues.filter( ( i ) => i.severity === 'error' ).length === 0
        return { passed, issues, errors: [] }
    }


    static async checkSelectionAbout( { gradingDataRoot, selectionId, keywordOverlapThreshold } ) {
        const { status, messages } = AboutConsistencyCheck.#validationCheckSelection( { gradingDataRoot, selectionId } )
        if( !status ) { return { passed: false, issues: [], errors: messages } }

        const issues = []

        const selectionDir = join( gradingDataRoot, 'selections', selectionId )
        const selectionDef = await AboutConsistencyCheck.#readSelectionDef( { selectionDir, selectionId } )
        if( selectionDef === null ) {
            return {
                passed: false,
                issues: [ { code: 'ABT-002', severity: 'error', message: `ABT-002: selection definition not readable in ${selectionDir}` } ],
                errors: []
            }
        }
        const selectionJson = selectionDef

        const aboutDir = join( selectionDir, 'resources', 'about' )
        const aboutFiles = await AboutConsistencyCheck.#listFiles( { path: aboutDir } )
        const aboutMd = aboutFiles.find( ( f ) => f.endsWith( '.md' ) )
        if( aboutMd === undefined ) {
            return {
                passed: false,
                issues: [ { code: 'ABT-002', severity: 'error', message: `ABT-002: About Resource not found in ${aboutDir}` } ],
                errors: []
            }
        }
        const aboutText = await readFile( join( aboutDir, aboutMd ), 'utf-8' )
        const lowerAbout = aboutText.toLowerCase()

        const personaIds = Array.isArray( selectionJson.personaIds ) ? selectionJson.personaIds : []
        personaIds
            .forEach( ( pid ) => {
                if( !lowerAbout.includes( pid.toLowerCase() ) ) {
                    issues.push( {
                        code: 'ABT-004',
                        severity: 'error',
                        message: `ABT-004: persona id missing in About-Text: ${pid}`
                    } )
                }
            } )

        const domainDocId = selectionJson.domainDocId
        if( typeof domainDocId === 'string' && !lowerAbout.includes( domainDocId.toLowerCase() ) ) {
            issues.push( {
                code: 'ABT-004',
                severity: 'error',
                message: `ABT-004: domainDocId missing in About-Text: ${domainDocId}`
            } )
        }

        const members = Array.isArray( selectionJson.members ) ? selectionJson.members : []
        members
            .forEach( ( m ) => {
                if( !lowerAbout.includes( m.schemaId.toLowerCase() ) ) {
                    issues.push( {
                        code: 'ABT-004',
                        severity: 'error',
                        message: `ABT-004: member schemaId missing in About-Text: ${m.schemaId}`
                    } )
                }
            } )

        const passed = issues.filter( ( i ) => i.severity === 'error' ).length === 0
        return { passed, issues, errors: [] }
    }


    static async verifyNamespace( { gradingDataRoot, namespace, lockfilePath } ) {
        const { status, messages } = AboutConsistencyCheck.#validationCheckNs( { gradingDataRoot, namespace } )
        if( !status ) {
            return {
                verified: false,
                preConditionPassed: false,
                consistencyPassed: false,
                issues: [],
                errors: messages
            }
        }

        // Step 0 — pre-condition (only when a lockfile is supplied; namespace-level pre-condition is via lockfile)
        let preConditionPassed = true
        let preIssues = []
        if( typeof lockfilePath === 'string' && lockfilePath.length > 0 ) {
            try {
                const raw = await readFile( lockfilePath, 'utf-8' )
                const parsed = JSON.parse( raw )
                // v2: the gate reads index.json.lockSnapshot; accept a raw lockSnapshot
                // object too for direct callers (no silent guess between the two).
                const lockfile = parsed.lockSnapshot !== undefined && parsed.lockSnapshot !== null
                    ? parsed.lockSnapshot
                    : parsed
                const preResult = PreConditionCheck.checkLockfile( { lockfile } )
                preConditionPassed = preResult.passed
                preIssues = preResult.errors
                    .map( ( m ) => ( { code: 'PRE-004', severity: 'error', message: m } ) )
            } catch( e ) {
                preConditionPassed = false
                preIssues = [ { code: 'PRE-002', severity: 'error', message: `PRE-002: Lockfile not readable: ${lockfilePath}` } ]
            }
        }

        // Step 1 — consistency check
        const consResult = await AboutConsistencyCheck.checkNamespaceAbout( { gradingDataRoot, namespace } )
        const consistencyPassed = consResult.passed

        const verified = preConditionPassed && consistencyPassed
        const issues = preIssues.concat( consResult.issues )

        return {
            verified,
            preConditionPassed,
            consistencyPassed,
            issues,
            errors: consResult.errors
        }
    }


    static async #extractTools( { gradingDataRoot, namespace } ) {
        // v2: snapshots live in providers/<ns>/<schema>/schema/ (B2 names). Use the
        // SourceSnapshot listing so the layout stays in one place.
        const listing = await SourceSnapshot.listForNamespace( { gradingDataRoot, namespace } )

        const toolsNested = await Promise.all(
            listing.snapshots.map( async ( snap ) => {
                try {
                    const url = pathToFileURL( snap.path ).href
                    const mod = await import( url )
                    const schemaObj = mod.main !== undefined ? mod.main : mod.schema
                    if( schemaObj === undefined || schemaObj.tools === undefined ) { return [] }
                    return Object.keys( schemaObj.tools )
                        .map( ( toolName ) => ( {
                            name: toolName,
                            description: schemaObj.tools[ toolName ].description
                        } ) )
                } catch( e ) { return [] }
            } )
        )

        const seen = new Set()
        return toolsNested
            .reduce( ( acc, list ) => acc.concat( list ), [] )
            .filter( ( t ) => {
                if( seen.has( t.name ) ) { return false }
                seen.add( t.name )
                return true
            } )
    }


    static async #findNamespaceAbout( { gradingDataRoot, namespace } ) {
        // Namespace-wide search: the About Resource is declared in exactly one schema.
        const namespaceDir = join( gradingDataRoot, 'providers', namespace )
        const schemaNames = await AboutConsistencyCheck.#listDirs( { path: namespaceDir } )

        const found = await schemaNames
            .reduce( async ( prevPromise, schemaName ) => {
                const prev = await prevPromise
                if( prev !== null ) { return prev }
                const aboutDir = join( namespaceDir, schemaName, 'resources', 'about' )
                const files = await AboutConsistencyCheck.#listFiles( { path: aboutDir } )
                const aboutMd = files.find( ( f ) => f.endsWith( '.md' ) )
                if( aboutMd === undefined ) { return null }
                return { schemaName, path: join( aboutDir, aboutMd ) }
            }, Promise.resolve( null ) )

        return found
    }


    static async #readSelectionDef( { selectionDir, selectionId } ) {
        // The selection definition lives under selections/<sel>/selection/ with a
        // B2 filename; fall back to a flat selection.json for back-compat reads.
        const defDir = join( selectionDir, 'selection' )
        const files = await AboutConsistencyCheck.#listFiles( { path: defDir } )
        const defFile = files
            .filter( ( f ) => f.startsWith( `${selectionId}--` ) && f.endsWith( '.json' ) )
            .sort()
            .at( -1 )
        if( defFile !== undefined ) {
            try {
                const raw = await readFile( join( defDir, defFile ), 'utf-8' )
                return JSON.parse( raw )
            } catch( e ) { return null }
        }
        try {
            const raw = await readFile( join( selectionDir, 'selection.json' ), 'utf-8' )
            return JSON.parse( raw )
        } catch( e ) { return null }
    }


    static async #listDirs( { path } ) {
        try {
            const entries = await readdir( path, { withFileTypes: true } )
            return entries
                .filter( ( e ) => e.isDirectory() )
                .map( ( e ) => e.name )
                .sort()
        } catch( e ) { return [] }
    }


    static #descriptionOverlap( { schemaDescription, aboutText } ) {
        const extract = ( text ) => text
            .toLowerCase()
            .split( /\s+/ )
            .map( ( w ) => w.replace( /[^a-z0-9]/g, '' ) )
            .filter( ( w ) => w.length >= KEYWORD_MIN_LENGTH )

        const schemaKeys = new Set( extract( schemaDescription ) )
        const aboutKeys = new Set( extract( aboutText ) )
        const overlap = [ ...schemaKeys ].filter( ( k ) => aboutKeys.has( k ) )
        const ratio = schemaKeys.size === 0 ? 1 : overlap.length / schemaKeys.size
        return { ratio, overlap }
    }


    static async #listFiles( { path } ) {
        try {
            const entries = await readdir( path )
            return entries
        } catch( e ) { return [] }
    }


    static #validationCheckNs( { gradingDataRoot, namespace } ) {
        const messages = []
        const struct = { status: false, messages }

        const pairs = [
            [ 'gradingDataRoot', gradingDataRoot, 'string' ],
            [ 'namespace', namespace, 'string' ]
        ]
        pairs
            .forEach( ( [ key, value, type ] ) => {
                if( value === undefined || value === null ) {
                    messages.push( `ABT-001: Required field missing: ${key}` )
                    return
                }
                if( type === 'string' && typeof value !== 'string' ) {
                    messages.push( `ABT-001: Type mismatch for field ${key}: expected string, got ${typeof value}` )
                }
            } )

        if( messages.length > 0 ) { return struct }

        struct.status = true
        return struct
    }


    static #validationCheckSelection( { gradingDataRoot, selectionId } ) {
        const messages = []
        const struct = { status: false, messages }

        const pairs = [
            [ 'gradingDataRoot', gradingDataRoot, 'string' ],
            [ 'selectionId', selectionId, 'string' ]
        ]
        pairs
            .forEach( ( [ key, value, type ] ) => {
                if( value === undefined || value === null ) {
                    messages.push( `ABT-001: Required field missing: ${key}` )
                    return
                }
                if( type === 'string' && typeof value !== 'string' ) {
                    messages.push( `ABT-001: Type mismatch for field ${key}: expected string, got ${typeof value}` )
                }
            } )

        if( messages.length > 0 ) { return struct }

        struct.status = true
        return struct
    }
}


export { AboutConsistencyCheck, DEFAULT_OVERLAP_THRESHOLD }
