// Generator for grading-data/schemas/<namespace>/namespace.json.
//
// Reads the schema-snapshot files placed by migrate-080-phase-2.mjs
// (filename convention: <schemaHash>--v<X.Y.Z>.mjs) and emits a deterministic
// namespace.json with members[], namespaceHash (sha256-8 of canonical-JSON of
// members + aboutHash) and aboutHash (PENDING until Phase 4 PRD-21+).
//
// Also creates the about/ placeholder directory (with .gitkeep) per namespace.
//
// Properties:
// - idempotent (rerun produces identical namespace.json)
// - dry-run via --dry-run
// - per-namespace via --namespace=<name>
// - NO-OVERWRITE protection (diff WARN, requires --force to overwrite divergent)
// - no for/while loops


import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'


const __filename = fileURLToPath( import.meta.url )
const __dirname = dirname( __filename )
const REPO_ROOT = resolve( __dirname, '..' )
const SCHEMAS_ROOT_RELATIVE = 'grading-data/schemas'
const SCHEMAS_ROOT_ABSOLUTE = join( REPO_ROOT, SCHEMAS_ROOT_RELATIVE )

const SCHEMA_FILE_REGEX = /^([^-]+(?:-[^-]+)*)--v(\d+\.\d+\.\d+)\.mjs$/


const parseArgs = ( { argv } ) => {
    const dryRun = argv.includes( '--dry-run' )
    const force = argv.includes( '--force' )
    const namespaceArg = argv.find( ( a ) => a.startsWith( '--namespace=' ) )
    const namespace = namespaceArg !== undefined ? namespaceArg.slice( '--namespace='.length ) : null
    return { dryRun, force, namespace }
}


const fileExists = async ( { path } ) => {
    try {
        await stat( path )
        return true
    } catch {
        return false
    }
}


const canonicalStringify = ( { obj } ) => {
    if( obj === null ) { return 'null' }
    if( typeof obj !== 'object' ) { return JSON.stringify( obj ) }
    if( Array.isArray( obj ) === true ) {
        const items = obj.map( ( item ) => canonicalStringify( { obj: item } ) )
        return '[' + items.join( ',' ) + ']'
    }
    const keys = Object.keys( obj ).sort()
    const pairs = keys.map( ( key ) => JSON.stringify( key ) + ':' + canonicalStringify( { obj: obj[ key ] } ) )
    return '{' + pairs.join( ',' ) + '}'
}


const computeNamespaceHash = ( { members, aboutHash } ) => {
    const canonical = canonicalStringify( { obj: { members, aboutHash } } )
    const hash = createHash( 'sha256' ).update( canonical ).digest( 'hex' )
    return hash.slice( 0, 8 )
}


const extractSchemaFromFilename = ( { fileName } ) => {
    const match = fileName.match( SCHEMA_FILE_REGEX )
    if( match === null ) {
        return { matched: false }
    }
    return { matched: true, schemaHash: match[ 1 ], schemaVersion: match[ 2 ] }
}


const tryReadMetaFromSnapshot = async ( { filePath } ) => {
    const content = await readFile( filePath, 'utf-8' )
    const namespaceMatch = content.match( /namespace:\s*'([^']+)'/ )
    const sourcePathMatch = content.match( /\/\/\s*SourcePath:\s*(\S+)/ )
    const sourcePath = sourcePathMatch !== null ? sourcePathMatch[ 1 ] : null
    const toolFromSourcePath = sourcePath !== null
        ? sourcePath.replace( /^.*\/([^/]+)\.mjs$/, '$1' )
        : null
    return {
        namespace: namespaceMatch !== null ? namespaceMatch[ 1 ] : null,
        tool: toolFromSourcePath
    }
}


