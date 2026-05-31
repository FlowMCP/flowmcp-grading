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

import { readdir, writeFile, mkdir, stat, readFile, rm } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'

import { HashGenerator } from './HashGenerator.mjs'
import { SourceSnapshot } from './SourceSnapshot.mjs'
import { InlineSkillNormalizer, INLINE_BODY_KEYS } from './InlineSkillNormalizer.mjs'
import { RebuildIndex } from './RebuildIndex.mjs'


const NAME_REGEX = /^[A-Za-z][A-Za-z0-9_-]*$/
const ABOUT_FILENAME_REGEX = /^(.+)--(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)--([0-9a-f]{8})\.md$/


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
        const empty = { status: false, namespace: null, imported: [], skipped: [], normalizedSkills: [], indexPath: null }
        const { status, messages } = GradingImport.#validationRun( { providerPath, gradingDataRoot, validateGate } )
        if( !status ) { return { ...empty, errors: messages } }

        const gate = validateGate === undefined ? GradingImport.#structuralValidate : validateGate

        const scan = await GradingImport.#scanSchemaFiles( { providerPath } )
        if( scan.errors.length > 0 ) { return { ...empty, errors: scan.errors } }
        if( scan.files.length === 0 ) {
            return { ...empty, errors: [ `IMP-001: no .mjs schema files found in ${providerPath}` ] }
        }

        const loaded = await GradingImport.#loadSchemas( { files: scan.files, gate } )
        if( loaded.errors.length > 0 ) { return { ...empty, errors: loaded.errors } }

        const nsAssert = GradingImport.#assertSingleNamespace( { schemas: loaded.schemas } )
        if( !nsAssert.status ) { return { ...empty, errors: nsAssert.errors } }
        const namespace = nsAssert.namespace

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
            return { status: false, namespace, imported, skipped, normalizedSkills, indexPath: null, errors }
        }

        const namespaceDir = join( gradingDataRoot, 'providers', namespace )
        const rebuilt = await RebuildIndex.rebuildNamespaceIndex( { namespaceDir } )
        if( !rebuilt.status ) {
            return { status: false, namespace, imported, skipped, normalizedSkills, indexPath: rebuilt.indexPath, errors: rebuilt.errors }
        }

        return { status: true, namespace, imported, skipped, normalizedSkills, indexPath: rebuilt.indexPath, errors: [] }
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


    static #assertSingleNamespace( { schemas } ) {
        const namespaces = schemas
            .map( ( item ) => item.schema.namespace )

        const missing = namespaces
            .some( ( ns ) => typeof ns !== 'string' || ns.length === 0 )
        if( missing ) {
            return { status: false, namespace: null, errors: [ 'IMP-004: one or more schemas declare no namespace' ] }
        }

        const unique = [ ...new Set( namespaces ) ]
        if( unique.length > 1 ) {
            return {
                status: false,
                namespace: null,
                errors: [ `IMP-005: single-namespace assertion failed — folder declares ${unique.length} namespaces: ${unique.join( ', ' )} (one folder = one namespace)` ]
            }
        }

        return { status: true, namespace: unique[ 0 ], errors: [] }
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
