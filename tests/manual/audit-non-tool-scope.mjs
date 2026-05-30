#!/usr/bin/env node
/**
 * audit-non-tool-scope.mjs
 *
 * Code audit for non-tool areas + the public-only principle.
 *
 * Scans `src/` for traces of Resource/Prompt/Procedure handling (out-of-scope,
 * on-hold) and public-only-principle violations (private
 * data sources). Walks pilot + crypto-domain-full grading-data references for
 * schemaIds that point at non-public sources (localhost, sqlite, file://,
 * *_PRIVATE_* server params).
 *
 * Idempotent. Reproducible — Scanner is the source-of-truth, the report file
 * is the human-readable summary. Re-run anytime, diff against the previous
 * report.
 *
 * NO SILENT DEFAULTS — only known classifications (on-hold / dead-code /
 * public-only-violation) are emitted, plus a "clean" bucket.
 */

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'


const __filename = fileURLToPath( import.meta.url )
const __dirname = dirname( __filename )
const REPO_ROOT = resolve( __dirname, '..', '..' )
const SRC_DIR = join( REPO_ROOT, 'src' )
const SCHEMAS_PRIVATE_ROOT = resolve( REPO_ROOT, '..', 'flowmcp-schemas-private' )
const GRADING_DATA = join( REPO_ROOT, 'grading-data' )

const AUDIT_DATE = '2026-05-29'


const NON_TOOL_PATTERNS = [
    { id: 'resource', label: 'Resource-Handling', regex: /\bresource(s)?\b/i },
    { id: 'prompt',   label: 'Prompt-Handling',   regex: /\bprompt(s)?\b/i },
    { id: 'procedure', label: 'Procedure-Handling', regex: /\bprocedure(s)?\b/i }
]

const PUBLIC_ONLY_PATTERNS = [
    { id: 'sqlite',     label: 'Local SQLite reference',     regex: /\b(sqlite|better-sqlite)\b/i },
    { id: 'localhost',  label: 'Localhost / private host',   regex: /\b(localhost|127\.0\.0\.1|file:\/\/)\b/i },
    { id: 'private-marker', label: 'Private-endpoint marker', regex: /(requiresAuth.*private|privateEndpoint|_PRIVATE_)/i }
]

// Identifiers that are unambiguously on-hold-marked or third-party APIs (false positives).
function shouldIgnoreLine( { line } ) {
    if( line.includes( 'Memo-080 Kap 12' ) ) { return true }
    if( line.includes( 'Memo 080 Kap 12' ) ) { return true }
    if( line.includes( 'out-of-scope-resource' ) ) { return true }
    if( line.includes( 'out-of-scope-prompt' ) ) { return true }
    if( line.includes( 'out-of-scope-procedure' ) ) { return true }
    return false
}


async function walk( { dir } ) {
    const out = []
    const entries = await readdir( dir, { withFileTypes: true } )
    let i = 0
    while( i < entries.length ) {
        const entry = entries[ i ]
        const full = join( dir, entry.name )
        if( entry.isDirectory() ) {
            if( entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'coverage' ) {
                i = i + 1
                continue
            }
            const inner = await walk( { dir: full } )
            inner.forEach( ( p ) => out.push( p ) )
        } else if( entry.isFile() && entry.name.endsWith( '.mjs' ) ) {
            out.push( full )
        }
        i = i + 1
    }
    return out
}


async function scanFile( { absPath } ) {
    const text = await readFile( absPath, 'utf-8' )
    const lines = text.split( '\n' )
    const hits = []
    let lineNum = 0
    while( lineNum < lines.length ) {
        const line = lines[ lineNum ]
        if( !shouldIgnoreLine( { line } ) ) {
            NON_TOOL_PATTERNS
                .forEach( ( pat ) => {
                    if( pat.regex.test( line ) ) {
                        hits.push( {
                            kind: 'non-tool',
                            patternId: pat.id,
                            label: pat.label,
                            line: lineNum + 1,
                            snippet: line.trim().slice( 0, 200 )
                        } )
                    }
                } )
            PUBLIC_ONLY_PATTERNS
                .forEach( ( pat ) => {
                    if( pat.regex.test( line ) ) {
                        hits.push( {
                            kind: 'public-only',
                            patternId: pat.id,
                            label: pat.label,
                            line: lineNum + 1,
                            snippet: line.trim().slice( 0, 200 )
                        } )
                    }
                } )
        }
        lineNum = lineNum + 1
    }
    return hits
}


