/**
 * SourceSnapshot — frozen schema snapshots in grading-data/schemas/<namespace>/.
 *
 * Per the grading spec:
 *   - Defines the folder layout for grading-data/schemas/.
 *   - Enforces the NO-OVERWRITE rule.
 *
 * Layout:
 *   grading-data/
 *   └── schemas/
 *       └── <namespace>/
 *           ├── namespace.json
 *           ├── about/<hash>--about.md
 *           └── <schema-hash>--v<X.Y.Z>.mjs   ← frozen snapshot
 *
 * NO SILENT DEFAULTS. Static methods only, object params, object returns.
 */

import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'
import { pathToFileURL } from 'node:url'

import { HashGenerator, HASH_REGEX } from './HashGenerator.mjs'


const SEMVER_REGEX = /^\d+\.\d+\.\d+$/
const SNAPSHOT_FILENAME_REGEX = /^([0-9a-f]{8})--v(\d+\.\d+\.\d+)\.mjs$/


class SourceSnapshot {
    static async create( { sourcePath, gradingDataRoot, namespace, schemaVersion, schemaHash } ) {
        const { status, messages } = SourceSnapshot.#validationCreate( {
            sourcePath, gradingDataRoot, namespace, schemaVersion, schemaHash
        } )
        if( !status ) { return { snapshotPath: null, created: false, errors: messages } }

        const sourceContent = await SourceSnapshot.#readFileSafe( { path: sourcePath } )
        if( sourceContent.errors.length > 0 ) {
            return { snapshotPath: null, created: false, errors: sourceContent.errors }
        }

        const namespaceDir = join( gradingDataRoot, 'schemas', namespace )
        const snapshotFilename = `${schemaHash}--v${schemaVersion}.mjs`
        const snapshotPath = join( namespaceDir, snapshotFilename )

        await mkdir( namespaceDir, { recursive: true } )
        await mkdir( join( namespaceDir, 'about' ), { recursive: true } )

        const existing = await SourceSnapshot.#readFileSafe( { path: snapshotPath } )
        if( existing.errors.length === 0 ) {
            // file exists — check identity
            if( existing.content === sourceContent.content ) {
                return { snapshotPath, created: false, errors: [] }
            }
            return {
                snapshotPath,
                created: false,
                errors: [ `SNP-004: Snapshot conflict — target file ${snapshotPath} exists with different content` ]
            }
        }

        await writeFile( snapshotPath, sourceContent.content, 'utf-8' )
        return { snapshotPath, created: true, errors: [] }
    }


    static parseSnapshotFilename( { filename } ) {
        const { status, messages } = SourceSnapshot.#validationParseFilename( { filename } )
        if( !status ) { return { hash: null, schemaVersion: null, errors: messages } }

        const matched = SNAPSHOT_FILENAME_REGEX.exec( filename )
        if( matched === null ) {
            return {
                hash: null,
                schemaVersion: null,
                errors: [ `SNP-003: Invalid snapshot filename format: ${filename} (expected <hash>--v<X.Y.Z>.mjs)` ]
            }
        }

        return { hash: matched[ 1 ], schemaVersion: matched[ 2 ], errors: [] }
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

        const namespaceDir = join( gradingDataRoot, 'schemas', namespace )
        const dirExists = await SourceSnapshot.#dirExists( { path: namespaceDir } )
        if( !dirExists ) { return { snapshots: [], errors: [] } }

        const entries = await readdir( namespaceDir )
        const candidates = entries
            .filter( ( name ) => SNAPSHOT_FILENAME_REGEX.test( name ) )
            .sort()

        const snapshots = candidates
            .map( ( name ) => {
                const parsed = SourceSnapshot.parseSnapshotFilename( { filename: name } )
                return {
                    hash: parsed.hash,
                    schemaVersion: parsed.schemaVersion,
                    path: join( namespaceDir, name )
                }
            } )

        return { snapshots, errors: [] }
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


    static async #dirExists( { path } ) {
        try {
            const result = await stat( path )
            return result.isDirectory()
        } catch( error ) {
            return false
        }
    }


    static #validationCreate( { sourcePath, gradingDataRoot, namespace, schemaVersion, schemaHash } ) {
        const messages = []
        const struct = { status: false, messages }

        const pairs = [
            [ 'sourcePath', sourcePath, 'string' ],
            [ 'gradingDataRoot', gradingDataRoot, 'string' ],
            [ 'namespace', namespace, 'string' ],
            [ 'schemaVersion', schemaVersion, 'string' ],
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

        if( !SEMVER_REGEX.test( schemaVersion ) ) {
            messages.push( `SNP-003: Invalid semver for schemaVersion: ${schemaVersion}` )
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
