/**
 * ProjectIndex — read + write + no-overwrite init of the per-project index file.
 *
 * The index file is the single point that the three grading entry points
 * (data-pretest, single-grading, selection-grading) all write to. It lives at:
 *
 *   grading-data/
 *   └── projects/
 *       └── <projectName>/
 *           ├── index.json                    (this file)
 *           └── selection/
 *               └── <selectionId>/
 *                   ├── selection.json
 *                   └── selection.lock.json
 *
 * Schema base (flat, global, shared across all projects) stays under
 * grading-data/schemas/<namespace>/ — a project's selections reference those
 * frozen snapshots by schemaId; there is no schema duplication per project.
 *
 * Index JSON contract (indexVersion 1):
 *   {
 *     "indexVersion": 1,
 *     "projectName":  "<string>",
 *     "createdAt":    "<ISO-8601>",
 *     "updatedAt":    "<ISO-8601>",
 *     "dataPretest":       { ... },   written by the data-pretest stage
 *     "singleGradings":    { ... },   keyed by "<namespace>--<tool>" — written by single-grading
 *     "selectionGradings": { ... }    keyed by "<selectionId>"       — written by selection-grading
 *   }
 *
 * NO-OVERWRITE init: project name -> existence check -> create-if-new /
 * use-if-exists. init() NEVER overwrites an existing index.
 *
 * NO SILENT DEFAULTS. Static methods only, object params, object returns.
 */

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'


const INDEX_VERSION = 1
const INDEX_FILENAME = 'index.json'

const TOP_LEVEL_SECTIONS = Object.freeze( [ 'dataPretest', 'singleGradings', 'selectionGradings' ] )


class ProjectIndex {
    static indexPath( { gradingDataRoot, projectName } ) {
        const { status, messages } = ProjectIndex.#validationLocate( { gradingDataRoot, projectName } )
        if( !status ) { return { path: null, errors: messages } }

        const path = join( gradingDataRoot, 'projects', projectName, INDEX_FILENAME )
        return { path, errors: [] }
    }


    static async init( { gradingDataRoot, projectName } ) {
        const { status, messages } = ProjectIndex.#validationLocate( { gradingDataRoot, projectName } )
        if( !status ) { return { index: null, indexPath: null, created: false, errors: messages } }

        const projectDir = join( gradingDataRoot, 'projects', projectName )
        const indexFilePath = join( projectDir, INDEX_FILENAME )

        const exists = await ProjectIndex.#fileExists( { path: indexFilePath } )
        if( exists ) {
            const read = await ProjectIndex.read( { gradingDataRoot, projectName } )
            if( read.errors.length > 0 ) {
                return { index: null, indexPath: indexFilePath, created: false, errors: read.errors }
            }
            return {
                index: read.index,
                indexPath: indexFilePath,
                created: false,
                errors: [ 'IDX-WARN-001: Index already exists — using existing index, no overwrite' ]
            }
        }

        const now = new Date().toISOString()
        const index = {
            indexVersion: INDEX_VERSION,
            projectName,
            createdAt: now,
            updatedAt: now,
            dataPretest: {},
            singleGradings: {},
            selectionGradings: {}
        }

        await mkdir( projectDir, { recursive: true } )
        await writeFile( indexFilePath, JSON.stringify( index, null, 4 ), 'utf-8' )

        return { index, indexPath: indexFilePath, created: true, errors: [] }
    }


    static async read( { gradingDataRoot, projectName } ) {
        const { status, messages } = ProjectIndex.#validationLocate( { gradingDataRoot, projectName } )
        if( !status ) { return { index: null, errors: messages } }

        const indexFilePath = join( gradingDataRoot, 'projects', projectName, INDEX_FILENAME )
        const readResult = await ProjectIndex.#readJson( { path: indexFilePath } )
        if( readResult.errors.length > 0 ) {
            return { index: null, errors: readResult.errors }
        }

        const shapeCheck = ProjectIndex.validateIndex( { index: readResult.json } )
        if( !shapeCheck.valid ) {
            return { index: null, errors: shapeCheck.errors }
        }

        return { index: readResult.json, errors: [] }
    }


