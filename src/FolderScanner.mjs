/**
 * FolderScanner — validates the grading-data/ folder layout against the v2 layout.
 *
 * Per the grading spec (gradingSpec/1.2.0 §19):
 *   - The canonical roots are providers/ , selections/ and shared-lists/.
 *   - The legacy schemas/ , single/ , phase-status/ , selection.lock.json and
 *     namespace.json checks are DROPPED (F24 drops namespace.json).
 *   - Schema snapshots live under providers/<ns>/<schema>/schema/ in the B2
 *     grammar; their filename hash MUST match the recomputed schema hash.
 *   - The source schema is NEUTRAL: an in-source `schemaHash` / `aboutHash` /
 *     `selectionHash` is flagged (SCN-012) — hashes belong in the filename and
 *     index.json, never in the source body (§10.2).
 *
 * NO SILENT DEFAULTS. Static methods only, object params, object returns.
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { SourceSnapshot, SNAPSHOT_FILENAME_REGEX } from './SourceSnapshot.mjs'


// In-source hash keys that must NOT appear in a neutral source schema body.
const IN_SOURCE_HASH_KEYS = [ 'schemaHash', 'aboutHash', 'selectionHash', 'namespaceHash' ]


class FolderScanner {
    static async scan( { gradingDataRoot } ) {
        const { status, messages } = FolderScanner.#validation( { gradingDataRoot, key: 'gradingDataRoot' } )
        if( !status ) {
            return { summary: null, issues: [], errors: messages }
        }

        const rootExists = await FolderScanner.#dirExists( { path: gradingDataRoot } )
        if( !rootExists ) {
            return {
                summary: null,
                issues: [ { severity: 'error', code: 'SCN-001', path: gradingDataRoot, message: `SCN-001: gradingDataRoot does not exist: ${gradingDataRoot}` } ],
                errors: []
            }
        }

        const providersDir = join( gradingDataRoot, 'providers' )
        const selectionsDir = join( gradingDataRoot, 'selections' )
        const sharedListsDir = join( gradingDataRoot, 'shared-lists' )

        const namespaces = await FolderScanner.#listDirs( { path: providersDir } )
        const selections = await FolderScanner.#listDirs( { path: selectionsDir } )
        const sharedLists = await FolderScanner.#listDirs( { path: sharedListsDir } )

        const issuesNested = await Promise.all( [
            ...namespaces.map( ( ns ) => FolderScanner.checkNamespaceFolder( { gradingDataRoot, namespace: ns } ) ),
            ...selections.map( ( id ) => FolderScanner.checkSelectionFolder( { gradingDataRoot, selectionId: id } ) )
        ] )

        const allIssues = issuesNested
            .reduce( ( acc, r ) => acc.concat( r.issues === undefined ? [] : r.issues ), [] )

        const totalSchemas = await Promise.all(
            namespaces.map( async ( ns ) => {
                const snaps = await SourceSnapshot.listForNamespace( { gradingDataRoot, namespace: ns } )
                return snaps.snapshots.length
            } )
        )

        const schemasCount = totalSchemas.reduce( ( a, b ) => a + b, 0 )
        const gaps = allIssues.filter( ( i ) => i.severity === 'error' ).length

        const summary = {
            namespaces: namespaces.length,
            schemas: schemasCount,
            selections: selections.length,
            sharedLists: sharedLists.length,
            gaps
        }

        return { summary, issues: allIssues, errors: [] }
    }


    static async checkNamespaceFolder( { gradingDataRoot, namespace } ) {
        const { status, messages } = FolderScanner.#validation( { gradingDataRoot, key: 'gradingDataRoot' } )
        if( !status ) { return { issues: [], errors: messages } }
        if( namespace === undefined || namespace === null || typeof namespace !== 'string' ) {
            return { issues: [], errors: [ 'SCN-002: namespace argument required' ] }
        }

        // v2: no namespace.json (F24). Just verify the schema snapshots.
        return FolderScanner.checkSchemaSnapshots( { gradingDataRoot, namespace } )
    }


    static async checkSchemaSnapshots( { gradingDataRoot, namespace } ) {
        const issues = []

        const listing = await SourceSnapshot.listForNamespace( { gradingDataRoot, namespace } )

        // Hash-Mismatch verification (import + recompute) and in-source hash-leak detection.
        const verifyResults = await Promise.all(
            listing.snapshots.map( async ( snap ) => {
                const verifyResult = await SourceSnapshot.verify( { snapshotPath: snap.path } )
                const leak = await FolderScanner.#detectInSourceHashLeak( { path: snap.path } )
                return { snap, verifyResult, leak }
            } )
        )

        verifyResults
            .forEach( ( { snap, verifyResult, leak } ) => {
                if( verifyResult.errors.length === 0 && !verifyResult.valid ) {
                    issues.push( {
                        severity: 'error',
                        code: 'SCN-005',
                        path: snap.path,
                        message: `SCN-005: Hash-Mismatch — filename hash != recomputed hash: expected ${verifyResult.expectedHash}, got ${verifyResult.actualHash}`
                    } )
                }
                if( leak.leaked ) {
                    issues.push( {
                        severity: 'error',
                        code: 'SCN-012',
                        path: snap.path,
                        message: `SCN-012: In-source hash leak — neutral schema must not carry ${leak.keys.join( ', ' )} (hashes belong in the filename + index.json)`
                    } )
                }
            } )

        return { issues, errors: [] }
    }


    static async checkSelectionFolder( { gradingDataRoot, selectionId } ) {
        const issues = []
        const selectionPath = join( gradingDataRoot, 'selections', selectionId )
        const indexPath = join( selectionPath, 'index.json' )

        // v2: a selection folder is valid when it carries an index.json (the rollup
        // + frozen lockSnapshot). The legacy selection.json / selection.lock.json
        // checks are dropped.
        const exists = await FolderScanner.#fileExists( { path: indexPath } )
        if( !exists ) {
            issues.push( {
                severity: 'error',
                code: 'SCN-008',
                path: selectionPath,
                message: `SCN-008: Dangling selection-folder — index.json missing: ${selectionPath}`
            } )
        }

        return { issues, errors: [] }
    }


    static async #detectInSourceHashLeak( { path } ) {
        try {
            const content = await readFile( path, 'utf-8' )
            const leakedKeys = IN_SOURCE_HASH_KEYS
                .filter( ( key ) => {
                    const pattern = new RegExp( `[\\s{,]${key}\\s*:` )
                    return pattern.test( content )
                } )
            return { leaked: leakedKeys.length > 0, keys: leakedKeys }
        } catch( e ) {
            return { leaked: false, keys: [] }
        }
    }


    static async #listDirs( { path } ) {
        try {
            const entries = await readdir( path, { withFileTypes: true } )
            return entries
                .filter( ( e ) => e.isDirectory() )
                .map( ( e ) => e.name )
                .sort()
        } catch( e ) { return [] }
    }


    static async #fileExists( { path } ) {
        try {
            const s = await stat( path )
            return s.isFile()
        } catch( e ) { return false }
    }


    static async #dirExists( { path } ) {
        try {
            const s = await stat( path )
            return s.isDirectory()
        } catch( e ) { return false }
    }


    static #validation( { gradingDataRoot, key } ) {
        const messages = []
        const struct = { status: false, messages }

        if( gradingDataRoot === undefined || gradingDataRoot === null ) {
            messages.push( `SCN-001: Required field missing: ${key}` )
            return struct
        }
        if( typeof gradingDataRoot !== 'string' ) {
            messages.push( `SCN-001: Type mismatch for field ${key}: expected string, got ${typeof gradingDataRoot}` )
            return struct
        }

        struct.status = true
        return struct
    }
}


export { FolderScanner }
