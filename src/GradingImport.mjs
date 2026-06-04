/**
 * GradingImport — the IN side of the IN/OUT round-trip (gradingSpec/1.2.0 §22.3.1).
 *
 * `grading import <provider-path>`: a provider folder (one namespace, possibly
 * several schema .mjs files) flows from the real repository into the workbench
 * island. The flow is strictly non-destructive — the island never overwrites a
 * source snapshot.
 *
 * Pipeline:
 *   1. Scan the `.mjs` files in providerPath.
 *   2. `flowmcp validate` gate — STRUCTURAL validation in-module (the schema
 *      imports, exposes a `main`/`schema` object with a namespace + name + tools).
 *      A live API validation (request/key) is NOT performed here: the module
 *      reads no .env and makes no network call. The CLI layer (P4) injects the
 *      live `flowmcp validate` over the same gate seam — see #structuralValidate.
 *   3. Single-namespace assertion — one folder == one namespace. If the scanned
 *      schemas disagree on the namespace, ABORT (no silent skip).
 *   4. Existence check, NO-OVERWRITE — missing → create; new content hash →
 *      write a new snapshot ALONGSIDE the old one; identical hash → skip.
 *   5. Convert into the island structure (resources → resources/about/, skills →
 *      skills/<skill>/ with inline skills normalised via InlineSkillNormalizer).
 *   6. Rebuild index.json via RebuildIndex.rebuildNamespaceIndex.
 *
 * Module reads NO .env. NO SILENT DEFAULTS. Static methods, object params,
 * object returns.
 */

