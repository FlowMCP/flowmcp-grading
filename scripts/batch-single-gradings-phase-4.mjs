// Batch-runner for Single-Full-Gradings of all 64 crypto-domain-full members.
//
// Memo 080 PRD-18 §4.1 — sequential batch with crash-recovery + state file.
//
// REALITY-CHECK (2026-05-29):
//   The CLI command `flowmcp dev grade single` referenced in PRD-18 is a stub
//   in src/Phases/SingleSchema.mjs (P1, P2, P7 currently report
//   `stub: true, todo: 'follow-up memo'`). A full LLM-grading of 64 members
//   would take hours and cannot be completed inside one subagent invocation.
//
//   This batch-runner therefore operates in TWO MODES:
//   - --mode=plan  (default) — produces a deterministic plan file, marks every
//                              member as `gradingStatus: pending` in
//                              phase-status/single/<ns>--<tool>.json.
//                              Writes the state-file. Does NOT run any LLM.
//   - --mode=grade            — actually spawns `flowmcp dev grade single`
//                              once that CLI is wired (future work). Each
//                              member-run persists in the state-file. Resumes
//                              with --resume.
//
// Crash-recovery: writes .tmp/batch-phase-4-state.json after every member.
//
// Flags:
//   --mode=plan|grade
//   --resume                  (skip members marked stable)
//   --dry-run                 (no writes)
//   --single=<schemaId>       (only this member)
//   --persona=<id>            (default crypto-trader-2026)
//   --verbose
//
// NO SILENT DEFAULTS. No for/while loops.


import { readFile, writeFile, mkdir, stat, readdir } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'


const __filename = fileURLToPath( import.meta.url )
const __dirname = dirname( __filename )
const REPO_ROOT = resolve( __dirname, '..' )
const PROVIDERS_ROOT = resolve( REPO_ROOT, '../flowmcp-schemas-private/schemas/v4.0.0/providers' )
const SELECTION_PATH = join( REPO_ROOT, 'grading-data/selection/crypto-domain-full/selection.json' )
const PHASE_STATUS_DIR = join( REPO_ROOT, 'grading-data/phase-status/single' )
const STATE_PATH = join( REPO_ROOT, '.tmp/batch-phase-4-state.json' )


const PHASE_STATUS_TEMPLATE = Object.freeze( {
    gradingStatus: 'pending',
    lastGradingHash: null,
    lastGradingMode: null,
    lastGradedAt: null,
    schemaVersion: '1.0.0',
    schemaHash: '00000000',
    phases: [
        { phaseId: 'P1', status: 'pending', dimensionsConsidered: [ 'tosMatch', 'legalAssessment' ] },
        { phaseId: 'P2', status: 'pending', dimensionsConsidered: [ 'apiAvailability' ] },
        { phaseId: 'P3', status: 'pending', dimensionsConsidered: [] },
        { phaseId: 'P4', status: 'pending', dimensionsConsidered: [ 'apiAvailability', 'outputSchemaConformance' ] },
        { phaseId: 'P5', status: 'pending', dimensionsConsidered: [ 'whenToUse', 'parameters', 'descriptionNeutrality', 'completeness' ] },
        { phaseId: 'P6', status: 'pending', dimensionsConsidered: [ 'aboutConventionCompliance', 'namespaceSkillValidity' ] },
        { phaseId: 'P7', status: 'pending', dimensionsConsidered: [] }
    ]
} )


const parseArgs = ( { argv } ) => {
    const modeArg = argv.find( ( a ) => a.startsWith( '--mode=' ) )
    const mode = modeArg !== undefined ? modeArg.slice( '--mode='.length ) : 'plan'
    const personaArg = argv.find( ( a ) => a.startsWith( '--persona=' ) )
    const persona = personaArg !== undefined ? personaArg.slice( '--persona='.length ) : 'crypto-trader-2026'
    const singleArg = argv.find( ( a ) => a.startsWith( '--single=' ) )
    const single = singleArg !== undefined ? singleArg.slice( '--single='.length ) : null
    const resume = argv.includes( '--resume' )
    const dryRun = argv.includes( '--dry-run' )
    const verbose = argv.includes( '--verbose' )
    return { mode, persona, single, resume, dryRun, verbose }
}


