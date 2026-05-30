import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'


const AREA_ORDER = [
    'single-test',
    'tools-aggregate-schema',
    'namespace-description',
    'tools-aggregate-namespace',
    'about-namespace',
    'about-selection',
    'selection-skills-L1',
    'selection-skills-L2',
    'selection-skills-L3',
    'namespace-skills'
]


const AREA_LABELS = {
    'single-test': 'Area 1 — single-test',
    'tools-aggregate-schema': 'Area 2 — tools-aggregate-schema',
    'namespace-description': 'Area 3 — namespace-description',
    'tools-aggregate-namespace': 'Area 4 — tools-aggregate-namespace',
    'about-namespace': 'Area 5 — about-namespace',
    'about-selection': 'Area 6 — about-selection',
    'selection-skills-L1': 'Area 7a — selection-skills-L1',
    'selection-skills-L2': 'Area 7b — selection-skills-L2',
    'selection-skills-L3': 'Area 7c — selection-skills-L3',
    'namespace-skills': 'Area 8 — namespace-skills'
}


class QuestionCatalogDocBuilder {
    static build( { questionsJsonPath, outputMdPath } ) {
        const { struct, status } = QuestionCatalogDocBuilder.#prepareStruct( { questionsJsonPath, outputMdPath } )
        if( !status ) { return { status, struct } }

        QuestionCatalogDocBuilder.#loadQuestions( { struct } )
        if( struct.messages.length > 0 ) { return { status: false, struct } }

        QuestionCatalogDocBuilder.#groupByArea( { struct } )
        QuestionCatalogDocBuilder.#computeStats( { struct } )
        QuestionCatalogDocBuilder.#renderMd( { struct } )
        QuestionCatalogDocBuilder.#emit( { struct } )

        return { status: struct.messages.length === 0, struct }
    }


