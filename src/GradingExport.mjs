/**
 * GradingExport — the OUT side of the IN/OUT round-trip (gradingSpec/3.0.0 §22.3.2).
 *
 * `grading export <namespace|selection>`: the graded workbench state flows back
 * toward the real repository. Two guarantees:
 *
 *   - The PRIMARY hand-off is the `index.json` — the complete graded state
 *     (status, grade, member resolution, lockSnapshot). It is copied verbatim
 *     into a FRESH export folder.
 *   - The export MUST NOT overwrite the source. Snapshots are never touched; the
 *     export folder is created fresh and a pre-existing export folder is a
 *     conflict (EXP-003), never an overwrite.
 *
 * Optionally the clean, stripped schema `.mjs` files (resolved via
 * RebuildIndex.resolveLatest, names stripped of the internal --<ts>--<hash8>
 * suffix) MAY accompany the hand-off.
 *
 * Module reads NO .env. NO SILENT DEFAULTS. Static methods, object params,
 * object returns.
 */

import { readFile, writeFile, mkdir, readdir, stat, access } from 'node:fs/promises'
import { join } from 'node:path'

import { RebuildIndex } from './RebuildIndex.mjs'


const PRIMITIVE_FILENAME_REGEX = /^(.+)--(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)--([0-9a-f]{8})\.mjs$/
const INDEX_FILENAME = 'index.json'


class GradingExport {
    /**
     * run — export the graded state of a namespace or selection into a fresh dir.
     *
     * @param {Object} params
     * @param {string} params.target — path to providers/<ns>/ or selections/<sel>/
     * @param {string} params.exportDir — fresh destination folder (must not exist yet)
     * @param {boolean} [params.includeSchemas] — also write stripped .mjs (default false)
     * @returns {Promise<{ status, flow, indexExportPath, schemaExports: Object[], errors: string[] }>}
     */
    static async run( { target, exportDir, includeSchemas } ) {
        const empty = { status: false, flow: null, indexExportPath: null, schemaExports: [] }
        const { status, messages } = GradingExport.#validationRun( { target, exportDir, includeSchemas } )
        if( !status ) { return { ...empty, errors: messages } }

        const flowResult = await GradingExport.#detectFlow( { target } )
        if( flowResult.errors.length > 0 ) { return { ...empty, errors: flowResult.errors } }
        const flow = flowResult.flow

        const indexPath = join( target, INDEX_FILENAME )
        const indexRead = await GradingExport.#readIndex( { path: indexPath } )
        if( indexRead.errors.length > 0 ) { return { ...empty, flow, errors: indexRead.errors } }

        // No-overwrite against the destination: a pre-existing export folder is a
        // conflict, never an overwrite. The SOURCE (target) is never written to.
        const exportExists = await GradingExport.#pathExists( { path: exportDir } )
        if( exportExists ) {
            return { ...empty, flow, errors: [ `EXP-003: export folder already exists (no overwrite): ${exportDir}` ] }
        }
        await mkdir( exportDir, { recursive: true } )

        const indexExportPath = join( exportDir, INDEX_FILENAME )
        await writeFile( indexExportPath, JSON.stringify( indexRead.index, null, 4 ), 'utf-8' )

        const schemaExports = []
        if( includeSchemas === true && flow === 'namespace' ) {
            const stripped = await GradingExport.#exportStrippedSchemas( { target, exportDir } )
            if( stripped.errors.length > 0 ) {
                return { status: false, flow, indexExportPath, schemaExports: stripped.schemaExports, errors: stripped.errors }
            }
            stripped.schemaExports.forEach( ( s ) => schemaExports.push( s ) )
        }

        return { status: true, flow, indexExportPath, schemaExports, errors: [] }
    }


    /**
     * #exportStrippedSchemas — resolve the newest snapshot per schema folder and
     * write it under its CLEAN logical name (the internal --<ts>--<hash8> suffix
     * is stripped). Writes into a `schemas/` sub-folder of the fresh export dir;
     * the island source snapshots are never touched.
     */
    static async #exportStrippedSchemas( { target, exportDir } ) {
        const schemaExports = []
        const errors = []

        const schemaNames = await GradingExport.#listSubDirs( { dir: target } )
        const filtered = schemaNames
            .filter( ( name ) => name !== '_gradings' )

        const schemasOutDir = join( exportDir, 'schemas' )
        await mkdir( schemasOutDir, { recursive: true } )

