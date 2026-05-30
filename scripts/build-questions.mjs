import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'fs'
import { join, relative } from 'path'
import yaml from 'js-yaml'


class QuestionBuilder {
    static build( { rootDir, outFile } ) {
        const { struct, status } = QuestionBuilder.#prepareStruct( { rootDir, outFile } )
        if( !status ) { return { status, struct } }

        QuestionBuilder.#collectFiles( { struct } )
        QuestionBuilder.#parseFrontmatter( { struct } )
        QuestionBuilder.#validate( { struct } )
        QuestionBuilder.#emit( { struct } )

        return { status: struct.messages.length === 0, struct }
    }


    static #prepareStruct( { rootDir, outFile } ) {
        const struct = {
            rootDir,
            outFile,
            files: [],
            questions: [],
            messages: []
        }
        return { status: true, struct }
    }


    static #collectFiles( { struct } ) {
        const { rootDir } = struct
        const dims = [ 'deterministic', 'non-deterministic', 'mixed' ]
        const filenameRegex = /^\d{2}-[a-z0-9-]+\.md$/

        dims
            .forEach( ( dim ) => {
                const dimPath = join( rootDir, dim )
                const exists = QuestionBuilder.#dirExists( { dirPath: dimPath } )
                if( !exists ) { return }

                const entries = readdirSync( dimPath )
                    .filter( ( f ) => f.endsWith( '.md' ) )

                entries
                    .forEach( ( fileName ) => {
                        if( !filenameRegex.test( fileName ) ) {
                            struct.messages.push( `FILENAME-PATTERN ${dim}/${fileName} (expected ^\\d{2}-[a-z0-9-]+\\.md$)` )
                        }
                        struct.files.push( {
                            filePath: join( dimPath, fileName ),
                            folder: dim,
                            fileName
                        } )
                    } )
            } )
    }


    static #parseFrontmatter( { struct } ) {
        struct.files
            .forEach( ( { filePath, folder } ) => {
                const raw = readFileSync( filePath, 'utf8' )
                const fmMatch = raw.match( /^---\n([\s\S]*?)\n---/ )

                if( !fmMatch ) {
                    struct.messages.push( `MISSING-FRONTMATTER ${filePath}` )
                    return
                }

                try {
                    const data = yaml.load( fmMatch[ 1 ] )
                    data._sourcePath = relative( struct.rootDir, filePath )
                    data._folder = folder
                    struct.questions.push( data )
                } catch( err ) {
                    struct.messages.push( `YAML-ERROR ${filePath}: ${err.message}` )
                }
            } )
    }


    static #validate( { struct } ) {
        const required = [
            'id', 'area', 'dimension', 'question', 'scoreType',
            'weight', 'determinism', 'tier', 'filesToRead',
            'preInstructionRef', 'evaluatorTask', 'outputSchemaRef',
            'personaRequired', 'version'
        ]
        const areas = [
            'single-test', 'tools-aggregate-schema', 'namespace-description',
            'tools-aggregate-namespace', 'about-namespace', 'about-selection',
            'selection-skills-L1', 'selection-skills-L2', 'selection-skills-L3',
            'namespace-skills'
        ]
        const personaAreas = [
            'about-namespace', 'about-selection',
            'selection-skills-L1', 'selection-skills-L2', 'selection-skills-L3',
            'namespace-skills'
        ]
        const determinisms = [ 'deterministic', 'non-deterministic', 'mixed' ]
        const scoreTypes = [ 'boolean', 'scale-1-5', 'percent' ]

        struct.questions
            .forEach( ( q, index ) => {
                const ref = q.id || q._sourcePath || `index-${index}`

                const missingFields = required.filter( ( k ) => q[ k ] === undefined )
                missingFields
                    .forEach( ( k ) => {
                        struct.messages.push( `MISSING-FIELD ${k} in ${ref}` )
                    } )

                if( typeof q.id !== 'string' || !/^Q-[a-zA-Z0-9-]+-\d{2}$/.test( q.id ) ) {
                    struct.messages.push( `ID-PATTERN ${ref}: ${q.id}` )
                }

                if( !areas.includes( q.area ) ) {
                    struct.messages.push( `AREA-ENUM ${ref}: ${q.area}` )
                }

                if( !determinisms.includes( q.determinism ) ) {
                    struct.messages.push( `DETERMINISM-ENUM ${ref}: ${q.determinism}` )
                }

                if( typeof q._folder === 'string' && q._folder !== q.determinism ) {
                    struct.messages.push( `FOLDER-DETERMINISM-MISMATCH ${q._sourcePath}: folder=${q._folder}, determinism=${q.determinism}` )
                }

                if( !scoreTypes.includes( q.scoreType ) ) {
                    struct.messages.push( `SCORE-TYPE-ENUM ${ref}: ${q.scoreType}` )
                }

                if( !Array.isArray( q.filesToRead ) || q.filesToRead.length === 0 ) {
                    struct.messages.push( `FILES-TO-READ-EMPTY ${ref}` )
                }

                const shouldHavePersona = personaAreas.includes( q.area )
                if( q.personaRequired !== shouldHavePersona ) {
                    struct.messages.push( `PERSONA-MISMATCH ${ref}: expected ${shouldHavePersona}, got ${q.personaRequired}` )
                }

                if( typeof q.weight !== 'number' || q.weight < 0 || q.weight > 1 ) {
                    struct.messages.push( `WEIGHT-RANGE ${ref}: ${q.weight}` )
                }
            } )

        const weightCheck = QuestionBuilder.#checkWeights( { questions: struct.questions } )
        weightCheck
            .forEach( ( msg ) => struct.messages.push( msg ) )
    }


    static #checkWeights( { questions } ) {
        const buckets = {}
        questions
            .forEach( ( q ) => {
                if( typeof q.weight !== 'number' ) { return }
                const key = `${q.area}:${q.tier}`
                buckets[ key ] = ( buckets[ key ] || 0 ) + q.weight
            } )

        const messages = []
        Object.entries( buckets )
            .forEach( ( [ key, total ] ) => {
                if( total < 0.95 || total > 1.05 ) {
                    messages.push( `WEIGHT-SUM ${key}: ${total.toFixed( 2 )} (expected 0.95..1.05)` )
                }
            } )
        return messages
    }


    static #emit( { struct } ) {
        if( struct.messages.length > 0 ) { return }

        const outDir = struct.outFile
            .split( '/' )
            .slice( 0, -1 )
            .join( '/' )
        QuestionBuilder.#ensureDir( { dirPath: outDir } )

        const generatedAt = process.env.BUILD_TS === 'fixed'
            ? '1970-01-01T00:00:00.000Z'
            : new Date().toISOString()

        const emittedQuestions = struct.questions
            .map( ( q ) => {
                const { _folder, ...rest } = q
                return rest
            } )

        const payload = {
            version: '1.0.0',
            generatedAt,
            count: emittedQuestions.length,
            questions: emittedQuestions
        }
        writeFileSync( struct.outFile, JSON.stringify( payload, null, 2 ) + '\n' )
    }


    static #dirExists( { dirPath } ) {
        try {
            return statSync( dirPath ).isDirectory()
        } catch {
            return false
        }
    }


    static #ensureDir( { dirPath } ) {
        mkdirSync( dirPath, { recursive: true } )
    }
}


const isCli = import.meta.url === `file://${process.argv[ 1 ]}`
if( isCli ) {
    const args = process.argv.slice( 2 )
    const rootDir = args.find( ( a ) => a.startsWith( '--root=' ) )?.split( '=' )[ 1 ]
        ?? 'prompts/questions'
    const outFile = args.find( ( a ) => a.startsWith( '--out=' ) )?.split( '=' )[ 1 ]
        ?? 'prompts/generated/questions.json'

    const { status, struct } = QuestionBuilder.build( { rootDir, outFile } )
    if( !status ) {
        console.error( 'BUILD FAILED' )
        struct.messages
            .forEach( ( m ) => console.error( `  - ${m}` ) )
        process.exit( 1 )
    }
    console.log( `OK ${struct.questions.length} questions emitted to ${outFile}` )
}


export { QuestionBuilder }
