/**
 * SourceSnapshot — frozen schema snapshots in grading-data/providers/<ns>/<schema>/schema/.
 *
 * Per the grading spec (gradingSpec/3.0.0 §10.1 / §19):
 *   - Layout migrated schemas/ → providers/ (schema-level folders).
 *   - Filename is the B2 grammar `<name>--<YYYY-MM-DDTHH-MM-SSZ>--<hash8>.mjs`
 *     (timestamp BEFORE hash so `sort().at(-1)` yields the newest snapshot —
 *     versioning is timestamp-based; the in-source `schemaVersion` is removed).
 *   - Enforces the NO-OVERWRITE rule (a content change writes a NEW file).
 *
 * Layout:
 *   grading-data/
 *   └── providers/
 *       └── <namespace>/
 *           └── <schema>/
 *               ├── schema/<name>--<ts>--<hash8>.mjs   ← frozen snapshot (B2)
 *               └── resources/about/<name>--<ts>--<hash8>.md
 *
 * NO SILENT DEFAULTS. Static methods only, object params, object returns.
 */

import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'
import { pathToFileURL } from 'node:url'

import { HashGenerator, HASH_REGEX } from './HashGenerator.mjs'


// B2 primitive grammar: <name>--<YYYY-MM-DDTHH-MM-SSZ>--<hash8>.mjs
const SNAPSHOT_FILENAME_REGEX = /^(.+)--(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)--([0-9a-f]{8})\.mjs$/
const NAME_REGEX = /^[A-Za-z][A-Za-z0-9_-]*$/