        await filtered
            .reduce( async ( prev, schemaName ) => {
                await prev
                const snapshotDir = join( target, schemaName, 'schema' )
                const resolved = await RebuildIndex.resolveLatest( { dir: snapshotDir, logicalName: schemaName } )
                if( !resolved.status ) {
                    // A schema folder without a resolvable snapshot is not exportable;
                    // record it explicitly (no silent skip).
                    errors.push( `EXP-004: no resolvable snapshot for schema ${schemaName} in ${snapshotDir}` )
                    return
                }
                const parsed = PRIMITIVE_FILENAME_REGEX.exec( resolved.file )
                if( parsed === null ) {
                    errors.push( `EXP-004: snapshot filename not parseable: ${resolved.file}` )
                    return
                }
                const content = await GradingExport.#readSafe( { path: resolved.path } )
                if( content.errors.length > 0 ) { content.errors.forEach( ( e ) => errors.push( e ) ); return }

                const cleanName = `${parsed[ 1 ]}.mjs`
                const outPath = join( schemasOutDir, cleanName )
                await writeFile( outPath, content.content, 'utf-8' )
                schemaExports.push( { schemaName, sourceSnapshot: resolved.file, exportPath: outPath } )
            }, Promise.resolve() )

        return { schemaExports, errors }
    }


    static async #detectFlow( { target } ) {
        const exists = await GradingExport.#dirExists( { path: target } )
        if( !exists ) { return { flow: null, errors: [ `EXP-001: target not found: ${target}` ] } }

        // F29: disambiguate providers/<ns>/ vs selections/<sel>/ by the presence
        // of a selection definition folder. A folder carrying BOTH a selection
        // definition AND schema sub-folders is ambiguous → error with fix.
        const hasSelectionDef = await GradingExport.#dirExists( { path: join( target, 'selection' ) } )
        const subDirs = await GradingExport.#listSubDirs( { dir: target } )
        const schemaSubDirs = subDirs
            .filter( ( name ) => name !== '_gradings' && name !== 'selection' && name !== 'resources' && name !== 'skills' && name !== 'prompts' && name !== 'tools' )

        if( hasSelectionDef && schemaSubDirs.length > 0 ) {
            return { flow: null, errors: [ `EXP-002: ambiguous target — found both a selection/ definition and schema sub-folders in ${target}. Fix: point at a clean providers/<ns>/ or selections/<sel>/ folder.` ] }
        }
        if( hasSelectionDef ) { return { flow: 'selection', errors: [] } }
        if( schemaSubDirs.length > 0 ) { return { flow: 'namespace', errors: [] } }

        return { flow: null, errors: [ `EXP-002: cannot determine flow for ${target} — neither a selection definition nor schema sub-folders present.` ] }
    }


    static async #readIndex( { path } ) {
        try {
            const content = await readFile( path, 'utf-8' )
            try {
                return { index: JSON.parse( content ), errors: [] }
            } catch( parseError ) {
                return { index: null, errors: [ `EXP-005: index.json not parseable: ${parseError.message}` ] }
            }
        } catch( ioError ) {
            return { index: null, errors: [ `EXP-005: index.json not found (run import/rebuild first): ${path}` ] }
        }
    }


    static async #readSafe( { path } ) {
        try {
            const content = await readFile( path, 'utf-8' )
            return { content, errors: [] }
        } catch( error ) {
            return { content: null, errors: [ `EXP-004: schema snapshot not readable: ${path}` ] }
        }
    }


    static async #listSubDirs( { dir } ) {
        try {
            const entries = await readdir( dir, { withFileTypes: true } )
            return entries
                .filter( ( e ) => e.isDirectory() )
                .map( ( e ) => e.name )
                .sort()
        } catch( error ) {
            return []
        }
    }


    static async #dirExists( { path } ) {
        try {
            const s = await stat( path )
            return s.isDirectory()
        } catch( error ) {
            return false
        }
    }


    static async #pathExists( { path } ) {
        try {
            await access( path )
            return true
        } catch( error ) {
            return false
        }
    }


    static #validationRun( { target, exportDir, includeSchemas } ) {
        const messages = []
        const struct = { status: false, messages }

        const pairs = [
            [ 'target', target ],
            [ 'exportDir', exportDir ]
        ]
        pairs
            .forEach( ( [ key, value ] ) => {
                if( value === undefined || value === null ) {
                    messages.push( `EXP-001: Required field missing: ${key}` )
                    return
                }
                if( typeof value !== 'string' ) {
                    messages.push( `EXP-001: Type mismatch for field ${key}: expected string, got ${typeof value}` )
                }
            } )

        if( includeSchemas !== undefined && typeof includeSchemas !== 'boolean' ) {
            messages.push( `EXP-001: Type mismatch for field includeSchemas: expected boolean, got ${typeof includeSchemas}` )
        }

        if( messages.length > 0 ) { return struct }

        struct.status = true
        return struct
    }
}


export { GradingExport }
