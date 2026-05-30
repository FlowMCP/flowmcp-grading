import { readFileSync, writeFileSync, mkdirSync } from 'fs'


class TestCatalogBuilder {
    static build( { questionsFile, outFile } ) {
        const { struct, status } = TestCatalogBuilder.#prepareStruct( { questionsFile, outFile } )
        if( !status ) { return { status, struct } }

        TestCatalogBuilder.#loadQuestions( { struct } )
        TestCatalogBuilder.#deriveMapping( { struct } )
        TestCatalogBuilder.#emit( { struct } )

        return { status: struct.messages.length === 0, struct }
    }


    static #prepareStruct( { questionsFile, outFile } ) {
        const struct = {
            questionsFile,
            outFile,
            questions: [],
            mapping: [],
            messages: []
        }
        return { status: true, struct }
    }


    static #loadQuestions( { struct } ) {
        try {
            const raw = readFileSync( struct.questionsFile, 'utf8' )
            const payload = JSON.parse( raw )
            if( !Array.isArray( payload.questions ) ) {
                struct.messages.push( `LOAD-ERROR: questions array missing in ${struct.questionsFile}` )
                return
            }
            struct.questions = payload.questions
        } catch( err ) {
            struct.messages.push( `LOAD-ERROR: ${err.message}` )
        }
    }


    static #deriveMapping( { struct } ) {
        const bucketMap = {
            'deterministic': {
                'single-test': 'tests/unit/v1/validation.test.mjs (route-level)',
                'tools-aggregate-schema': 'tests/unit/v1/schemaValidator.test.mjs',
                'tools-aggregate-namespace': 'tests/integration/namespace.test.mjs',
                'about-namespace': 'tests/integration/aboutConsistency.test.mjs',
                'about-selection': 'tests/integration/aboutConsistency.test.mjs',
                '__default': 'tests/integration/generic.test.mjs'
            },
            'non-deterministic': {
                '__default': 'no-code-test (eval-question, LLM-only)'
            },
            'mixed': {
                '__default': 'partial-code-test + eval-question'
            }
        }

        struct.questions
            .forEach( ( q ) => {
                const determinismMap = bucketMap[ q.determinism ] || {}
                const bucket = determinismMap[ q.area ] || determinismMap[ '__default' ] || 'no-mapping'
                struct.mapping.push( {
                    id: q.id,
                    area: q.area,
                    dimension: q.dimension,
                    determinism: q.determinism,
                    codeTestBucket: bucket
                } )
            } )
    }


    static #emit( { struct } ) {
        if( struct.messages.length > 0 ) { return }

        const outDir = struct.outFile
            .split( '/' )
            .slice( 0, -1 )
            .join( '/' )
        if( outDir.length > 0 ) {
            mkdirSync( outDir, { recursive: true } )
        }

        const generatedAt = process.env.BUILD_TS === 'fixed'
            ? '1970-01-01T00:00:00.000Z'
            : new Date().toISOString()

        const lines = [
            '# Code Test Catalog (auto-generated)',
            '',
            '> Source: `prompts/generated/questions.json` — generated via `scripts/build-test-catalog.mjs`',
            '> The catalog is derived from the questions, NOT maintained manually.',
            `> generatedAt: ${generatedAt}`,
            '',
            '## Mapping Question → Code-Test-Bucket',
            '',
            '| Question-ID | Area | Dimension | Determinism | Code-Test-Bucket |',
            '|-------------|------|-----------|-------------|------------------|'
        ]

        struct.mapping
            .forEach( ( m ) => {
                lines.push( `| ${m.id} | ${m.area} | ${m.dimension} | ${m.determinism} | ${m.codeTestBucket} |` )
            } )

        writeFileSync( struct.outFile, lines.join( '\n' ) + '\n' )
    }
}


const isCli = import.meta.url === `file://${process.argv[ 1 ]}`
if( isCli ) {
    const args = process.argv.slice( 2 )
    const questionsFile = args.find( ( a ) => a.startsWith( '--questions=' ) )?.split( '=' )[ 1 ]
        ?? 'prompts/generated/questions.json'
    const outFile = args.find( ( a ) => a.startsWith( '--out=' ) )?.split( '=' )[ 1 ]
        ?? 'prompts/generated/test-catalog.json'

    if( outFile.endsWith( '.md' ) ) {
        const { status, struct } = TestCatalogBuilder.build( { questionsFile, outFile } )
        if( !status ) {
            console.error( 'BUILD FAILED' )
            struct.messages
                .forEach( ( m ) => console.error( `  - ${m}` ) )
            process.exit( 1 )
        }
        console.log( `OK ${struct.mapping.length} mappings emitted to ${outFile}` )
    } else {
        const mdOut = outFile.replace( /\.json$/, '.md' )
        const jsonOut = outFile

        const { status, struct } = TestCatalogBuilder.build( { questionsFile, outFile: mdOut } )
        if( !status ) {
            console.error( 'BUILD FAILED' )
            struct.messages
                .forEach( ( m ) => console.error( `  - ${m}` ) )
            process.exit( 1 )
        }

        const generatedAt = process.env.BUILD_TS === 'fixed'
            ? '1970-01-01T00:00:00.000Z'
            : new Date().toISOString()
        const payload = {
            version: '1.0.0',
            generatedAt,
            count: struct.mapping.length,
            mapping: struct.mapping
        }
        const outDir = jsonOut
            .split( '/' )
            .slice( 0, -1 )
            .join( '/' )
        if( outDir.length > 0 ) {
            mkdirSync( outDir, { recursive: true } )
        }
        writeFileSync( jsonOut, JSON.stringify( payload, null, 2 ) + '\n' )
        console.log( `OK ${struct.mapping.length} mappings emitted to ${jsonOut} + ${mdOut}` )
    }
}


export { TestCatalogBuilder }