import { readdir, writeFile, mkdir, stat, readFile, rm, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'

import { HashGenerator } from './HashGenerator.mjs'
import { SourceSnapshot } from './SourceSnapshot.mjs'
import { InlineSkillNormalizer, INLINE_BODY_KEYS } from './InlineSkillNormalizer.mjs'
import { RebuildIndex } from './RebuildIndex.mjs'
import { Grading } from './Grading.mjs'


const NAME_REGEX = /^[A-Za-z][A-Za-z0-9_-]*$/
// v4 namespace constraint (REV-09 Kap. 9.1): lowercase, digits, hyphen; e.g.
// `coingecko-com`. The foldername-fallback name is validated against THIS, not
// the broader file-slug NAME_REGEX. No silent normalisation.
const NAMESPACE_REGEX = /^[a-z][a-z0-9-]*$/
// Reason for the emit-on-failure blocked node (PRD-001 AC-2). Matches the closed
// blockedReason set in Grading.VALID_BLOCKED_REASONS.
const BLOCKED_REASON_VALIDATION_FAILED = 'validation-failed'
const ABOUT_FILENAME_REGEX = /^(.+)--(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)--([0-9a-f]{8})\.md$/
// Shared-list snapshotting. A schema that declares `main.sharedLists`
// resolves each ref to a `<kebab(ref)>.mjs` file in a `_lists/`-or-`_shared/`
// directory found by walking UP from the schema file (FlowMCP.resolveSharedLists +
// SharedListResolver). The grading island snapshot is a single schema file with NO
// such directory above it, so BOTH the CLI (#resolveSharedListsForSchema) AND the
// DataPretest (#resolveHandlers) re-resolution walk up and find nothing → sharedLists
// = {} → the handler factory throws `reading 'filter'`. The fix makes the island
// self-contained: copy the referenced list files into providers/<ns>/<schema>/_lists/
// (found by the same up-walk at the schema-folder level, invisible to the
// namespace-level schema-dir scanners which never enumerate a `_`-prefixed sibling).
const LIST_DIR_NAMES = Object.freeze( [ '_lists', '_shared' ] )
const MAX_LIST_DIR_LEVELS = 10


class GradingImport {
    /**
     * run — execute the full import pipeline for a provider folder.
     *
     * @param {Object} params
     * @param {string} params.providerPath — folder holding one namespace's schema .mjs files
     * @param {string} params.gradingDataRoot — island root (grading-data/)
     * @param {Function} [params.validateGate] — optional injected gate (CLI passes the
     *        real flowmcp validate). Signature: ( { schema, sourcePath } ) → { valid, errors }.
     *        Default = #structuralValidate.
     * @returns {Promise<{ status, namespace, imported: Object[], skipped: Object[], normalizedSkills: Object[], indexPath, errors: string[] }>}
     */
    static async run( { providerPath, gradingDataRoot, validateGate } ) {
        const empty = { status: false, namespace: null, blocked: false, blockedReason: null, fallbackUsed: false, renamedFrom: null, imported: [], skipped: [], normalizedSkills: [], indexPath: null }
        const { status, messages } = GradingImport.#validationRun( { providerPath, gradingDataRoot, validateGate } )
        if( !status ) { return { ...empty, errors: messages } }

        const gate = validateGate === undefined ? GradingImport.#structuralValidate : validateGate

        const scan = await GradingImport.#scanSchemaFiles( { providerPath } )
        if( scan.errors.length > 0 ) { return { ...empty, errors: scan.errors } }
        if( scan.files.length === 0 ) {
            return { ...empty, errors: [ `IMP-001: no .mjs schema files found in ${providerPath}` ] }
        }

        // Gate-load. A real IO/parse failure (scan-level) still aborts, but a gate
        // failure no longer aborts the whole import — the emit-on-failure path
        // below handles the all-unparsable / all-gate-failed case (PRD-001 AC-1).
        const loaded = await GradingImport.#loadSchemas( { files: scan.files, gate } )

        // Single namespace-derivation seam (PRD-002 AC-5). PRD-001 (AC-3) delegates
        // the blocked-emit namespace lookup to exactly this function. Declared
        // namespace wins; disagreement aborts (IMP-005); zero-usable → foldername
        // fallback validated against NAMESPACE_REGEX (IMP-006 on a bad folder name).
        const ns = GradingImport.#deriveNamespace( { schemas: loaded.schemas, providerPath } )
        if( !ns.status ) { return { ...empty, errors: ns.errors.concat( loaded.errors ) } }
        const namespace = ns.namespace

        // Emit-on-failure (PRD-001): every schema failed the gate (or the folder is
        // all-unparsable). Produce a `blocked` node under the derived namespace
        // instead of aborting silently. The original gate detail survives in errors.
        if( loaded.schemas.length === 0 ) {
            const emit = await GradingImport.#emitBlockedNamespace( {
                gradingDataRoot,
                namespace,
                blockedReason: BLOCKED_REASON_VALIDATION_FAILED
            } )
            if( !emit.status ) {
                return { ...empty, namespace, fallbackUsed: ns.fallbackUsed, errors: emit.errors.concat( loaded.errors ) }
            }
            return {
                status: true,
                namespace,
                blocked: true,
                blockedReason: BLOCKED_REASON_VALIDATION_FAILED,
                fallbackUsed: ns.fallbackUsed,
                renamedFrom: null,
                imported: [],
                skipped: [],
                normalizedSkills: [],
                indexPath: emit.indexPath,
                errors: loaded.errors
            }
        }

        // At least one schema parsed and declared a real namespace. Rename-later
        // (PRD-002 AC-4): if a prior import created a foldername-fallback folder
        // under basename(providerPath) and the now-declared namespace differs,
        // rename the island folder exactly once (no clobber). No-op when equal.
        const renamed = await GradingImport.#renameLaterIfNeeded( { gradingDataRoot, providerPath, namespace, fallbackUsed: ns.fallbackUsed } )
        if( !renamed.status ) { return { ...empty, namespace, fallbackUsed: ns.fallbackUsed, errors: renamed.errors } }

        const imported = []
        const skipped = []
        const normalizedSkills = []
        const errors = []

        await loaded.schemas
            .reduce( async ( prev, item ) => {
                await prev
                const one = await GradingImport.#importOne( { item, namespace, gradingDataRoot } )
                one.errors.forEach( ( e ) => errors.push( e ) )
                if( one.skipped === true ) { skipped.push( { schema: one.schemaSlug, name: item.schema.name, hash: one.hash } ) }
                if( one.created === true ) { imported.push( { schema: one.schemaSlug, name: item.schema.name, hash: one.hash, snapshotPath: one.snapshotPath } ) }
                one.normalizedSkills.forEach( ( n ) => normalizedSkills.push( n ) )
            }, Promise.resolve() )

        if( errors.length > 0 ) {
            return { ...empty, namespace, fallbackUsed: ns.fallbackUsed, renamedFrom: renamed.renamedFrom, imported, skipped, normalizedSkills, errors }
        }

        const namespaceDir = join( gradingDataRoot, 'providers', namespace )
        const rebuilt = await RebuildIndex.rebuildNamespaceIndex( { namespaceDir } )
        if( !rebuilt.status ) {
            return { ...empty, namespace, fallbackUsed: ns.fallbackUsed, renamedFrom: renamed.renamedFrom, imported, skipped, normalizedSkills, indexPath: rebuilt.indexPath, errors: rebuilt.errors }
        }

        return { status: true, namespace, blocked: false, blockedReason: null, fallbackUsed: ns.fallbackUsed, renamedFrom: renamed.renamedFrom, imported, skipped, normalizedSkills, indexPath: rebuilt.indexPath, errors: [] }
    }


    // ---- step 5: per-schema import ----------------------------------------

    static async #importOne( { item, namespace, gradingDataRoot } ) {
        const result = { created: false, skipped: false, hash: null, snapshotPath: null, normalizedSkills: [], errors: [], schemaSlug: null }

        // The schema FOLDER + logical name is the schema slug derived from the
        // source filename (e.g. prices.mjs -> 'prices'), per the folder-layout
        // spec (providers/<ns>/<schema>/...). The schema's `name` field is a
        // human-readable label (may contain spaces) and is NEVER a path component.
        const schemaSlug = basename( item.sourcePath, '.mjs' )
        if( typeof schemaSlug !== 'string' || !NAME_REGEX.test( schemaSlug ) ) {
            result.errors.push( `IMP-003: Invalid schema slug: ${schemaSlug} (from filename; expected [A-Za-z][A-Za-z0-9_-]*)` )
            return result
        }
        result.schemaSlug = schemaSlug

        const hashResult = HashGenerator.computeSchemaHash( { schema: item.schema } )
        if( hashResult.errors.length > 0 ) {
            result.errors = hashResult.errors
            return result
        }
        result.hash = hashResult.hash

        // Existence check + NO-OVERWRITE is enforced by SourceSnapshot.create:
        //   identical hash + identical content → created:false (skip)
        //   new hash                            → a NEW timestamped file alongside
        //   same hash, different content        → SNP-004 conflict (never overwrite)
        const snap = await SourceSnapshot.create( {
            sourcePath: item.sourcePath,
            gradingDataRoot,
            namespace,
            schemaName: schemaSlug,
            schemaHash: hashResult.hash
        } )
        if( snap.errors.length > 0 ) {
            result.errors = snap.errors
            return result
        }
        result.snapshotPath = snap.snapshotPath
        result.created = snap.created
        result.skipped = snap.created === false

        const schemaDir = join( gradingDataRoot, 'providers', namespace, schemaSlug )

        // Make the island self-contained for sharedLists schemas. A
        // missing/unresolvable referenced list is surfaced as an error (no silent
        // skip), not swallowed — the schema declares the dependency, so it must
        // exist at the source. Errors propagate via result.errors → run() fails.
        const lists = await GradingImport.#snapshotSharedLists( { schema: item.schema, sourcePath: item.sourcePath, schemaDir } )
        if( lists.errors.length > 0 ) {
            result.errors = result.errors.concat( lists.errors )
        }

        const about = await GradingImport.#convertAboutResource( { schema: item.schema, schemaDir, namespace } )
        if( about.errors.length > 0 ) {
            result.errors = result.errors.concat( about.errors )
            return result
        }

        const normalized = await InlineSkillNormalizer.normalize( {
            schema: item.schema,
            schemaDir,
            sourcePath: item.sourcePath
        } )
        if( normalized.errors.length > 0 ) {
            result.errors = result.errors.concat( normalized.errors )
            return result
        }
        result.normalizedSkills = normalized.normalized

        return result
    }


    /**
     * #snapshotSharedLists — copy the schema's referenced shared-list files into
     * the island so resolution is self-contained. Each ref in
     * `main.sharedLists` maps to `<kebab(ref)>.mjs` inside a `_lists/`/`_shared/`
     * directory found by walking UP from the source schema file. The files are
     * copied verbatim into providers/<ns>/<schema>/_lists/<kebab>.mjs, where the
     * runtime up-walk (CLI + DataPretest) finds them at the schema-folder level.
     * Non-destructive: identical content → skip; changed content → rewrite to
     * track the pinned source (the list filename is exact, so it is NOT
     * content-addressed like the schema snapshot). No silent skip on a missing
     * source dir/file: the schema declares the dependency, so absence is IMP-009.
     *
     * @returns {Promise<{ copied: string[], errors: string[] }>}
     */
    static async #snapshotSharedLists( { schema, sourcePath, schemaDir } ) {
        const refs = schema.sharedLists
        if( !Array.isArray( refs ) || refs.length === 0 ) { return { copied: [], errors: [] } }

        const sourceListsDir = GradingImport.#findListsDir( { startDir: dirname( sourcePath ) } )
        if( sourceListsDir === null ) {
            return { copied: [], errors: [ `IMP-009: schema declares sharedLists but no ${LIST_DIR_NAMES.join( '/' )} directory found above ${sourcePath}` ] }
        }

        const islandListsDir = join( schemaDir, '_lists' )
        await mkdir( islandListsDir, { recursive: true } )

        const copied = []
        const errors = []

        await refs
            .reduce( async ( prev, ref ) => {
                await prev
                const refName = ref === null || typeof ref !== 'object' ? null : ref.ref
                if( typeof refName !== 'string' || refName.length === 0 ) {
                    errors.push( `IMP-009: invalid sharedLists ref (missing string 'ref' field) in ${sourcePath}` )
                    return
                }
                const fileName = `${GradingImport.#toKebabCase( { name: refName } )}.mjs`
                const sourceFile = join( sourceListsDir, fileName )
                const read = await GradingImport.#readFileOrNull( { path: sourceFile } )
                if( read === null ) {
                    errors.push( `IMP-009: referenced shared list '${refName}' -> ${fileName} not found in ${sourceListsDir}` )
                    return
                }
                const targetFile = join( islandListsDir, fileName )
                const existing = await GradingImport.#readFileOrNull( { path: targetFile } )
                if( existing === read ) { return }
                await writeFile( targetFile, read, 'utf-8' )
                copied.push( fileName )
            }, Promise.resolve() )

        return { copied, errors }
    }


    /**
     * #findListsDir — walk UP from startDir up to MAX_LIST_DIR_LEVELS, returning
     * the first `_lists/`/`_shared/` directory found (or null). Mirrors
     * DataPretest.#findListsDir so the IN snapshot lands where the OUT resolution
     * looks.
     */
    static #findListsDir( { startDir } ) {
        const result = Array.from( { length: MAX_LIST_DIR_LEVELS } )
            .reduce( ( acc, _entry ) => {
                if( acc.found === true ) { return acc }
                const hit = LIST_DIR_NAMES
                    .map( ( name ) => join( acc.current, name ) )
                    .find( ( candidate ) => GradingImport.#dirExistsSync( { path: candidate } ) )
                if( hit !== undefined ) { return { found: true, listsDir: hit, current: acc.current } }
                const parent = dirname( acc.current )
                if( parent === acc.current ) { return { found: false, listsDir: null, current: acc.current } }
                return { found: false, listsDir: null, current: parent }
            }, { found: false, listsDir: null, current: startDir } )

        return result.listsDir
    }


    static #toKebabCase( { name } ) {
        return name
            .replace( /([a-z])([A-Z])/g, '$1-$2' )
            .toLowerCase()
    }


    static async #readFileOrNull( { path } ) {
        try {
            return await readFile( path, 'utf-8' )
        } catch( error ) {
            return null
        }
    }


    static #dirExistsSync( { path } ) {
        return existsSync( path )
    }


    /**
     * #convertAboutResource — write the schema's About resource into
     * resources/about/<ns>-about--<ts>--<hash8>.md. No-overwrite by hash.
     * Absence of an About resource is NOT an error (it is graded as `pending`).
     */
    static async #convertAboutResource( { schema, schemaDir, namespace } ) {
        const resources = schema.resources
        if( resources === undefined || resources === null ) { return { written: false, errors: [] } }

        const aboutText = GradingImport.#extractAboutText( { resources } )
        if( aboutText === null ) { return { written: false, errors: [] } }

        const hashResult = HashGenerator.computeHash( { value: { about: aboutText } } )
        if( hashResult.errors.length > 0 ) { return { written: false, errors: hashResult.errors } }
        const hash = hashResult.hash

        const aboutDir = join( schemaDir, 'resources', 'about' )
        await mkdir( aboutDir, { recursive: true } )

        const logicalName = `${namespace}-about`
        const existing = await GradingImport.#findAboutByHash( { aboutDir, logicalName, hash } )
        if( existing !== null ) { return { written: false, errors: [] } }

        const ts = GradingImport.#timestamp()
        const filename = `${logicalName}--${ts}--${hash}.md`
        await writeFile( join( aboutDir, filename ), aboutText, 'utf-8' )
        return { written: true, errors: [] }
    }


    static #extractAboutText( { resources } ) {
        if( Array.isArray( resources ) ) {
            const found = resources
                .find( ( r ) => r !== null && typeof r === 'object' && ( r.kind === 'about' || r.name === 'about' ) )
            if( found === undefined ) { return null }
            const text = found.content === undefined ? found.text : found.content
            return typeof text === 'string' && text.length > 0 ? text : null
        }
        if( typeof resources === 'object' ) {
            const about = resources.about
            if( about === undefined || about === null ) { return null }
            if( typeof about === 'string' ) { return about.length > 0 ? about : null }
            const text = about.content === undefined ? about.text : about.content
            return typeof text === 'string' && text.length > 0 ? text : null
        }
        return null
    }


    static async #findAboutByHash( { aboutDir, logicalName, hash } ) {
        try {
            const entries = await readdir( aboutDir )
            const matched = entries
                .filter( ( name ) => ABOUT_FILENAME_REGEX.test( name ) )
                .find( ( name ) => {
                    const parsed = ABOUT_FILENAME_REGEX.exec( name )
                    return parsed !== null && parsed[ 1 ] === logicalName && parsed[ 3 ] === hash
                } )
            if( matched === undefined ) { return null }
            return { path: join( aboutDir, matched ) }
        } catch( error ) {
            return null
        }
    }


    // ---- step 1-3: scan, load, gate, namespace assertion ------------------

    static async #scanSchemaFiles( { providerPath } ) {
        const exists = await GradingImport.#dirExists( { path: providerPath } )
        if( !exists ) { return { files: [], errors: [ `IMP-001: providerPath not found: ${providerPath}` ] } }

        const entries = await readdir( providerPath, { withFileTypes: true } )
        const files = entries
            .filter( ( e ) => e.isFile() )
            .map( ( e ) => e.name )
            .filter( ( name ) => name.endsWith( '.mjs' ) )
            .filter( ( name ) => basename( name ).startsWith( '_' ) === false )
            .sort()
            .map( ( name ) => join( providerPath, name ) )

        return { files, errors: [] }
    }


    static async #loadSchemas( { files, gate } ) {
        const loaded = []
        const errors = []

        await files
            .reduce( async ( prev, sourcePath ) => {
                await prev
                const imp = await GradingImport.#dynamicImport( { sourcePath } )
                if( imp.errors.length > 0 ) { imp.errors.forEach( ( e ) => errors.push( e ) ); return }

                const schema = imp.module.main !== undefined ? imp.module.main : imp.module.schema
                if( schema === undefined ) {
                    errors.push( `IMP-002: ${sourcePath} exports neither main nor schema` )
                    return
                }

                const gated = gate( { schema, sourcePath } )
                if( !gated.valid ) {
                    gated.errors.forEach( ( e ) => errors.push( e ) )
                    return
                }

                loaded.push( { schema, sourcePath } )
            }, Promise.resolve() )

        return { schemas: loaded, errors }
    }


    /**
     * #deriveNamespace — the SINGLE namespace-derivation seam (PRD-002 AC-5).
     * Declared-namespace first, foldername-fallback when none is usable.
     *
     * Resolution order (no silent default):
     *   - Collect the non-empty string `namespace` fields of parsed schemas.
     *   - ≥2 distinct usable namespaces → IMP-005 abort (disagreement is a
     *     folder misconfiguration, NOT a fallback case — PRD-002 AC-2).
     *   - exactly 1 distinct usable namespace → use it (fallbackUsed:false).
     *     Also assert the folder↔namespace invariant: basename(providerPath) MUST
     *     equal the declared namespace (PRD-002 AC-3, §09), else IMP-007.
     *   - zero usable namespaces (no schema parsed / none declared a namespace) →
     *     derive from basename(providerPath), validate against NAMESPACE_REGEX
     *     (PRD-002 AC-6); a bad folder name is IMP-006 (no silent normalisation).
     *
     * @returns {{ status, namespace, fallbackUsed, errors:string[] }}
     */
    static #deriveNamespace( { schemas, providerPath } ) {
        const folderName = basename( providerPath )

        const declared = schemas
            .map( ( item ) => item.schema.namespace )
            .filter( ( ns ) => typeof ns === 'string' && ns.length > 0 )

        const unique = [ ...new Set( declared ) ]

        if( unique.length > 1 ) {
            return {
                status: false,
                namespace: null,
                fallbackUsed: false,
                errors: [ `IMP-005: single-namespace assertion failed — folder declares ${unique.length} namespaces: ${unique.join( ', ' )} (one folder = one namespace)` ]
            }
        }

        if( unique.length === 1 ) {
            // A real declared namespace wins. The island folder is keyed on THIS
            // namespace (RebuildIndex derives `index.json.namespace` from
            // basename(namespaceDir)), so folder==namespace holds by construction
            // for the island. When the source providerPath base name differs (e.g.
            // a prior foldername-fallback import under a placeholder folder), the
            // island folder is reconciled by #renameLaterIfNeeded — the §09
            // invariant is asserted on the island via assertFolderNamespaceConsistency.
            return { status: true, namespace: unique[ 0 ], fallbackUsed: false, errors: [] }
        }

        // Zero usable namespaces → foldername-fallback (PRD-002 AC-1).
        if( !NAMESPACE_REGEX.test( folderName ) ) {
            return {
                status: false,
                namespace: null,
                fallbackUsed: true,
                errors: [ `IMP-006: foldername-fallback name '${folderName}' is not a valid namespace (expected /^[a-z][a-z0-9-]*$/)` ]
            }
        }

        return { status: true, namespace: folderName, fallbackUsed: true, errors: [] }
    }


    /**
     * #assertFolderNamespaceConsistency — the folder↔namespace invariant check
     * (PRD-002 AC-3, §09). For an imported namespace folder, the folder base name
     * MUST equal the declared namespace. Used as a standalone validation seam so
     * the invariant is testable in isolation (RebuildIndex derives the namespace
     * from basename — this guards the IN side). The fallback case is the explicit
     * exception (folder name IS the namespace by construction).
     *
     * @returns {{ valid:boolean, errors:string[] }}
     */
    static assertFolderNamespaceConsistency( { folderName, declaredNamespace, fallbackUsed } ) {
        if( fallbackUsed === true ) { return { valid: true, errors: [] } }
        if( typeof folderName !== 'string' || typeof declaredNamespace !== 'string' ) {
            return { valid: false, errors: [ 'IMP-007: folder<->namespace invariant: folderName and declaredNamespace must be strings' ] }
        }
        if( folderName !== declaredNamespace ) {
            return {
                valid: false,
                errors: [ `IMP-007: folder<->namespace invariant violation — folder '${folderName}' != declared namespace '${declaredNamespace}'` ]
            }
        }
        return { valid: true, errors: [] }
    }


    /**
     * #emitBlockedNamespace — write the no-grade blocked record (PRD-001) into the
     * namespace's _gradings/ as a `namespace-description--<ts>.json` entry. The
     * record carries top-level `blocked:true` + `blockedReason` so
     * RebuildIndex.#gradingToNode maps it to a `blocked` node and #rollupStatus
     * rolls the (schema-less) namespace up to `blocked`. NO source snapshot is
     * written for a blocked/unparsable schema (AC-8). index.json is the only
     * overwritable artifact.
     */
    static async #emitBlockedNamespace( { gradingDataRoot, namespace, blockedReason } ) {
        const created = Grading.createEntry( {
            schemaId: namespace,
            selectionId: null,
            gradingTier: 'autonomous',
            grader: { kind: 'script', name: 'grading-import', version: '1.0.0' },
            area: 'namespace-description',
            status: 'blocked',
            blockedReason
        } )
        if( created.errors.length > 0 ) { return { status: false, indexPath: null, errors: created.errors } }

        const namespaceDir = join( gradingDataRoot, 'providers', namespace )
        const gradingsDir = join( namespaceDir, '_gradings' )
        await mkdir( gradingsDir, { recursive: true } )

        const ts = GradingImport.#timestamp()
        const filename = `namespace-description--${ts}.json`
        await writeFile( join( gradingsDir, filename ), JSON.stringify( created.entry, null, 4 ), 'utf-8' )

        const rebuilt = await RebuildIndex.rebuildNamespaceIndex( { namespaceDir } )
        if( !rebuilt.status ) { return { status: false, indexPath: rebuilt.indexPath, errors: rebuilt.errors } }

        return { status: true, indexPath: rebuilt.indexPath, errors: [] }
    }


    /**
     * #renameLaterIfNeeded — rename-later (PRD-002 AC-4). When a prior import
     * created an island folder under the foldername-fallback name
     * (basename(providerPath)) and the now-declared namespace differs, rename
     * providers/<fallback> → providers/<declaredNamespace> exactly once. No-op
     * when names already match (idempotent). NEVER clobbers a differing existing
     * target — reports IMP-008 instead. Only runs for a real declared namespace
     * (fallbackUsed===false).
     */
    static async #renameLaterIfNeeded( { gradingDataRoot, providerPath, namespace, fallbackUsed } ) {
        if( fallbackUsed === true ) { return { status: true, renamedFrom: null, errors: [] } }

        const fallbackName = basename( providerPath )
        if( fallbackName === namespace ) { return { status: true, renamedFrom: null, errors: [] } }

        const fallbackDir = join( gradingDataRoot, 'providers', fallbackName )
        const fallbackExists = await GradingImport.#dirExists( { path: fallbackDir } )
        if( !fallbackExists ) { return { status: true, renamedFrom: null, errors: [] } }

        const targetDir = join( gradingDataRoot, 'providers', namespace )
        const targetExists = await GradingImport.#dirExists( { path: targetDir } )
        if( targetExists ) {
            return {
                status: false,
                renamedFrom: null,
                errors: [ `IMP-008: rename-later conflict — target providers/${namespace} already exists; refusing to overwrite providers/${fallbackName}` ]
            }
        }

        await rename( fallbackDir, targetDir )
        return { status: true, renamedFrom: fallbackName, errors: [] }
    }


    /**
     * #structuralValidate — the in-module validate gate (NO .env, NO network).
     * This is the seam where the CLI (P4) injects the live `flowmcp validate`.
     * Here it asserts the schema is structurally a FlowMCP schema: an object
     * with a string namespace, a string name, and a non-empty tools object.
     */
    static #structuralValidate( { schema, sourcePath } ) {
        const errors = []
        if( schema === null || typeof schema !== 'object' || Array.isArray( schema ) ) {
            errors.push( `IMP-002: ${sourcePath} schema is not an object` )
            return { valid: false, errors }
        }
        if( typeof schema.namespace !== 'string' || schema.namespace.length === 0 ) {
            errors.push( `IMP-002: ${sourcePath} schema.namespace missing or not a non-empty string` )
        }
        if( typeof schema.name !== 'string' || schema.name.length === 0 ) {
            errors.push( `IMP-002: ${sourcePath} schema.name missing or not a non-empty string` )
        }
        const tools = schema.tools
        const hasTools = tools !== null && typeof tools === 'object' && Object.keys( tools ).length > 0
        if( !hasTools ) {
            errors.push( `IMP-002: ${sourcePath} schema.tools missing or empty` )
        }
        return { valid: errors.length === 0, errors }
    }


    /**
     * #dynamicImport — import the schema module from a CONTENT-ADDRESSED temp
     * copy. The schema bytes are written to a temp file whose name carries the
     * sha256 of the content, and that file is imported. This makes the import
     * specifier unique per distinct content even when the same source path is
     * imported repeatedly within one process — a query-string cache buster
     * (`?c=hash`) is silently ignored by some ESM module loaders, which would
     * return the previously-cached module and hash edited content against a
     * stale snapshot, breaking the new-snapshot-alongside guarantee. The temp
     * copy is removed after import; the original source is never written to.
     */
    static async #dynamicImport( { sourcePath } ) {
        let tmpFile = null
        try {
            const bytes = await readFile( sourcePath, 'utf-8' )
            const contentKey = createHash( 'sha256' ).update( bytes ).digest( 'hex' ).slice( 0, 32 )
            tmpFile = join( tmpdir(), `flowmcp-grading-import-${contentKey}.mjs` )
            await writeFile( tmpFile, bytes, 'utf-8' )
            const mod = await import( pathToFileURL( tmpFile ).href )
            return { module: mod, errors: [] }
        } catch( error ) {
            return { module: null, errors: [ `IMP-002: dynamic import failed for ${sourcePath}: ${error.message}` ] }
        } finally {
            if( tmpFile !== null ) {
                await rm( tmpFile, { force: true } ).catch( () => {} )
            }
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


    static #timestamp() {
        const iso = new Date().toISOString()
        const noMillis = iso.replace( /\.\d{3}Z$/, 'Z' )
        return noMillis.replace( /:/g, '-' )
    }


    static #validationRun( { providerPath, gradingDataRoot, validateGate } ) {
        const messages = []
        const struct = { status: false, messages }

        const pairs = [
            [ 'providerPath', providerPath ],
            [ 'gradingDataRoot', gradingDataRoot ]
        ]
        pairs
            .forEach( ( [ key, value ] ) => {
                if( value === undefined || value === null ) {
                    messages.push( `IMP-001: Required field missing: ${key}` )
                    return
                }
                if( typeof value !== 'string' ) {
                    messages.push( `IMP-001: Type mismatch for field ${key}: expected string, got ${typeof value}` )
                }
            } )

        if( validateGate !== undefined && typeof validateGate !== 'function' ) {
            messages.push( `IMP-001: Type mismatch for field validateGate: expected function, got ${typeof validateGate}` )
        }

        if( messages.length > 0 ) { return struct }

        struct.status = true
        return struct
    }
}


export { GradingImport }
