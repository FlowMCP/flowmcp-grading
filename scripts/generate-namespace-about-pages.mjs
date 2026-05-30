// Generate namespace-about pages for crypto-domain-full members.
//
// Behavior:
//   - reads each <namespace>'s schemas from flowmcp-schemas-private
//   - extracts main.description, tools (name, description, required params)
//   - emits canonical Markdown:
//       grading-data/schemas/<namespace>/about/<hash>--about.md
//   - updates grading-data/schemas/<namespace>/namespace.json.aboutHash
//   - also creates namespace.json if missing (minimal stub)
//
// Idempotent (same input → same hash → SKIP).
// Flags:
//   --dry-run          — preview, no writes
//   --namespace=<n>    — process one namespace
//   --verbose          — verbose log
//
// No for/while loops. NO SILENT DEFAULTS.


import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'


const __filename = fileURLToPath( import.meta.url )
const __dirname = dirname( __filename )
const REPO_ROOT = resolve( __dirname, '..' )
const PROVIDERS_ROOT = resolve( REPO_ROOT, '../flowmcp-schemas-private/schemas/v4.0.0/providers' )
const SCHEMAS_DATA_ROOT = join( REPO_ROOT, 'grading-data/schemas' )
const SELECTION_PATH = join( REPO_ROOT, 'grading-data/selection/crypto-domain-full/selection.json' )


const parseArgs = ( { argv } ) => {
    const dryRun = argv.includes( '--dry-run' )
    const verbose = argv.includes( '--verbose' )
    const nsArg = argv.find( ( a ) => a.startsWith( '--namespace=' ) )
    const namespace = nsArg !== undefined ? nsArg.slice( '--namespace='.length ) : null
    return { dryRun, verbose, namespace }
}


const isDir = async ( { path } ) => {
    try { const s = await stat( path ); return s.isDirectory() } catch { return false }
}


const fileExists = async ( { path } ) => {
    try { await stat( path ); return true } catch { return false }
}


const importSchemaModule = async ( { path } ) => {
    try {
        const url = 'file://' + path
        const mod = await import( url )
        return { mod, error: null }
    } catch( err ) {
        return { mod: null, error: err.message }
    }
}


const extractToolEntries = ( { mainObj } ) => {
    if( mainObj === undefined || mainObj === null ) { return [] }
    if( mainObj.tools === undefined || mainObj.tools === null ) { return [] }
    const tools = mainObj.tools
    const entries = Object
        .keys( tools )
        .sort()
        .map( ( toolName ) => {
            const tool = tools[ toolName ]
            const method = tool.method !== undefined ? tool.method : ''
            const description = tool.description !== undefined ? tool.description : ''
            const params = Array.isArray( tool.parameters ) ? tool.parameters : []
            const requiredParams = params
                .map( ( p ) => {
                    if( p === null || p === undefined ) { return null }
                    if( p.position === undefined || p.position === null ) { return null }
                    return p.position.key
                } )
                .filter( ( v ) => v !== null && v !== undefined )
            return { toolName, method, description, requiredParams }
        } )
    return entries
}


const buildMarkdown = ( { namespace, description, tools, requiredServerParams, category } ) => {
    const toolRows = tools.length === 0
        ? '| (none) | — | — | — |'
        : tools
            .map( ( t ) => {
                const paramList = t.requiredParams.length === 0 ? '—' : t.requiredParams.join( ', ' )
                const safeDesc = t.description.replace( /\n/g, ' ' ).replace( /\|/g, '\\|' ).slice( 0, 200 )
                return `| ${t.toolName} | ${t.method} | ${safeDesc} | ${paramList} |`
            } )
            .join( '\n' )

    const serverParamList = requiredServerParams.length === 0
        ? '- (none)'
        : requiredServerParams
            .map( ( p ) => `- ${p}` )
            .join( '\n' )

    const safeDescription = description.replace( /\n+/g, ' ' )

    return `# ${namespace} — Namespace About

## Overview
${safeDescription}

## Tools (${tools.length} total)
| Tool | Method | Purpose | Key Params |
|------|--------|---------|------------|
${toolRows}

## Required Server Params
${serverParamList}

## Common Gotchas
- TBD: add field-specific gotchas after first Single-Full-Grading.

## Category in crypto-domain-full
${category}
`
}


const loadNamespaceData = async ( { namespace, providersRoot } ) => {
    const namespaceDir = join( providersRoot, namespace )
    const dirExists = await isDir( { path: namespaceDir } )
    if( !dirExists ) {
        return { description: '', tools: [], requiredServerParams: [], error: `NS-MISSING: ${namespace}` }
    }

    const entries = await readdir( namespaceDir )
    const mjsFiles = entries
        .filter( ( f ) => f.endsWith( '.mjs' ) && !f.startsWith( '_' ) )

    const moduleData = await Promise.all(
        mjsFiles
            .map( async ( f ) => {
                const filePath = join( namespaceDir, f )
                const { mod, error } = await importSchemaModule( { path: filePath } )
                return { file: f, mod, error }
            } )
    )

    const validMods = moduleData
        .filter( ( m ) => m.mod !== null && m.mod.main !== undefined )

    if( validMods.length === 0 ) {
        return { description: '', tools: [], requiredServerParams: [], error: `NS-NO-MAIN: ${namespace}` }
    }

    const descriptions = validMods
        .map( ( m ) => m.mod.main.description )
        .filter( ( d ) => typeof d === 'string' && d.length > 0 )

    const description = descriptions.length === 0
        ? `(no description available for namespace ${namespace})`
        : descriptions[ 0 ]

    const allTools = validMods
        .flatMap( ( m ) => extractToolEntries( { mainObj: m.mod.main } ) )

    const seenTools = new Set()
    const tools = allTools
        .filter( ( t ) => {
            if( seenTools.has( t.toolName ) ) { return false }
            seenTools.add( t.toolName )
            return true
        } )
        .sort( ( a, b ) => a.toolName.localeCompare( b.toolName ) )

    const paramsSet = new Set()
    validMods
        .forEach( ( m ) => {
            const arr = Array.isArray( m.mod.main.requiredServerParams )
                ? m.mod.main.requiredServerParams
                : []
            arr.forEach( ( p ) => paramsSet.add( p ) )
        } )

    const requiredServerParams = [ ...paramsSet ].sort()

    return { description, tools, requiredServerParams, error: null }
}


