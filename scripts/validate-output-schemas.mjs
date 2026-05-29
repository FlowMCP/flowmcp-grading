import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'


const __filename = fileURLToPath( import.meta.url )
const __dirname = dirname( __filename )
const projectRoot = resolve( __dirname, '..' )
const schemaDir = join( projectRoot, 'prompts', 'output-schemas' )


const loadSchema = ( filename ) => {
    const path = join( schemaDir, filename )
    const raw = readFileSync( path, 'utf8' )
    const parsed = JSON.parse( raw )
    return { filename, path, schema: parsed }
}


const files = readdirSync( schemaDir )
    .filter( ( f ) => f.endsWith( '.schema.json' ) )
    .sort()

const ajv = new Ajv2020( {
    strict: true,
    allErrors: true,
    allowUnionTypes: false
} )
addFormats( ajv )


// Load and pre-register all schemas so that $ref resolution between files works.
const masterFilename = '_master.schema.json'
const entries = files
    .map( ( filename ) => loadSchema( filename ) )

// Add master first to satisfy $ref targets in per-area schemas.
const master = entries.find( ( e ) => e.filename === masterFilename )
if( !master ) {
    console.error( JSON.stringify( { status: 'fatal', reason: 'missing-master-schema' }, null, 4 ) )
    process.exit( 1 )
}

ajv.addSchema( master.schema, masterFilename )


const results = entries
    .filter( ( entry ) => entry.filename !== masterFilename )
    .map( ( entry ) => {
        try {
            ajv.compile( entry.schema )
            return { file: entry.filename, status: 'valid' }
        } catch( error ) {
            return { file: entry.filename, status: 'invalid', error: error.message }
        }
    } )


// Validate master as a meta-check (it has no top-level type — just $defs — but ajv should still accept it).
let masterResult
try {
    ajv.compile( { $ref: `${masterFilename}#/$defs/envelope` } )
    masterResult = { file: masterFilename, status: 'valid' }
} catch( error ) {
    masterResult = { file: masterFilename, status: 'invalid', error: error.message }
}

const allResults = [ masterResult, ...results ]
const failures = allResults.filter( ( r ) => r.status === 'invalid' )

if( failures.length > 0 ) {
    console.error( JSON.stringify( { status: 'FAIL', failures }, null, 4 ) )
    process.exit( 1 )
}

console.log( JSON.stringify( {
    status: 'PASS',
    total: allResults.length,
    files: allResults.map( ( r ) => r.file )
}, null, 4 ) )