const fileExists = async ( { path } ) => {
    try { await stat( path ); return true } catch { return false }
}


const loadState = async ( { path } ) => {
    const exists = await fileExists( { path } )
    if( !exists ) { return {} }
    try {
        const content = await readFile( path, 'utf-8' )
        return JSON.parse( content )
    } catch {
        return {}
    }
}


const saveState = async ( { path, state } ) => {
    await mkdir( dirname( path ), { recursive: true } )
    await writeFile( path, JSON.stringify( state, null, 4 ), 'utf-8' )
}


const sanitizeToolName = ( { toolName } ) => {
    // Replace filesystem-unsafe characters with underscore. Used only for
    // generating a stable phase-status filename, never as a routing key.
    return toolName
        .replace( /[:/\\]/g, '_' )
        .replace( /^_+/, '' )
}


const pickPrimaryTool = async ( { namespace } ) => {
    const nsDir = join( PROVIDERS_ROOT, namespace )
    try {
        const entries = await readdir( nsDir )
        const mjsFiles = entries
            .filter( ( f ) => f.endsWith( '.mjs' ) && !f.startsWith( '_' ) )
            .sort()
        if( mjsFiles.length === 0 ) { return null }

        const fileName = mjsFiles[ 0 ]
        const mod = await import( 'file://' + join( nsDir, fileName ) )
        if( mod.main === undefined ) { return null }
        if( mod.main.tools === undefined ) { return null }
        const rawToolNames = Object.keys( mod.main.tools ).sort()
        if( rawToolNames.length === 0 ) { return null }

        // Prefer tool-names that are filesystem-safe identifiers
        const cleanNames = rawToolNames
            .filter( ( t ) => /^[A-Za-z][A-Za-z0-9_-]*$/.test( t ) )
        const preferred = cleanNames.length > 0 ? cleanNames[ 0 ] : rawToolNames[ 0 ]
        return preferred
    } catch {
        return null
    }
}


const writePhaseStatus = async ( { namespace, tool, gradingStatus, dryRun } ) => {
    const safeTool = sanitizeToolName( { toolName: tool } )
    const fileName = `${namespace}--${safeTool}.json`
    const filePath = join( PHASE_STATUS_DIR, fileName )

    const exists = await fileExists( { path: filePath } )
    let payload

    if( exists ) {
        const content = JSON.parse( await readFile( filePath, 'utf-8' ) )
        content.gradingStatus = gradingStatus
        payload = content
    } else {
        payload = {
            schemaId: `${namespace}.${tool}`,
            ...PHASE_STATUS_TEMPLATE,
            gradingStatus
        }
    }

    if( dryRun ) { return { filePath, payload, written: false } }

    await mkdir( PHASE_STATUS_DIR, { recursive: true } )
    await writeFile( filePath, JSON.stringify( payload, null, 4 ), 'utf-8' )
    return { filePath, payload, written: true }
}


const writeNamespaceLevelStatus = async ( { namespace, tool, gradingStatus, dryRun } ) => {
    // PRD-15 selection.json uses namespace-level schemaIds (e.g. "alchemy").
    // SelectionLockfile reads phase-status/single/<schemaId>.json, where schemaId
    // matches lockfile member entry. We also write the namespace-level alias so
    // SelectionLockfile can find an aggregate status without enumerating tools.
    const filePath = join( PHASE_STATUS_DIR, `${namespace}.json` )

    const exists = await fileExists( { path: filePath } )
    const payload = exists
        ? JSON.parse( await readFile( filePath, 'utf-8' ) )
        : {
            schemaId: namespace,
            primaryTool: tool,
            ...PHASE_STATUS_TEMPLATE,
            gradingStatus
        }
    payload.gradingStatus = gradingStatus
    if( payload.primaryTool === undefined ) { payload.primaryTool = tool }

    if( dryRun ) { return { filePath, payload, written: false } }
    await mkdir( PHASE_STATUS_DIR, { recursive: true } )
    await writeFile( filePath, JSON.stringify( payload, null, 4 ), 'utf-8' )
    return { filePath, payload, written: true }
}