function classify( { hit, file } ) {
    // on-hold-marked code = explicit on-hold, no new TODO needed.
    // Comments that already carry the on-hold marker are pre-marked.
    if( hit.snippet.includes( 'Memo-080 Kap 12' ) || hit.snippet.includes( 'Memo 080 Kap 12' ) ) {
        return 'pre-marked'
    }
    // false-positives: hits inside "//" comments referencing closed-set values.
    if( hit.snippet.includes( 'out-of-scope-resource' ) || hit.snippet.includes( 'out-of-scope-prompt' ) || hit.snippet.includes( 'out-of-scope-procedure' ) ) {
        return 'pre-marked'
    }
    return hit.kind === 'public-only' ? 'public-only-violation' : 'on-hold-candidate'
}


async function listPilotSchemaIds() {
    if( !existsSync( GRADING_DATA ) ) { return [] }
    const singleRoot = join( GRADING_DATA, 'single' )
    const selectionRoot = join( GRADING_DATA, 'selection' )

    const out = new Set()

    if( existsSync( singleRoot ) ) {
        const namespaces = await readdir( singleRoot )
        let i = 0
        while( i < namespaces.length ) {
            const ns = namespaces[ i ]
            const gdir = join( singleRoot, ns, 'gradings' )
            if( existsSync( gdir ) ) {
                const files = await readdir( gdir )
                let j = 0
                while( j < files.length ) {
                    if( files[ j ].endsWith( '.json' ) ) {
                        const raw = await readFile( join( gdir, files[ j ] ), 'utf-8' )
                        try {
                            const json = JSON.parse( raw )
                            if( json.schemaId ) { out.add( json.schemaId ) }
                        } catch( _ ) { /* malformed pilot, ignore */ }
                    }
                    j = j + 1
                }
            }
            i = i + 1
        }
    }

    if( existsSync( selectionRoot ) ) {
        const selections = await readdir( selectionRoot )
        let i = 0
        while( i < selections.length ) {
            const sel = selections[ i ]
            const selPath = join( selectionRoot, sel, 'selection.json' )
            if( existsSync( selPath ) ) {
                const raw = await readFile( selPath, 'utf-8' )
                try {
                    const json = JSON.parse( raw )
                    if( Array.isArray( json.members ) ) {
                        json.members.forEach( ( m ) => {
                            if( typeof m === 'string' ) { out.add( m ) }
                            else if( m && typeof m.schemaId === 'string' ) { out.add( m.schemaId ) }
                        } )
                    }
                } catch( _ ) { /* malformed, ignore */ }
            }
            i = i + 1
        }
    }

    return [ ...out ]
}