class SourceSnapshot {
    static async create( { sourcePath, gradingDataRoot, namespace, schemaName, schemaHash } ) {
        const { status, messages } = SourceSnapshot.#validationCreate( {
            sourcePath, gradingDataRoot, namespace, schemaName, schemaHash
        } )
        if( !status ) { return { snapshotPath: null, created: false, errors: messages } }

        const sourceContent = await SourceSnapshot.#readFileSafe( { path: sourcePath } )
        if( sourceContent.errors.length > 0 ) {
            return { snapshotPath: null, created: false, errors: sourceContent.errors }
        }

        const schemaDir = join( gradingDataRoot, 'providers', namespace, schemaName, 'schema' )
        await mkdir( schemaDir, { recursive: true } )

        // No-overwrite: an existing snapshot with the SAME hash and identical
        // content is a no-op. A snapshot with the same hash but different content
        // is a conflict (SNP-004). Otherwise a NEW timestamped file is written.
        const existing = await SourceSnapshot.#findByHash( { schemaDir, schemaHash } )
        if( existing !== null ) {
            const existingContent = await SourceSnapshot.#readFileSafe( { path: existing.path } )
            if( existingContent.errors.length === 0 && existingContent.content === sourceContent.content ) {
                return { snapshotPath: existing.path, created: false, errors: [] }
            }
            return {
                snapshotPath: existing.path,
                created: false,
                errors: [ `SNP-004: Snapshot conflict — hash ${schemaHash} already present with different content` ]
            }
        }

        const ts = SourceSnapshot.#timestamp()
        const snapshotFilename = `${schemaName}--${ts}--${schemaHash}.mjs`
        const snapshotPath = join( schemaDir, snapshotFilename )

        await writeFile( snapshotPath, sourceContent.content, 'utf-8' )
        return { snapshotPath, created: true, errors: [] }
    }


    static parseSnapshotFilename( { filename } ) {
        const { status, messages } = SourceSnapshot.#validationParseFilename( { filename } )
        if( !status ) { return { name: null, timestamp: null, hash: null, errors: messages } }

        const matched = SNAPSHOT_FILENAME_REGEX.exec( filename )
        if( matched === null ) {
            return {
                name: null,
                timestamp: null,
                hash: null,
                errors: [ `SNP-003: Invalid snapshot filename format: ${filename} (expected <name>--<ts>--<hash8>.mjs)` ]
            }
        }

        return { name: matched[ 1 ], timestamp: matched[ 2 ], hash: matched[ 3 ], errors: [] }
    }


    static async verify( { snapshotPath } ) {
        const { status, messages } = SourceSnapshot.#validationVerify( { snapshotPath } )
        if( !status ) {
            return { valid: false, expectedHash: null, actualHash: null, errors: messages }
        }

        const filename = basename( snapshotPath )
        const parsed = SourceSnapshot.parseSnapshotFilename( { filename } )
        if( parsed.errors.length > 0 ) {
            return { valid: false, expectedHash: null, actualHash: null, errors: parsed.errors }
        }

        const expectedHash = parsed.hash

        const fileUrl = pathToFileURL( snapshotPath ).href
        const importResult = await SourceSnapshot.#dynamicImport( { fileUrl } )
        if( importResult.errors.length > 0 ) {
            return { valid: false, expectedHash, actualHash: null, errors: importResult.errors }
        }

        const schemaObject = importResult.module.main !== undefined
            ? importResult.module.main
            : importResult.module.schema
        if( schemaObject === undefined ) {
            return {
                valid: false,
                expectedHash,
                actualHash: null,
                errors: [ `SNP-003: Snapshot ${snapshotPath} exports neither main nor schema` ]
            }
        }

        const hashResult = HashGenerator.computeSchemaHash( { schema: schemaObject } )
        if( hashResult.errors.length > 0 ) {
            return { valid: false, expectedHash, actualHash: null, errors: hashResult.errors }
        }

        return {
            valid: expectedHash === hashResult.hash,
            expectedHash,
            actualHash: hashResult.hash,
            errors: []
        }
    }


    static async listForNamespace( { gradingDataRoot, namespace } ) {
        const { status, messages } = SourceSnapshot.#validationList( { gradingDataRoot, namespace } )
        if( !status ) { return { snapshots: [], errors: messages } }

        const namespaceDir = join( gradingDataRoot, 'providers', namespace )
        const dirExists = await SourceSnapshot.#dirExists( { path: namespaceDir } )
        if( !dirExists ) { return { snapshots: [], errors: [] } }

        // Each schema is its own folder under providers/<ns>/; the snapshots live
        // in providers/<ns>/<schema>/schema/.
        const schemaNames = await SourceSnapshot.#listDirs( { path: namespaceDir } )

        const perSchema = await Promise.all(
            schemaNames.map( async ( schemaName ) => {
                const schemaDir = join( namespaceDir, schemaName, 'schema' )
                const dirOk = await SourceSnapshot.#dirExists( { path: schemaDir } )
                if( !dirOk ) { return [] }
                const entries = await readdir( schemaDir )
                return entries
                    .filter( ( name ) => SNAPSHOT_FILENAME_REGEX.test( name ) )
                    .sort()
                    .map( ( name ) => {
                        const parsed = SourceSnapshot.parseSnapshotFilename( { filename: name } )
                        return {
                            schemaName,
                            name: parsed.name,
                            timestamp: parsed.timestamp,
                            hash: parsed.hash,
                            path: join( schemaDir, name )
                        }
                    } )
            } )
        )

        const snapshots = perSchema
            .reduce( ( acc, list ) => acc.concat( list ), [] )

        return { snapshots, errors: [] }
    }


    static async #findByHash( { schemaDir, schemaHash } ) {
        try {
            const entries = await readdir( schemaDir )
            const matched = entries
                .filter( ( name ) => SNAPSHOT_FILENAME_REGEX.test( name ) )
                .find( ( name ) => {
                    const parsed = SourceSnapshot.parseSnapshotFilename( { filename: name } )
                    return parsed.hash === schemaHash
                } )
            if( matched === undefined ) { return null }
            return { path: join( schemaDir, matched ) }
        } catch( error ) {
            return null
        }
    }


    static #timestamp() {
        const iso = new Date().toISOString()
        const noMillis = iso.replace( /\.\d{3}Z$/, 'Z' )
        return noMillis.replace( /:/g, '-' )
    }


    static async #readFileSafe( { path } ) {
        try {
            const content = await readFile( path, 'utf-8' )
            return { content, errors: [] }
        } catch( error ) {
            if( error.code === 'ENOENT' ) {
                return { content: null, errors: [ `SNP-005: Source file not readable: ${path}` ] }
            }
            return { content: null, errors: [ `SNP-005: Source file not readable: ${path} (${error.message})` ] }
        }
    }


    static async #dynamicImport( { fileUrl } ) {
        try {
            const mod = await import( fileUrl )
            return { module: mod, errors: [] }
        } catch( error ) {
            return { module: null, errors: [ `SNP-005: Dynamic import failed: ${error.message}` ] }
        }
    }


    static async #listDirs( { path } ) {
        try {
            const entries = await readdir( path, { withFileTypes: true } )
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
            const result = await stat( path )
            return result.isDirectory()
        } catch( error ) {
            return false
        }
    }


    static #validationCreate( { sourcePath, gradingDataRoot, namespace, schemaName, schemaHash } ) {
        const messages = []
        const struct = { status: false, messages }

        const pairs = [
            [ 'sourcePath', sourcePath, 'string' ],
            [ 'gradingDataRoot', gradingDataRoot, 'string' ],
            [ 'namespace', namespace, 'string' ],
            [ 'schemaName', schemaName, 'string' ],
            [ 'schemaHash', schemaHash, 'string' ]
        ]

        pairs
            .forEach( ( [ key, value, type ] ) => {
                if( value === undefined || value === null ) {
                    messages.push( `SNP-001: Required field missing: ${key}` )
                    return
                }
                if( type === 'string' && typeof value !== 'string' ) {
                    messages.push( `SNP-002: Type mismatch for field ${key}: expected string, got ${typeof value}` )
                }
            } )

        if( messages.length > 0 ) { return struct }

        if( !NAME_REGEX.test( schemaName ) ) {
            messages.push( `SNP-003: Invalid schemaName: ${schemaName} (expected [A-Za-z][A-Za-z0-9_-]*)` )
            return struct
        }
        if( !HASH_REGEX.test( schemaHash ) ) {
            messages.push( `SNP-003: Invalid schemaHash format: ${schemaHash} (expected 8 hex chars)` )
            return struct
        }

        struct.status = true
        return struct
    }


    static #validationParseFilename( { filename } ) {
        const messages = []
        const struct = { status: false, messages }

        if( filename === undefined || filename === null ) {
            messages.push( 'SNP-001: Required field missing: filename' )
            return struct
        }
        if( typeof filename !== 'string' ) {
            messages.push( `SNP-002: Type mismatch for field filename: expected string, got ${typeof filename}` )
            return struct
        }

        struct.status = true
        return struct
    }


    static #validationVerify( { snapshotPath } ) {
        const messages = []
        const struct = { status: false, messages }

        if( snapshotPath === undefined || snapshotPath === null ) {
            messages.push( 'SNP-001: Required field missing: snapshotPath' )
            return struct
        }
        if( typeof snapshotPath !== 'string' ) {
            messages.push( `SNP-002: Type mismatch for field snapshotPath: expected string, got ${typeof snapshotPath}` )
            return struct
        }

        struct.status = true
        return struct
    }


    static #validationList( { gradingDataRoot, namespace } ) {
        const messages = []
        const struct = { status: false, messages }

        const pairs = [
            [ 'gradingDataRoot', gradingDataRoot, 'string' ],
            [ 'namespace', namespace, 'string' ]
        ]

        pairs
            .forEach( ( [ key, value, type ] ) => {
                if( value === undefined || value === null ) {
                    messages.push( `SNP-001: Required field missing: ${key}` )
                    return
                }
                if( type === 'string' && typeof value !== 'string' ) {
                    messages.push( `SNP-002: Type mismatch for field ${key}: expected string, got ${typeof value}` )
                }
            } )

        if( messages.length > 0 ) { return struct }

        struct.status = true
        return struct
    }
}


export { SourceSnapshot, SNAPSHOT_FILENAME_REGEX }