    static async write( { gradingDataRoot, projectName, index } ) {
        const { status, messages } = ProjectIndex.#validationLocate( { gradingDataRoot, projectName } )
        if( !status ) { return { indexPath: null, index: null, errors: messages } }

        const shapeCheck = ProjectIndex.validateIndex( { index } )
        if( !shapeCheck.valid ) {
            return { indexPath: null, index: null, errors: shapeCheck.errors }
        }
        if( index.projectName !== projectName ) {
            return {
                indexPath: null,
                index: null,
                errors: [ `IDX-005: projectName mismatch: index carries ${index.projectName}, write target is ${projectName}` ]
            }
        }

        const projectDir = join( gradingDataRoot, 'projects', projectName )
        const indexFilePath = join( projectDir, INDEX_FILENAME )

        const written = Object.assign( {}, index, { updatedAt: new Date().toISOString() } )

        await mkdir( projectDir, { recursive: true } )
        await writeFile( indexFilePath, JSON.stringify( written, null, 4 ), 'utf-8' )

        return { indexPath: indexFilePath, index: written, errors: [] }
    }


    static validateIndex( { index } ) {
        const errors = []

        if( index === undefined || index === null ) {
            errors.push( 'IDX-001: Required field missing: index' )
            return { valid: false, errors }
        }
        if( typeof index !== 'object' || Array.isArray( index ) ) {
            errors.push( `IDX-002: Type mismatch for field index: expected object, got ${Array.isArray( index ) ? 'array' : typeof index}` )
            return { valid: false, errors }
        }
        if( index.indexVersion !== INDEX_VERSION ) {
            errors.push( `IDX-003: Unsupported indexVersion: ${index.indexVersion} (expected ${INDEX_VERSION})` )
        }
        if( typeof index.projectName !== 'string' ) {
            errors.push( 'IDX-001: Required field missing: index.projectName' )
        }

        TOP_LEVEL_SECTIONS
            .forEach( ( section ) => {
                const value = index[ section ]
                if( value === undefined || value === null ) {
                    errors.push( `IDX-001: Required field missing: index.${section}` )
                    return
                }
                if( typeof value !== 'object' || Array.isArray( value ) ) {
                    errors.push( `IDX-002: Type mismatch for field index.${section}: expected object, got ${Array.isArray( value ) ? 'array' : typeof value}` )
                }
            } )

        return { valid: errors.length === 0, errors }
    }


    static async #readJson( { path } ) {
        try {
            const content = await readFile( path, 'utf-8' )
            try {
                const parsed = JSON.parse( content )
                return { json: parsed, errors: [] }
            } catch( parseError ) {
                return { json: null, errors: [ `IDX-004: Index format invalid: ${parseError.message}` ] }
            }
        } catch( ioError ) {
            return { json: null, errors: [ `IDX-006: Index not readable: ${path}` ] }
        }
    }


    static async #fileExists( { path } ) {
        try {
            const s = await stat( path )
            return s.isFile()
        } catch( e ) { return false }
    }


    static #validationLocate( { gradingDataRoot, projectName } ) {
        const messages = []
        const struct = { status: false, messages }

        const pairs = [
            [ 'gradingDataRoot', gradingDataRoot, 'string' ],
            [ 'projectName', projectName, 'string' ]
        ]
        pairs
            .forEach( ( [ key, value, type ] ) => {
                if( value === undefined || value === null ) {
                    messages.push( `IDX-001: Required field missing: ${key}` )
                    return
                }
                if( type === 'string' && typeof value !== 'string' ) {
                    messages.push( `IDX-001: Type mismatch for field ${key}: expected string, got ${typeof value}` )
                }
            } )

        if( messages.length > 0 ) { return struct }

        struct.status = true
        return struct
    }
}


export { ProjectIndex, INDEX_VERSION, INDEX_FILENAME }