    static #prepareStruct( { questionsJsonPath, outputMdPath } ) {
        const struct = {
            questionsJsonPath,
            outputMdPath,
            questions: [],
            grouped: {},
            stats: {},
            output: '',
            messages: []
        }
        return { status: true, struct }
    }


    static #loadQuestions( { struct } ) {
        let raw = null
        try {
            raw = readFileSync( struct.questionsJsonPath, 'utf8' )
        } catch( err ) {
            struct.messages.push( `LOAD-ERROR ${struct.questionsJsonPath}: ${err.message}` )
            return
        }

        let payload = null
        try {
            payload = JSON.parse( raw )
        } catch( err ) {
            struct.messages.push( `PARSE-ERROR ${struct.questionsJsonPath}: ${err.message}` )
            return
        }

        if( !Array.isArray( payload.questions ) ) {
            struct.messages.push( `SHAPE-ERROR questions array missing in ${struct.questionsJsonPath}` )
            return
        }

        struct.questions = payload.questions
    }


    static #groupByArea( { struct } ) {
        const grouped = {}

        AREA_ORDER
            .forEach( ( area ) => {
                grouped[ area ] = []
            } )

        struct.questions
            .forEach( ( q ) => {
                if( !Object.prototype.hasOwnProperty.call( grouped, q.area ) ) {
                    struct.messages.push( `UNKNOWN-AREA ${q.id}: ${q.area}` )
                    return
                }
                grouped[ q.area ].push( q )
            } )

        AREA_ORDER
            .forEach( ( area ) => {
                grouped[ area ].sort( ( a, b ) => a.id.localeCompare( b.id ) )
            } )

        struct.grouped = grouped
    }


    static #computeStats( { struct } ) {
        const total = struct.questions.length
        const deterministic = struct.questions
            .filter( ( q ) => q.determinism === 'deterministic' )
            .length
        const nonDeterministic = struct.questions
            .filter( ( q ) => q.determinism === 'non-deterministic' )
            .length
        const mixed = struct.questions
            .filter( ( q ) => q.determinism === 'mixed' )
            .length
        const personaRequired = struct.questions
            .filter( ( q ) => q.personaRequired === true )
            .length

        const areasUsed = AREA_ORDER
            .filter( ( area ) => struct.grouped[ area ].length > 0 )
            .length

        struct.stats = {
            total,
            deterministic,
            nonDeterministic,
            mixed,
            personaRequired,
            areasUsed
        }
    }


    static #renderMd( { struct } ) {
        const generatedAt = process.env.BUILD_TS === 'fixed'
            ? '1970-01-01T00:00:00.000Z'
            : new Date().toISOString()

        const header = QuestionCatalogDocBuilder.#renderHeader( { stats: struct.stats, generatedAt } )
        const overview = QuestionCatalogDocBuilder.#renderFilenameOverview( { questions: struct.questions } )
        const sections = QuestionCatalogDocBuilder.#renderSections( { grouped: struct.grouped } )

        struct.output = `${header}\n${overview}\n${sections}`
    }


    static #renderFilenameOverview( { questions } ) {
        const order = [ 'deterministic', 'non-deterministic', 'mixed' ]
        const labels = {
            'deterministic': 'Deterministic',
            'non-deterministic': 'Non-deterministic',
            'mixed': 'Mixed'
        }

        const blocks = order
            .map( ( determinism ) => {
                const rows = questions
                    .filter( ( q ) => q.determinism === determinism )
                    .sort( ( a, b ) => ( a._sourcePath || '' ).localeCompare( b._sourcePath || '' ) )
                if( rows.length === 0 ) { return null }
                return QuestionCatalogDocBuilder.#renderOverviewBlock( { label: labels[ determinism ], rows } )
            } )
            .filter( ( b ) => b !== null )

        const intro = [
            '## Overview by Filename',
            '',
            'Generated from the question filenames and frontmatter — every test/question',
            'is exactly one self-describing file under `prompts/questions/<determinism>/`.',
            'The filename alone reveals what is tested/asked, no code reading required.',
            ''
        ].join( '\n' )

        return `${intro}\n${blocks.join( '\n\n' )}\n`
    }


    static #renderOverviewBlock( { label, rows } ) {
        const lines = [
            `### ${label} (${rows.length})`,
            '',
            '| File | ID | Area | Dimension | Question |',
            '|------|----|------|-----------|----------|'
        ]

        rows
            .forEach( ( q ) => {
                const file = q._sourcePath || '—'
                const escapedQuestion = ( q.question || '' ).replace( /\|/g, '\\|' )
                lines.push( `| \`${file}\` | \`${q.id}\` | ${q.area} | \`${q.dimension}\` | ${escapedQuestion} |` )
            } )

        return lines.join( '\n' )
    }


    static #renderHeader( { stats, generatedAt } ) {
        const lines = [
            '<!-- AUTO-GENERATED by scripts/build-question-catalog-doc.mjs — do not edit by hand -->',
            '<!-- Source: prompts/generated/questions.json -->',
            `<!-- Generated: ${generatedAt} -->`,
            '',
            '# Eval Question Catalog',
            '',
            'This page lists all **eval questions** that an LLM sub-agent answers during a',
            'grading. **Not to be confused with the',
            '[Code Test Catalog](./test-catalog.md)** — which lists the Jest tests that protect',
            'the engine itself.',
            '',
            '| Stats | Value |',
            '|-------|------|',
            `| Areas active | ${stats.areasUsed} (Area 7 with L1/L2/L3) |`,
            `| Total questions | ${stats.total} |`,
            `| Deterministic | ${stats.deterministic} |`,
            `| Non-deterministic | ${stats.nonDeterministic} |`,
            `| Mixed | ${stats.mixed} |`,
            `| Persona required | ${stats.personaRequired} |`,
            ''
        ]
        return lines.join( '\n' )
    }


    static #renderSections( { grouped } ) {
        const blocks = AREA_ORDER
            .map( ( area ) => {
                const questions = grouped[ area ]
                if( questions.length === 0 ) { return null }
                return QuestionCatalogDocBuilder.#renderAreaSection( { area, questions } )
            } )
            .filter( ( b ) => b !== null )

        return blocks.join( '\n\n' ) + '\n'
    }


    static #renderAreaSection( { area, questions } ) {
        const label = AREA_LABELS[ area ]
        const lines = [
            `## ${label}`,
            '',
            '| ID | Question | Dimension | Determinism | Persona |',
            '|----|----------|-----------|-------------|---------|'
        ]

        questions
            .forEach( ( q ) => {
                const determinismLabel = QuestionCatalogDocBuilder.#determinismLabel( { value: q.determinism } )
                const personaLabel = q.personaRequired === true ? 'yes' : 'no'
                const escapedQuestion = q.question.replace( /\|/g, '\\|' )
                lines.push( `| \`${q.id}\` | ${escapedQuestion} | \`${q.dimension}\` | ${determinismLabel} | ${personaLabel} |` )
            } )

        return lines.join( '\n' )
    }


    static #determinismLabel( { value } ) {
        if( value === 'deterministic' ) { return 'deterministic' }
        if( value === 'non-deterministic' ) { return 'non-deterministic' }
        if( value === 'mixed' ) { return 'mixed' }
        return value
    }


    static #emit( { struct } ) {
        if( struct.messages.length > 0 ) { return }

        const outDir = dirname( struct.outputMdPath )
        mkdirSync( outDir, { recursive: true } )
        writeFileSync( struct.outputMdPath, struct.output, 'utf8' )
    }
}


const isCli = import.meta.url === `file://${process.argv[ 1 ]}`
if( isCli ) {
    const args = process.argv.slice( 2 )
    const questionsJsonPath = args.find( ( a ) => a.startsWith( '--questions=' ) )?.split( '=' )[ 1 ]
        ?? 'prompts/generated/questions.json'
    const outputMdPath = args.find( ( a ) => a.startsWith( '--out=' ) )?.split( '=' )[ 1 ]
        ?? 'docs/question-catalog.md'

    const { status, struct } = QuestionCatalogDocBuilder.build( { questionsJsonPath, outputMdPath } )
    if( !status ) {
        console.error( 'BUILD FAILED' )
        struct.messages
            .forEach( ( m ) => console.error( `  - ${m}` ) )
        process.exit( 1 )
    }
    console.log( `OK ${struct.questions.length} questions emitted to ${outputMdPath}` )
}


export { QuestionCatalogDocBuilder }