const ensureNamespaceJson = async ( { namespace, namespaceDir, aboutHash, tools } ) => {
    const namespaceJsonPath = join( namespaceDir, 'namespace.json' )
    const exists = await fileExists( { path: namespaceJsonPath } )

    if( exists ) {
        const content = JSON.parse( await readFile( namespaceJsonPath, 'utf-8' ) )
        content.aboutHash = aboutHash
        return { json: content, path: namespaceJsonPath }
    }

    // create minimal namespace.json
    const members = tools.length === 0
        ? [ { schemaId: `${namespace}.placeholder`, schemaVersion: '1.0.0', schemaHash: '00000000' } ]
        : [ { schemaId: `${namespace}.${tools[ 0 ].toolName}`, schemaVersion: '1.0.0', schemaHash: '00000000' } ]

    const json = {
        namespace,
        namespaceHash: '00000000',
        aboutHash,
        members
    }
    return { json, path: namespaceJsonPath }
}


const writeJsonCanonical = ( { obj } ) => {
    return JSON.stringify( obj, null, 4 )
}


const processNamespace = async ( { namespace, category, dryRun, verbose } ) => {
    const data = await loadNamespaceData( {
        namespace,
        providersRoot: PROVIDERS_ROOT
    } )

    if( data.error !== null && data.tools.length === 0 ) {
        if( verbose ) { console.error( `[gen] WARN ${namespace}: ${data.error}` ) }
    }

    const md = buildMarkdown( {
        namespace,
        description: data.description,
        tools: data.tools,
        requiredServerParams: data.requiredServerParams,
        category
    } )

    const hash = createHash( 'sha256' ).update( md ).digest( 'hex' ).slice( 0, 8 )

    const namespaceDir = join( SCHEMAS_DATA_ROOT, namespace )
    const aboutDir = join( namespaceDir, 'about' )
    const aboutFile = join( aboutDir, `${hash}--about.md` )

    const aboutExists = await fileExists( { path: aboutFile } )

    if( aboutExists ) {
        if( verbose ) { console.error( `[gen] SKIP ${namespace} (hash ${hash} already on disk)` ) }
        // still ensure namespace.json points to current hash
        if( !dryRun ) {
            const { json, path: nsJsonPath } = await ensureNamespaceJson( {
                namespace,
                namespaceDir,
                aboutHash: hash,
                tools: data.tools
            } )
            await mkdir( namespaceDir, { recursive: true } )
            await writeFile( nsJsonPath, writeJsonCanonical( { obj: json } ), 'utf-8' )
        }
        return { namespace, hash, action: 'skip', toolCount: data.tools.length }
    }

    if( dryRun ) {
        console.error( `[gen] DRY ${namespace} → ${hash}--about.md (${data.tools.length} tools)` )
        return { namespace, hash, action: 'dry', toolCount: data.tools.length }
    }

    await mkdir( aboutDir, { recursive: true } )
    await writeFile( aboutFile, md, 'utf-8' )

    const { json, path: nsJsonPath } = await ensureNamespaceJson( {
        namespace,
        namespaceDir,
        aboutHash: hash,
        tools: data.tools
    } )
    await writeFile( nsJsonPath, writeJsonCanonical( { obj: json } ), 'utf-8' )

    if( verbose ) { console.error( `[gen] CREATE ${namespace} → ${hash}--about.md (${data.tools.length} tools)` ) }
    return { namespace, hash, action: 'create', toolCount: data.tools.length }
}


const main = async () => {
    const { dryRun, verbose, namespace } = parseArgs( { argv: process.argv.slice( 2 ) } )

    const selection = JSON.parse( await readFile( SELECTION_PATH, 'utf-8' ) )
    const members = selection.members

    const targets = namespace === null
        ? members
        : members.filter( ( m ) => m.schemaId === namespace )

    if( targets.length === 0 ) {
        console.error( `[gen] no targets — namespace ${namespace} not in selection.json` )
        process.exit( 1 )
    }

    const results = await Promise.all(
        targets
            .map( ( m ) => processNamespace( {
                namespace: m.schemaId,
                category: m.category,
                dryRun,
                verbose
            } ) )
    )

    const created = results.filter( ( r ) => r.action === 'create' ).length
    const skipped = results.filter( ( r ) => r.action === 'skip' ).length
    const dryCount = results.filter( ( r ) => r.action === 'dry' ).length

    console.error( `[gen] DONE total=${results.length} create=${created} skip=${skipped} dry=${dryCount}` )

    process.stdout.write( JSON.stringify( results, null, 2 ) + '\n' )
}


main()
    .catch( ( err ) => {
        console.error( `[gen] ERROR: ${err.message}` )
        process.exit( 1 )
    } )