const buildMember = async ( { namespace, fileName, namespacePath } ) => {
    const { matched, schemaHash, schemaVersion } = extractSchemaFromFilename( { fileName } )
    if( matched === false ) {
        return { matched: false }
    }
    const filePath = join( namespacePath, fileName )
    const fromFile = await tryReadMetaFromSnapshot( { filePath } )
    if( fromFile.tool === null ) {
        return { matched: false, reason: 'no-tool-in-snapshot-header' }
    }
    return {
        matched: true,
        member: {
            schemaId: namespace + '.' + fromFile.tool,
            schemaVersion,
            schemaHash
        }
    }
}


const collectSchemaFiles = async ( { namespacePath } ) => {
    const entries = await readdir( namespacePath )
    return entries
        .filter( ( name ) => name.endsWith( '.mjs' ) )
        .filter( ( name ) => SCHEMA_FILE_REGEX.test( name ) === true )
        .sort()
}


const determineAboutHash = async ( { namespacePath } ) => {
    const aboutDir = join( namespacePath, 'about' )
    const aboutDirExists = await fileExists( { path: aboutDir } )
    if( aboutDirExists === false ) {
        return { aboutHash: 'PENDING' }
    }
    const entries = await readdir( aboutDir )
    const aboutFiles = entries
        .filter( ( name ) => name.endsWith( '--about.md' ) )
        .sort()
    if( aboutFiles.length === 0 ) {
        return { aboutHash: 'PENDING' }
    }
    const firstFile = aboutFiles[ 0 ]
    const aboutHash = firstFile.replace( /--about\.md$/, '' )
    return { aboutHash }
}


const ensureAboutPlaceholder = async ( { namespacePath, dryRun, log } ) => {
    const aboutDir = join( namespacePath, 'about' )
    const gitkeepPath = join( aboutDir, '.gitkeep' )
    if( existsSync( gitkeepPath ) === true ) {
        log.push( { action: 'SKIP_ABOUT_GITKEEP', path: gitkeepPath } )
        return { created: false }
    }
    if( dryRun === false ) {
        await mkdir( aboutDir, { recursive: true } )
        await writeFile( gitkeepPath, '', 'utf-8' )
    }
    log.push( { action: 'CREATE_ABOUT_GITKEEP', path: gitkeepPath } )
    return { created: true }
}


const buildNamespacePayload = async ( { namespace, namespacePath } ) => {
    const schemaFiles = await collectSchemaFiles( { namespacePath } )
    const memberResults = await schemaFiles.reduce( async ( accPromise, fileName ) => {
        const acc = await accPromise
        const built = await buildMember( { namespace, fileName, namespacePath } )
        if( built.matched === false ) {
            return acc
        }
        return acc.concat( [ built.member ] )
    }, Promise.resolve( [] ) )

    const members = memberResults
        .slice()
        .sort( ( a, b ) => ( a.schemaId < b.schemaId ? -1 : a.schemaId > b.schemaId ? 1 : 0 ) )

    const { aboutHash } = await determineAboutHash( { namespacePath } )
    const namespaceHash = computeNamespaceHash( { members, aboutHash } )

    return {
        payload: {
            namespace,
            namespaceHash,
            aboutHash,
            members
        }
    }
}


const writeNamespaceJson = async ( { namespacePath, payload, dryRun, force, log, namespace } ) => {
    const filePath = join( namespacePath, 'namespace.json' )
    const newContent = JSON.stringify( payload, null, 4 ) + '\n'

    const exists = existsSync( filePath )
    if( exists === true ) {
        const current = await readFile( filePath, 'utf-8' )
        if( current === newContent ) {
            log.push( { action: 'SKIP_NAMESPACE_JSON', namespace, path: filePath } )
            return { written: false, reason: 'identical' }
        }
        if( force === false ) {
            log.push( { action: 'WARN_NAMESPACE_JSON_DIVERGENT', namespace, path: filePath, hint: 'use --force to overwrite' } )
            return { written: false, reason: 'divergent-without-force' }
        }
        if( dryRun === false ) {
            await writeFile( filePath, newContent, 'utf-8' )
        }
        log.push( { action: 'OVERWRITE_NAMESPACE_JSON', namespace, path: filePath } )
        return { written: true, reason: 'overwritten' }
    }

    if( dryRun === false ) {
        await writeFile( filePath, newContent, 'utf-8' )
    }
    log.push( { action: 'CREATE_NAMESPACE_JSON', namespace, path: filePath } )
    return { written: true, reason: 'created' }
}


