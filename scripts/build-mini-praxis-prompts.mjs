#!/usr/bin/env node
/**
 * build-mini-praxis-prompts.mjs — mini-practice prompt builder.
 *
 * Builds self-contained evaluator prompt files for each (schema, area) combo of the
 * crypto-mini selection. Output: /tmp/mini-praxis-prompts/<area>--<schemaId-or-selection>.prompt.md
 *
 * Per-schema areas (6 areas x 7 schemas = 42 prompts):
 *   1. single-test (neutral)
 *   2. tools-aggregate-schema (neutral)
 *   3. namespace-description (neutral)
 *   4. tools-aggregate-namespace (neutral)
 *   5. about-namespace (persona)
 *   8. namespace-skills (persona)
 *
 * Per-selection areas (4 areas x 1 selection = 4 prompts):
 *   6. about-selection (persona)
 *   7a. selection-skills-L1 (persona)
 *   7b. selection-skills-L2 (persona)
 *   7c. selection-skills-L3 (persona)
 *
 * Total: 46 prompt files.
 *
 * Persona for persona areas: decision-maker--crypto-trader
 *
 * NO SILENT DEFAULTS. NO for/while loops.
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'


const __filename = fileURLToPath( import.meta.url )
const __dirname = dirname( __filename )
const REPO_ROOT = resolve( __dirname, '..' )
const FLOWMCP_ROOT = resolve( REPO_ROOT, '..', '..' )
const SCHEMAS_PRIVATE = resolve( FLOWMCP_ROOT, 'repos/flowmcp-schemas-private' )
const SPEC_REPO = resolve( FLOWMCP_ROOT, 'repos/flowmcp-spec' )
const PROVIDERS_ROOT = join( SCHEMAS_PRIVATE, 'schemas/v4.0.0/providers' )
const DOMAIN_KNOWLEDGE = join( SCHEMAS_PRIVATE, 'domain-knowledge/crypto.md' )
const PERSONA_BASE = join( SPEC_REPO, 'personas/decision-maker.md' )
const PERSONA_LENS = join( REPO_ROOT, 'grading-data/personas/crypto-trader-2026.md' )
const SELECTION_LOCK = join( REPO_ROOT, 'grading-data/selection/crypto-mini/selection.lock.json' )
const SELECTION_JSON = join( REPO_ROOT, 'grading-data/selection/crypto-mini/selection.json' )
const QUESTIONS = join( REPO_ROOT, 'prompts/generated/questions.json' )
const OUT_DIR = '/tmp/mini-praxis-prompts'


const SCHEMAS = [
    'coinmarketcap',
    'ccxt',
    'uniswap',
    'dexscreener',
    'etherscan',
    'moralis',
    'defillama'
]


const PER_SCHEMA_AREAS = [
    'single-test',
    'tools-aggregate-schema',
    'namespace-description',
    'tools-aggregate-namespace',
    'about-namespace',
    'namespace-skills'
]


const PER_SELECTION_AREAS = [
    'about-selection',
    'selection-skills-L1',
    'selection-skills-L2',
    'selection-skills-L3'
]


const PERSONA_AREAS = new Set( [
    'about-namespace',
    'about-selection',
    'selection-skills-L1',
    'selection-skills-L2',
    'selection-skills-L3',
    'namespace-skills'
] )


const PERSONA_SLUG = 'decision-maker--crypto-trader'


const readFileOrEmpty = async ( { path } ) => {
    if( !existsSync( path ) ) { return null }
    return readFile( path, 'utf-8' )
}


const collectSchemaFiles = async ( { schemaId } ) => {
    const nsDir = join( PROVIDERS_ROOT, schemaId )
    if( !existsSync( nsDir ) ) { return { files: [], paths: [] } }
    const entries = await readdir( nsDir, { withFileTypes: true } )
    const mjsFiles = entries
        .filter( ( e ) => e.isFile() && e.name.endsWith( '.mjs' ) )
        .map( ( e ) => e.name )
        .sort()
    const metaFiles = entries
        .filter( ( e ) => e.isFile() && e.name.startsWith( '_meta.' ) )
        .map( ( e ) => e.name )
        .sort()

    const collected = []
    const paths = []
    await mjsFiles.reduce( async ( prev, f ) => {
        await prev
        const p = join( nsDir, f )
        paths.push( p )
        const content = await readFile( p, 'utf-8' )
        collected.push( { path: p, name: f, content } )
    }, Promise.resolve() )
    await metaFiles.reduce( async ( prev, f ) => {
        await prev
        const p = join( nsDir, f )
        paths.push( p )
        const content = await readFile( p, 'utf-8' )
        collected.push( { path: p, name: f, content } )
    }, Promise.resolve() )

    return { files: collected, paths }
}


const buildQuestionsBlock = ( { questions, area } ) => {
    const areaQs = questions.filter( ( q ) => q.area === area )
    const lines = areaQs.map( ( q, i ) => {
        return [
            `### Q${i + 1}. ${q.id}`,
            `- dimension: ${q.dimension}`,
            `- scoreType: ${q.scoreType}`,
            `- tier: ${q.tier}`,
            `- question: ${q.question}`,
            `- evaluatorTask: ${q.evaluatorTask || '(none)'}`,
            ''
        ].join( '\n' )
    } )
    return lines.join( '\n' )
}


const buildPromptForSchemaArea = async ( { schemaId, area, questions, preInstructionsMap, outputSchemasMap, personaBaseTxt, personaLensTxt, domainKnowledgeTxt, schemaFiles } ) => {
    const isPersona = PERSONA_AREAS.has( area )
    const preInstr = preInstructionsMap[ area ]
    const outSchema = outputSchemasMap[ area ]
    const questionsBlock = buildQuestionsBlock( { questions, area } )

    const filesBlock = schemaFiles.files
        .map( ( f ) => `### ${f.name}\nPath: ${f.path}\n\n\`\`\`mjs\n${f.content}\n\`\`\`` )
        .join( '\n\n' )

    const personaBlock = isPersona
        ? [
            '## Persona (decision-maker--crypto-trader)',
            '',
            '### Base Persona — decision-maker.md',
            personaBaseTxt || '(not found)',
            '',
            '### Lens — crypto-trader-2026.md',
            personaLensTxt || '(not found)',
            ''
        ].join( '\n' )
        : ''

    const domainBlock = ( area === 'tools-aggregate-namespace' || area === 'about-namespace' || area === 'about-selection' )
        ? [
            '## Domain Knowledge — crypto.md',
            '',
            domainKnowledgeTxt || '(not found)',
            ''
        ].join( '\n' )
        : ''

    const personaJsonSnippet = isPersona
        ? '{ "basePersonaId": "decision-maker", "lensId": "crypto-trader" }'
        : 'null'

    const sections = [
        `# Mini-Practice Evaluator Prompt — area=${area}, schema=${schemaId}`,
        '',
        '## Role',
        'You are an evaluator producing a Strict-JSON grading per FlowMCP grading spec.',
        '',
        '## Pre-Instructions',
        '',
        preInstr || '(none)',
        '',
        personaBlock,
        domainBlock,
        '## Schema Source Files',
        '',
        filesBlock,
        '',
        '## Questions to Answer',
        '',
        questionsBlock,
        '',
        '## Output Schema (Strict-JSON expected — match exactly)',
        '',
        '```json',
        outSchema || '(missing)',
        '```',
        '',
        '## Output Instructions (CRITICAL)',
        '',
        '- Return ONLY valid JSON conforming to the schema above. No markdown fences. No commentary.',
        '- If a required file is missing or unreadable, return ONLY: { "blocker": "<path>", "reason": "<reason>" }',
        `- Use schemaHash: compute the 8-hex sha256 prefix of the canonical schema source (use placeholder "00000001" if unknown — caller will overwrite).`,
        `- Use gradingId pattern: "<schemaHash>--<ISO timestamp with dashes>"  e.g. "abc12345--2026-05-30T12-00-00Z".`,
        `- Use iteration: 1`,
        `- Use persona: ${personaJsonSnippet}`,
        `- Use area: "${area}"`,
        `- timestamp: a valid ISO-8601 date-time (today is 2026-05-30).`,
        `- answers[]: one element per question (use exact questionIds listed above).`,
        `- improvementHints[]: 1-3 short actionable hints (targetField, suggestion, priority=low|medium|high).`,
        `- Scoring guidance: use "pass"/"fail" for boolean questions, numeric 1.0..5.0 for scale-1-5, "n/a" with naReason for not-applicable.`,
        `- Closed naReason set: "not-applicable-to-tool-type", "requires-private-data", "blocked-by-precondition", "out-of-scope-resource", "out-of-scope-prompt", "out-of-scope-procedure".`
    ]
    return sections.filter( ( s ) => s !== '' ).join( '\n' ) + '\n'
}


const buildPromptForSelectionArea = async ( { area, questions, preInstructionsMap, outputSchemasMap, personaBaseTxt, personaLensTxt, domainKnowledgeTxt, selectionLockTxt, selectionJsonTxt } ) => {
    const isPersona = PERSONA_AREAS.has( area )
    const preInstr = preInstructionsMap[ area ]
    const outSchema = outputSchemasMap[ area ]
    const questionsBlock = buildQuestionsBlock( { questions, area } )

    const personaBlock = isPersona
        ? [
            '## Persona (decision-maker--crypto-trader)',
            '',
            '### Base Persona — decision-maker.md',
            personaBaseTxt || '(not found)',
            '',
            '### Lens — crypto-trader-2026.md',
            personaLensTxt || '(not found)',
            ''
        ].join( '\n' )
        : ''

    const domainBlock = ( area === 'about-selection' )
        ? [
            '## Domain Knowledge — crypto.md',
            '',
            domainKnowledgeTxt || '(not found)',
            ''
        ].join( '\n' )
        : ''

    const sections = [
        `# Mini-Practice Evaluator Prompt — area=${area}, selection=crypto-mini`,
        '',
        '## Role',
        'You are an evaluator producing a Strict-JSON grading per FlowMCP grading spec.',
        '',
        '## Pre-Instructions',
        '',
        preInstr || '(none)',
        '',
        personaBlock,
        domainBlock,
        '## Selection — crypto-mini',
        '',
        '### selection.json',
        '```json',
        selectionJsonTxt,
        '```',
        '',
        '### selection.lock.json',
        '```json',
        selectionLockTxt,
        '```',
        '',
        '## Members of crypto-mini selection',
        '',
        '7 schemas: coinmarketcap, ccxt, uniswap, dexscreener, etherscan, moralis, defillama',
        '',
        '## Questions to Answer',
        '',
        questionsBlock,
        '',
        '## Output Schema (Strict-JSON expected — match exactly)',
        '',
        '```json',
        outSchema || '(missing)',
        '```',
        '',
        '## Output Instructions (CRITICAL)',
        '',
        '- Return ONLY valid JSON conforming to the schema above. No markdown fences. No commentary.',
        '- If a required file is missing or unreadable, return ONLY: { "blocker": "<path>", "reason": "<reason>" }',
        `- schemaHash: use the placeholder "00000001" (selection-level grading — caller resolves).`,
        `- gradingId pattern: "<schemaHash>--<ISO timestamp with dashes>"  e.g. "00000001--2026-05-30T12-00-00Z".`,
        `- iteration: 1`,
        `- persona: { "basePersonaId": "decision-maker", "lensId": "crypto-trader" }`,
        `- area: "${area}"`,
        `- timestamp: a valid ISO-8601 date-time (today is 2026-05-30).`,
        `- answers[]: one element per question (use exact questionIds listed above).`,
        `- improvementHints[]: 1-3 short actionable hints (targetField, suggestion, priority).`,
        `- Closed naReason set: "not-applicable-to-tool-type", "requires-private-data", "blocked-by-precondition", "out-of-scope-resource", "out-of-scope-prompt", "out-of-scope-procedure".`
    ]
    return sections.filter( ( s ) => s !== '' ).join( '\n' ) + '\n'
}


const main = async () => {
    await mkdir( OUT_DIR, { recursive: true } )

    const questionsRaw = JSON.parse( await readFile( QUESTIONS, 'utf-8' ) )
    const questions = questionsRaw.questions

    const allAreas = [ ...PER_SCHEMA_AREAS, ...PER_SELECTION_AREAS ]

    const preInstructionsMap = {}
    const outputSchemasMap = {}

    await allAreas.reduce( async ( prev, area ) => {
        await prev
        const preInstrPath = join( REPO_ROOT, 'prompts/pre-instructions', `${area}.md` )
        const outSchemaPath = join( REPO_ROOT, 'prompts/output-schemas', `${area}.schema.json` )
        preInstructionsMap[ area ] = await readFileOrEmpty( { path: preInstrPath } )
        outputSchemasMap[ area ] = await readFileOrEmpty( { path: outSchemaPath } )
    }, Promise.resolve() )

    const personaBaseTxt = await readFileOrEmpty( { path: PERSONA_BASE } )
    const personaLensTxt = await readFileOrEmpty( { path: PERSONA_LENS } )
    const domainKnowledgeTxt = await readFileOrEmpty( { path: DOMAIN_KNOWLEDGE } )
    const selectionLockTxt = await readFileOrEmpty( { path: SELECTION_LOCK } )
    const selectionJsonTxt = ( await readFileOrEmpty( { path: SELECTION_JSON } ) ) || '(not found)'

    const built = []

    // Per-schema prompts
    await SCHEMAS.reduce( async ( prev, schemaId ) => {
        await prev
        const schemaFiles = await collectSchemaFiles( { schemaId } )

        await PER_SCHEMA_AREAS.reduce( async ( prev2, area ) => {
            await prev2
            const prompt = await buildPromptForSchemaArea( {
                schemaId, area, questions, preInstructionsMap, outputSchemasMap,
                personaBaseTxt, personaLensTxt, domainKnowledgeTxt, schemaFiles
            } )
            const outPath = join( OUT_DIR, `${area}--${schemaId}.prompt.md` )
            await writeFile( outPath, prompt, 'utf-8' )
            built.push( { outPath, bytes: prompt.length, area, schemaId } )
        }, Promise.resolve() )
    }, Promise.resolve() )

    // Per-selection prompts
    await PER_SELECTION_AREAS.reduce( async ( prev, area ) => {
        await prev
        const prompt = await buildPromptForSelectionArea( {
            area, questions, preInstructionsMap, outputSchemasMap,
            personaBaseTxt, personaLensTxt, domainKnowledgeTxt,
            selectionLockTxt, selectionJsonTxt
        } )
        const outPath = join( OUT_DIR, `${area}--crypto-mini.prompt.md` )
        await writeFile( outPath, prompt, 'utf-8' )
        built.push( { outPath, bytes: prompt.length, area, schemaId: 'crypto-mini' } )
    }, Promise.resolve() )

    const totalBytes = built.reduce( ( acc, b ) => acc + b.bytes, 0 )
    console.log( JSON.stringify( {
        promptsBuilt: built.length,
        totalBytes,
        outDir: OUT_DIR,
        files: built.map( ( b ) => ( { file: b.outPath, area: b.area, schemaId: b.schemaId, bytes: b.bytes } ) )
    }, null, 2 ) )
}


main()
    .catch( ( err ) => {
        console.error( `[FATAL] ${err.message}` )
        console.error( err.stack )
        process.exit( 1 )
    } )