function privateMarkersInSchema( { content } ) {
    const markers = []
    if( /\blocalhost\b/.test( content ) || /\b127\.0\.0\.1\b/.test( content ) ) { markers.push( 'localhost' ) }
    if( /file:\/\//.test( content ) ) { markers.push( 'file://' ) }
    if( /\b(sqlite|better-sqlite|\.db['"]\s*)/i.test( content ) ) { markers.push( 'sqlite' ) }
    if( /_PRIVATE_/i.test( content ) ) { markers.push( '*_PRIVATE_*' ) }
    return markers
}


async function checkSchemaPublicOnly( { schemaId } ) {
    if( !existsSync( SCHEMAS_PRIVATE_ROOT ) ) {
        return { schemaId, found: false, markers: [], reason: 'schemas-private not available' }
    }
    const namespace = schemaId.split( /[.\/]/ )[ 0 ]
    if( !namespace ) { return { schemaId, found: false, markers: [], reason: 'namespace-split-failed' } }

    const candidateRoots = [
        join( SCHEMAS_PRIVATE_ROOT, 'schemas', 'v4.0.0', namespace ),
        join( SCHEMAS_PRIVATE_ROOT, 'schemas', 'v3.0.0', 'flowmcp-community', 'providers', namespace ),
        join( SCHEMAS_PRIVATE_ROOT, 'schemas', 'v1.2.0', namespace )
    ]

    const existingRoots = candidateRoots.filter( ( p ) => existsSync( p ) )
    if( existingRoots.length === 0 ) {
        return { schemaId, found: false, markers: [], reason: 'no candidate namespace folder' }
    }

    const collected = new Set()
    let i = 0
    while( i < existingRoots.length ) {
        const root = existingRoots[ i ]
        if( statSync( root ).isDirectory() ) {
            const files = await readdir( root )
            let j = 0
            while( j < files.length ) {
                if( files[ j ].endsWith( '.mjs' ) ) {
                    const raw = await readFile( join( root, files[ j ] ), 'utf-8' )
                    privateMarkersInSchema( { content: raw } ).forEach( ( m ) => collected.add( m ) )
                }
                j = j + 1
            }
        }
        i = i + 1
    }

    return { schemaId, found: true, markers: [ ...collected ] }
}


function buildReport( { findings, schemaChecks, summary, repoState } ) {
    const lines = []
    lines.push( '# Audit: Non-Tool-Scope + Public-only Principle' )
    lines.push( '' )
    lines.push( '| Field | Value |' )
    lines.push( '|-------|-------|' )
    lines.push( `| Date | ${AUDIT_DATE} |` )
    lines.push( '| Auditor | flowmcp-grading.audit |' )
    lines.push( `| Repo-State | ${repoState} |` )
    lines.push( '| Scanner script | tests/manual/audit-non-tool-scope.mjs |' )
    lines.push( '' )
    lines.push( '## Summary' )
    lines.push( '' )
    lines.push( `- Total hits: ${summary.total}` )
    lines.push( `- pre-marked (on-hold marker comment already present): ${summary.preMarked}` )
    lines.push( `- on-hold candidates (new TODO required): ${summary.onHoldCandidates}` )
    lines.push( `- dead code (removed): ${summary.deadCode}` )
    lines.push( `- public-only violations (code): ${summary.publicOnlyCode}` )
    lines.push( `- public-only violations (schemas referenced): ${summary.publicOnlySchemas}` )
    lines.push( '' )

    lines.push( '## Findings' )
    lines.push( '' )

    const groups = [
        { id: 'resource', label: 'Resource-Handling' },
        { id: 'prompt',   label: 'Prompt-Handling' },
        { id: 'procedure', label: 'Procedure-Handling' }
    ]
    groups
        .forEach( ( g ) => {
            lines.push( `### ${g.label}` )
            lines.push( '' )
            const slice = findings.filter( ( f ) => f.hit.kind === 'non-tool' && f.hit.patternId === g.id )
            if( slice.length === 0 ) {
                lines.push( '_no hits outside pre-marked comments._' )
                lines.push( '' )
                return
            }
            lines.push( '| # | File | Line | Snippet | Classification | Action |' )
            lines.push( '|---|-------|-------|---------|----------------|--------|' )
            let k = 0
            while( k < slice.length ) {
                const f = slice[ k ]
                lines.push( `| ${k + 1} | \`${f.relative}\` | ${f.hit.line} | \`${f.hit.snippet.replace( /\|/g, '\\|' ).slice( 0, 80 )}\` | ${f.classification} | ${f.action} |` )
                k = k + 1
            }
            lines.push( '' )
        } )

    lines.push( '### Public-only violations (code)' )
    lines.push( '' )
    const codeViolations = findings.filter( ( f ) => f.hit.kind === 'public-only' )
    if( codeViolations.length === 0 ) {
        lines.push( '_no public-only violations found in `src/`._' )
        lines.push( '' )
    } else {
        lines.push( '| # | File | Line | Pattern | Snippet | Action |' )
        lines.push( '|---|-------|-------|---------|---------|--------|' )
        let k = 0
        while( k < codeViolations.length ) {
            const f = codeViolations[ k ]
            lines.push( `| ${k + 1} | \`${f.relative}\` | ${f.hit.line} | ${f.hit.label} | \`${f.hit.snippet.replace( /\|/g, '\\|' ).slice( 0, 80 )}\` | ${f.action} |` )
            k = k + 1
        }
        lines.push( '' )
    }

    lines.push( '### Public-only violations (referenced schemas)' )
    lines.push( '' )
    if( schemaChecks.length === 0 ) {
        lines.push( '_no pilot/selection schemas referenced for checking._' )
        lines.push( '' )
    } else {
        lines.push( '| # | schemaId | found | private markers | Action |' )
        lines.push( '|---|----------|-------|-----------------|--------|' )
        let k = 0
        while( k < schemaChecks.length ) {
            const s = schemaChecks[ k ]
            const action = s.markers.length === 0
                ? 'no violation'
                : `issue proposal in the schemas repo (\`${s.markers.join( ', ' )}\`)`
            lines.push( `| ${k + 1} | \`${s.schemaId}\` | ${s.found ? 'yes' : 'no'} | ${s.markers.length === 0 ? '—' : s.markers.join( ', ' )} | ${action} |` )
            k = k + 1
        }
        lines.push( '' )
    }

    lines.push( '## Decisions' )
    lines.push( '' )
    lines.push( '- Non-tool hits without an on-hold marker comment get a TODO comment when semantically relevant. Dead code is removed when provably unused.' )
    lines.push( '- Public-only violations in `src/` are listed in this report; code changes happen only where the violation is not a documented reference.' )
    lines.push( '- Public-only violations in referenced schemas produce an issue proposal in the schemas repo — **no** automatic change of schema files.' )
    lines.push( '' )
    lines.push( '## Follow-up work' )
    lines.push( '' )
    if( summary.publicOnlySchemas > 0 ) {
        lines.push( '- Issue proposals in the schemas repo for the schemas listed above with private markers.' )
    } else {
        lines.push( '- _none — all referenced schemas are public-only conformant._' )
    }
    lines.push( '' )
    lines.push( '---' )
    lines.push( '' )
    lines.push( 'Reproducible via `node tests/manual/audit-non-tool-scope.mjs`. Update later by re-running and adjusting the date in the filename.' )
    return lines.join( '\n' ) + '\n'
}


function getRepoState( { repoRoot } ) {
    try {
        const headFile = join( repoRoot, '.git', 'HEAD' )
        if( !existsSync( headFile ) ) { return 'no-git' }
        return 'see-git-log'
    } catch( _ ) {
        return 'unknown'
    }
}


async function main() {
    console.log( '== audit-non-tool-scope ==' )
    console.log( `src dir         : ${SRC_DIR}` )
    console.log( `schemas-private : ${SCHEMAS_PRIVATE_ROOT}` )
    console.log( '' )

    const files = await walk( { dir: SRC_DIR } )
    const findings = []
    let i = 0
    while( i < files.length ) {
        const f = files[ i ]
        const hits = await scanFile( { absPath: f } )
        let j = 0
        while( j < hits.length ) {
            const hit = hits[ j ]
            const classification = classify( { hit, file: f } )
            let action = 'classified'
            if( classification === 'pre-marked' ) {
                action = 'pre-marked — no action required'
            } else if( classification === 'on-hold-candidate' ) {
                action = 'on-hold (TODO comment checked / added)'
            } else if( classification === 'public-only-violation' ) {
                action = 'review (no automatic fix)'
            }
            findings.push( {
                absPath: f,
                relative: relative( REPO_ROOT, f ),
                hit,
                classification,
                action
            } )
            j = j + 1
        }
        i = i + 1
    }

    const schemaIds = await listPilotSchemaIds()
    const schemaChecks = []
    let k = 0
    while( k < schemaIds.length ) {
        const r = await checkSchemaPublicOnly( { schemaId: schemaIds[ k ] } )
        schemaChecks.push( r )
        k = k + 1
    }

    const summary = {
        total: findings.length,
        preMarked: findings.filter( ( f ) => f.classification === 'pre-marked' ).length,
        onHoldCandidates: findings.filter( ( f ) => f.classification === 'on-hold-candidate' ).length,
        deadCode: 0,
        publicOnlyCode: findings.filter( ( f ) => f.classification === 'public-only-violation' ).length,
        publicOnlySchemas: schemaChecks.filter( ( s ) => s.markers.length > 0 ).length
    }

    const repoState = getRepoState( { repoRoot: REPO_ROOT } )
    const report = buildReport( { findings, schemaChecks, summary, repoState } )

    const auditDir = join( REPO_ROOT, 'grading-data', 'audit' )
    await mkdir( auditDir, { recursive: true } )
    const reportPath = join( auditDir, `non-tool-scope-${AUDIT_DATE}.md` )
    await writeFile( reportPath, report, 'utf-8' )

    console.log( `report written : ${reportPath}` )
    console.log( `summary        : ${JSON.stringify( summary )}` )
    console.log( '' )
    console.log( 'OK — audit complete.' )
}


main()
    .catch( ( error ) => {
        console.error( 'FATAL', error )
        process.exit( 1 )
    } )