const processNamespace = async ( { namespace, dryRun, force, log } ) => {
    const namespacePath = join( SCHEMAS_ROOT_ABSOLUTE, namespace )
    const exists = await fileExists( { path: namespacePath } )
    if( exists === false ) {
        log.push( { action: 'ERROR_NAMESPACE_MISSING', namespace, path: namespacePath } )
        return { namespace, processed: false, reason: 'missing' }
    }

    await ensureAboutPlaceholder( { namespacePath, dryRun, log } )
    const { payload } = await buildNamespacePayload( { namespace, namespacePath } )
    const writeResult = await writeNamespaceJson( { namespacePath, payload, dryRun, force, log, namespace } )

    return { namespace, processed: true, payload, writeResult }
}


const listAllNamespaces = async () => {
    const rootExists = await fileExists( { path: SCHEMAS_ROOT_ABSOLUTE } )
    if( rootExists === false ) {
        return { namespaces: [] }
    }
    const entries = await readdir( SCHEMAS_ROOT_ABSOLUTE, { withFileTypes: true } )
    const namespaces = entries
        .filter( ( e ) => e.isDirectory() === true )
        .map( ( e ) => e.name )
        .sort()
    return { namespaces }
}


const run = async ( { argv } ) => {
    const { dryRun, force, namespace } = parseArgs( { argv } )
    const log = []

    console.log( '[generate-namespace-json] mode=' + ( dryRun === true ? 'DRY-RUN' : 'APPLY' ) + ' force=' + force )
    console.log( '[generate-namespace-json] schemas-root=' + SCHEMAS_ROOT_ABSOLUTE )

    const namespaces = namespace !== null
        ? [ namespace ]
        : ( await listAllNamespaces() ).namespaces

    const results = await namespaces.reduce( async ( accPromise, ns ) => {
        const acc = await accPromise
        const result = await processNamespace( { namespace: ns, dryRun, force, log } )
        return acc.concat( [ result ] )
    }, Promise.resolve( [] ) )

    log.forEach( ( entry ) => {
        const parts = [ '[' + entry.action + ']' ]
        if( entry.namespace !== undefined ) { parts.push( 'ns=' + entry.namespace ) }
        if( entry.path !== undefined ) { parts.push( entry.path.replace( REPO_ROOT + '/', '' ) ) }
        if( entry.hint !== undefined ) { parts.push( '(' + entry.hint + ')' ) }
        console.log( parts.join( ' ' ) )
    } )

    console.log( '' )
    console.log( '[generate-namespace-json] processed namespaces:' )
    results.forEach( ( r ) => {
        if( r.processed === false ) {
            console.log( '  - ' + r.namespace + ' (' + r.reason + ')' )
            return
        }
        console.log( '  - ' + r.namespace + ' namespaceHash=' + r.payload.namespaceHash + ' aboutHash=' + r.payload.aboutHash + ' members=' + r.payload.members.length )
    } )

    return { results, log }
}


const main = async () => {
    return run( { argv: process.argv.slice( 2 ) } )
}


main()
    .then( ( { log } ) => {
        const errors = log.filter( ( e ) => e.action.startsWith( 'ERROR' ) )
        process.exit( errors.length > 0 ? 1 : 0 )
    } )
    .catch( ( err ) => {
        console.error( '[generate-namespace-json] FATAL', err )
        process.exit( 2 )
    } )


export { run, canonicalStringify, computeNamespaceHash, buildNamespacePayload }