const planMember = async ( { schemaId, persona, dryRun, verbose } ) => {
    const tool = await pickPrimaryTool( { namespace: schemaId } )
    if( tool === null ) {
        // No tool — still write namespace-level status so the lockfile has an entry.
        await writeNamespaceLevelStatus( {
            namespace: schemaId,
            tool: '(none)',
            gradingStatus: 'pending',
            dryRun
        } )
        return { schemaId, tool: null, status: 'failed', reason: 'no-tool-discovered' }
    }

    const { filePath, written } = await writePhaseStatus( {
        namespace: schemaId,
        tool,
        gradingStatus: 'pending',
        dryRun
    } )

    // Mirror the status at namespace level for SelectionLockfile aggregation.
    await writeNamespaceLevelStatus( {
        namespace: schemaId,
        tool,
        gradingStatus: 'pending',
        dryRun
    } )

    if( verbose ) {
        console.error( `[batch] PLAN ${schemaId}--${tool} → phase-status (written=${written})` )
    }

    return { schemaId, tool, status: 'planned', persona, filePath }
}


const gradeMember = async ( { schemaId, persona, dryRun, verbose } ) => {
    // STUB — see top-of-file reality-check.
    // When the CLI / SingleSchemaPhases is fully implemented, this function
    // would spawn `flowmcp dev grade single <ns> --mode=full --persona=<p>`
    // and parse the JSON output.
    if( verbose ) {
        console.error( `[batch] GRADE ${schemaId} → SKIPPED (CLI not wired yet)` )
    }
    return { schemaId, status: 'deferred', reason: 'cli-not-wired', persona }
}


const main = async () => {
    const { mode, persona, single, resume, dryRun, verbose } = parseArgs( { argv: process.argv.slice( 2 ) } )

    if( !['plan', 'grade'].includes( mode ) ) {
        console.error( `[batch] ERROR: --mode must be 'plan' or 'grade' (got '${mode}')` )
        process.exit( 1 )
    }

    const selection = JSON.parse( await readFile( SELECTION_PATH, 'utf-8' ) )
    const members = selection.members
    const targets = single === null
        ? members
        : members.filter( ( m ) => m.schemaId === single )

    if( targets.length === 0 ) {
        console.error( `[batch] no targets — schemaId ${single} not in selection.json` )
        process.exit( 1 )
    }

    const state = await loadState( { path: STATE_PATH } )
    const total = targets.length

    const results = await targets
        .reduce( async ( accPromise, member, idx ) => {
            const acc = await accPromise
            const i = idx + 1

            if( resume && state[ member.schemaId ]?.status === 'stable' ) {
                if( verbose ) { console.error( `[${i}/${total}] ${member.schemaId} → SKIP (resume: already stable)` ) }
                acc.push( { schemaId: member.schemaId, status: 'skipped-stable' } )
                return acc
            }

            const result = mode === 'plan'
                ? await planMember( { schemaId: member.schemaId, persona, dryRun, verbose } )
                : await gradeMember( { schemaId: member.schemaId, persona, dryRun, verbose } )

            state[ member.schemaId ] = {
                status: result.status,
                tool: result.tool === undefined ? null : result.tool,
                mode,
                persona,
                ts: new Date().toISOString()
            }

            if( !dryRun ) { await saveState( { path: STATE_PATH, state } ) }
            console.error( `[${i}/${total}] ${member.schemaId} → ${result.status}` )
            acc.push( result )
            return acc
        }, Promise.resolve( [] ) )

    const summary = {
        mode,
        persona,
        total,
        planned: results.filter( ( r ) => r.status === 'planned' ).length,
        deferred: results.filter( ( r ) => r.status === 'deferred' ).length,
        failed: results.filter( ( r ) => r.status === 'failed' ).length,
        skipped: results.filter( ( r ) => r.status === 'skipped-stable' ).length
    }

    console.error( `[batch] DONE ${JSON.stringify( summary )}` )

    process.stdout.write( JSON.stringify( { summary, results }, null, 2 ) + '\n' )
}


main()
    .catch( ( err ) => {
        console.error( `[batch] ERROR: ${err.message}` )
        process.exit( 1 )
    } )
