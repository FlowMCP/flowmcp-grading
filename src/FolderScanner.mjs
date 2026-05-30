/**
 * FolderScanner — validates the grading-data/ folder layout against the expected layout.
 *
 * Per the grading spec:
 *   - Defines the canonical folder layout.
 *   - Defines the folder-scanner checks SCN-001..010.
 *
 * Layout checks:
 *   - schemas/<ns>/namespace.json MUST exist
 *   - schemas/<ns>/<hash>--v<X.Y.Z>.mjs hash matches recomputed
 *   - single/<ns>--<tool>/ MUST correspond to namespace.json members
 *   - selection/<id>/selection.json MUST exist
 *   - phase-status/single/<ns>--<tool>.json hash matches snapshot hash
 *   - projects/<projectName>/index.json MUST exist and be a valid index (SCN-011)
 *
 * NO SILENT DEFAULTS. Static methods only, object params, object returns.
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { SourceSnapshot, SNAPSHOT_FILENAME_REGEX } from './SourceSnapshot.mjs'
import { ProjectIndex } from './ProjectIndex.mjs'


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

        const schemasDir = join( gradingDataRoot, 'schemas' )
        const singleDir = join( gradingDataRoot, 'single' )
        const selectionDir = join( gradingDataRoot, 'selection' )
        const projectsDir = join( gradingDataRoot, 'projects' )

        const namespaces = await FolderScanner.#listDirs( { path: schemasDir } )
        const singles = await FolderScanner.#listDirs( { path: singleDir } )
        const selections = await FolderScanner.#listDirs( { path: selectionDir } )
        const projects = await FolderScanner.#listDirs( { path: projectsDir } )

        const issuesNested = await Promise.all( [
            ...namespaces.map( ( ns ) => FolderScanner.checkNamespaceFolder( { gradingDataRoot, namespace: ns } ) ),
            ...singles.map( ( nsTool ) => FolderScanner.#checkSingleFolder( { gradingDataRoot, namespaceTool: nsTool, namespaces } ) ),
            ...selections.map( ( id ) => FolderScanner.checkSelectionFolder( { gradingDataRoot, selectionId: id } ) ),
            ...projects.map( ( name ) => FolderScanner.checkProjectIndex( { gradingDataRoot, projectName: name } ) ),
            FolderScanner.checkPhaseStatus( { gradingDataRoot } )
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
            singles: singles.length,
            selections: selections.length,
            projects: projects.length,
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

        const issues = []
        const namespacePath = join( gradingDataRoot, 'schemas', namespace )
        const namespaceJsonPath = join( namespacePath, 'namespace.json' )
        const exists = await FolderScanner.#fileExists( { path: namespaceJsonPath } )
        if( !exists ) {
            issues.push( { severity: 'error', code: 'SCN-002', path: namespaceJsonPath, message: `SCN-002: namespace.json missing: ${namespaceJsonPath}` } )
            return { issues, errors: [] }
        }

        let nsJson = null
        try {
            const raw = await readFile( namespaceJsonPath, 'utf-8' )
            nsJson = JSON.parse( raw )
        } catch( e ) {
            issues.push( { severity: 'error', code: 'SCN-003', path: namespaceJsonPath, message: `SCN-003: namespace.json malformed: ${e.message}` } )
            return { issues, errors: [] }
        }

        const snapshotIssues = await FolderScanner.checkSchemaSnapshots( { gradingDataRoot, namespace } )
        snapshotIssues.issues
            .forEach( ( i ) => issues.push( i ) )

        // About-Page-Hash check (informational warning when present in namespace.json)
        if( typeof nsJson.aboutHash === 'string' ) {
            const aboutDir = join( namespacePath, 'about' )
            const aboutFiles = await FolderScanner.#listFiles( { path: aboutDir } )
            const matched = aboutFiles
                .find( ( f ) => f.startsWith( `${nsJson.aboutHash}--about` ) )
            if( matched === undefined && aboutFiles.length > 0 ) {
                issues.push( {
                    severity: 'warning',
                    code: 'SCN-006',
                    path: aboutDir,
                    message: 'SCN-006: About-Page-Hash does not match namespace.json#aboutHash'
                } )
            }
        }

        return { issues, errors: [] }
    }


    static async checkSchemaSnapshots( { gradingDataRoot, namespace } ) {
        const issues = []
        const namespacePath = join( gradingDataRoot, 'schemas', namespace )
        const namespaceJsonPath = join( namespacePath, 'namespace.json' )

        let nsJson = null
        try {
            const raw = await readFile( namespaceJsonPath, 'utf-8' )
            nsJson = JSON.parse( raw )
        } catch( e ) {
            // Already reported by checkNamespaceFolder
            return { issues: [], errors: [] }
        }

        const declaredHashes = Array.isArray( nsJson.members )
            ? nsJson.members.map( ( m ) => m.schemaHash ).filter( ( h ) => typeof h === 'string' )
            : []

        const listing = await SourceSnapshot.listForNamespace( { gradingDataRoot, namespace } )
        const snapshotHashes = listing.snapshots.map( ( s ) => s.hash )

        // Orphans: snapshot files not in namespace.json members[]
        if( declaredHashes.length > 0 ) {
            const orphans = snapshotHashes.filter( ( h ) => !declaredHashes.includes( h ) )
            orphans
                .forEach( ( h ) => {
                    issues.push( {
                        severity: 'error',
                        code: 'SCN-004',
                        path: join( namespacePath, `${h}--v?.?.?.mjs` ),
                        message: `SCN-004: Orphan schema snapshot — hash not in namespace.json: ${h}`
                    } )
                } )
        }

        // Hash mismatch verification (best-effort: import + recompute)
        const verifyResults = await Promise.all(
            listing.snapshots.map( async ( snap ) => {
                const verifyResult = await SourceSnapshot.verify( { snapshotPath: snap.path } )
                return { snap, verifyResult }
            } )
        )

        verifyResults
            .forEach( ( { snap, verifyResult } ) => {
                if( verifyResult.errors.length > 0 ) {
                    // do not duplicate; report only when hashes diverge
                    return
                }
                if( !verifyResult.valid ) {
                    issues.push( {
                        severity: 'error',
                        code: 'SCN-005',
                        path: snap.path,
                        message: `SCN-005: Hash-Mismatch — filename hash != recomputed hash: expected ${verifyResult.expectedHash}, got ${verifyResult.actualHash}`
                    } )
                }
            } )

        return { issues, errors: [] }
    }


    static async checkSelectionFolder( { gradingDataRoot, selectionId } ) {
        const issues = []
        const selectionPath = join( gradingDataRoot, 'selection', selectionId )
        const selectionJsonPath = join( selectionPath, 'selection.json' )

        const exists = await FolderScanner.#fileExists( { path: selectionJsonPath } )
        if( !exists ) {
            issues.push( {
                severity: 'error',
                code: 'SCN-008',
                path: selectionPath,
                message: `SCN-008: Dangling selection-folder — selection.json missing: ${selectionPath}`
            } )
            return { issues, errors: [] }
        }

        // Lockfile-consistency check is delegated to the selection validator. Here we only assert the file existence.
        const lockfilePath = join( selectionPath, 'selection.lock.json' )
        const lockExists = await FolderScanner.#fileExists( { path: lockfilePath } )
        if( !lockExists ) {
            issues.push( {
                severity: 'error',
                code: 'SCN-009',
                path: lockfilePath,
                message: `SCN-009: Lockfile-Consistency error (delegated): selection.lock.json missing at ${lockfilePath}`
            } )
        }

        return { issues, errors: [] }
    }


    static async checkProjectIndex( { gradingDataRoot, projectName } ) {
        const { status, messages } = FolderScanner.#validation( { gradingDataRoot, key: 'gradingDataRoot' } )
        if( !status ) { return { issues: [], errors: messages } }
        if( projectName === undefined || projectName === null || typeof projectName !== 'string' ) {
            return { issues: [], errors: [ 'SCN-011: projectName argument required' ] }
        }

        const issues = []
        const projectDir = join( gradingDataRoot, 'projects', projectName )
        const indexPath = join( projectDir, 'index.json' )

        const exists = await FolderScanner.#fileExists( { path: indexPath } )
        if( !exists ) {
            issues.push( {
                severity: 'error',
                code: 'SCN-011',
                path: indexPath,
                message: `SCN-011: project index missing: ${indexPath}`
            } )
            return { issues, errors: [] }
        }

        const read = await ProjectIndex.read( { gradingDataRoot, projectName } )
        if( read.errors.length > 0 ) {
            issues.push( {
                severity: 'error',
                code: 'SCN-011',
                path: indexPath,
                message: `SCN-011: project index invalid: ${read.errors.join( '; ' )}`
            } )
        }

        return { issues, errors: [] }
    }


    static async checkPhaseStatus( { gradingDataRoot } ) {
        const issues = []
        const psDir = join( gradingDataRoot, 'phase-status', 'single' )
        const exists = await FolderScanner.#dirExists( { path: psDir } )
        if( !exists ) { return { issues, errors: [] } }

        const entries = await readdir( psDir )
        const jsons = entries.filter( ( n ) => n.endsWith( '.json' ) )

        await Promise.all(
            jsons.map( async ( name ) => {
                const path = join( psDir, name )
                try {
                    const raw = await readFile( path, 'utf-8' )
                    const ps = JSON.parse( raw )
                    if( ps.schemaHash === undefined || ps.schemaHash === null ) { return }
                    // verify the hash matches a snapshot somewhere — heuristic: derive namespace from filename
                    const baseName = name.replace( /\.json$/, '' )
                    const namespace = baseName.split( '--' )[ 0 ]
                    const listing = await SourceSnapshot.listForNamespace( { gradingDataRoot, namespace } )
                    const matched = listing.snapshots.find( ( s ) => s.hash === ps.schemaHash )
                    if( matched === undefined ) {
                        issues.push( {
                            severity: 'warning',
                            code: 'SCN-010',
                            path,
                            message: `SCN-010: phase-status references non-existent schemaHash: ${ps.schemaHash}`
                        } )
                    }
                } catch( e ) {
                    // ignore malformed; reporting handled elsewhere
                }
            } )
        )

        return { issues, errors: [] }
    }


    static async #checkSingleFolder( { gradingDataRoot, namespaceTool, namespaces } ) {
        const issues = []
        const ns = namespaceTool.split( '--' )[ 0 ]
        if( !namespaces.includes( ns ) ) {
            issues.push( {
                severity: 'error',
                code: 'SCN-007',
                path: join( gradingDataRoot, 'single', namespaceTool ),
                message: `SCN-007: Dangling single-folder — no matching namespace: ${namespaceTool}`
            } )
        }
        return { issues, errors: [] }
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


    static async #listFiles( { path } ) {
        try {
            const entries = await readdir( path )
            return entries
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
