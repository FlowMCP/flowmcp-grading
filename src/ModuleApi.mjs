/**
 * ModuleApi — the public state-read + management facade for grading-data/.
 *
 * This class is a thin facade on top of the already-existing classes. It does
 * NOT reimplement folder scanning, snapshotting, lockfile reading, partial-grade
 * sequence checks or version diffing — it calls them. It adds three things a
 * consumer needs but did not have as one entry:
 *
 *   1. readState  — "go to the folder and tell me the grading state + statistics",
 *                   strictly split into Schema-scope and Selection-scope.
 *   2. addSchema / upgradeSchema — defined methods that replace hand-editing the
 *                   folder; both honor the NO-OVERWRITE rule.
 *   3. assertFullScopeRule — enforces the Partial/Full scope rule (Schema-Full =
 *                   6 schema-areas + cross-checks, Selection-Full = 4 selection-areas
 *                   + cross-checks) by calling PartialGrading, never duplicating it.
 *
 * Scope separation is a hard invariant: there is NO method that grades all ten
 * areas in one run. An existing Schema-Full is respected and never re-graded when
 * a Selection is created — the Selection only adds its own four areas on top
 * (plus the optional override layer applied at selection level).
 *
 * The index file (the single point established for per-project state) is the
 * primary read source. When it is absent, readState falls back to a full
 * FolderScanner.scan and signals this explicitly via `source` — never silently.
 *
 * NO SILENT DEFAULTS. Static methods only, object params, object returns.
 * Error prefix: API-*.
 */

import { join } from 'node:path'
import { readdir, readFile } from 'node:fs/promises'

import { FolderScanner } from './FolderScanner.mjs'
import { ProjectIndex } from './ProjectIndex.mjs'
import { PreConditionCheck } from './PreConditionCheck.mjs'
import { SourceSnapshot } from './SourceSnapshot.mjs'
import { HashGenerator } from './HashGenerator.mjs'
import { Grading } from './Grading.mjs'
import { PartialGrading } from './Phases/PartialGrading.mjs'
import { RebuildIndex } from './RebuildIndex.mjs'


// The six provider-scope Areas (single-schema validator, autonomous tier) per
// gradingSpec/1.2.0 §5.1 areas 1-6. Each Area is a self-contained rubric.
const SCHEMA_AREAS = Object.freeze( {
    'single-test': [ 'single-test' ],
    'tools-aggregate-schema': [ 'tools-aggregate-schema' ],
    'tools-aggregate-namespace': [ 'tools-aggregate-namespace' ],
    'namespace-description': [ 'namespace-description' ],
    'namespace-skills': [ 'namespace-skills' ],
    'about-namespace': [ 'about-namespace' ]
} )

// The five selection-scope Areas (selection validator, group-bound tier) per
// gradingSpec/1.2.0 §5.1 areas 7-11. The legacy `lockfile` Area is DROPPED (the
// lockfile lifecycle is gone — pins live in index.json.lockSnapshot). The 11th
// Area `selection-aggregate` is the group-bound path to grade A.
const SELECTION_AREAS = Object.freeze( {
    'about-selection': [ 'about-selection' ],
    'selection-skills-L1': [ 'selection-skills-L1' ],
    'selection-skills-L2': [ 'selection-skills-L2' ],
    'selection-skills-L3': [ 'selection-skills-L3' ],
    'selection-aggregate': [ 'selection-aggregate' ]
} )

const SCHEMA_AREA_KEYS = Object.freeze( Object.keys( SCHEMA_AREAS ) )
const SELECTION_AREA_KEYS = Object.freeze( Object.keys( SELECTION_AREAS ) )

const VALID_SCOPES = Object.freeze( [ 'schema', 'selection' ] )


class ModuleApi {
    static getScopes() {
        return {
            scopes: VALID_SCOPES.slice(),
            schemaAreas: SCHEMA_AREA_KEYS.slice(),
            selectionAreas: SELECTION_AREA_KEYS.slice()
        }
    }


    static async readState( { gradingDataRoot, indexPath } ) {
        const { status, messages } = ModuleApi.#validationReadState( { gradingDataRoot, indexPath } )
        if( !status ) {
            return { schemaScope: null, selectionScope: null, source: null, issues: [], errors: messages }
        }

        const indexProbe = await ModuleApi.#probeIndex( { gradingDataRoot, indexPath } )

        const scan = await FolderScanner.scan( { gradingDataRoot } )
        if( scan.summary === null ) {
            return {
                schemaScope: null,
                selectionScope: null,
                source: indexProbe.found ? 'index' : 'scan',
                issues: scan.issues,
                errors: scan.errors
            }
        }

        const schemaScope = await ModuleApi.#buildSchemaScope( { gradingDataRoot, scan } )
        const selectionScope = await ModuleApi.#buildSelectionScope( { gradingDataRoot, scan } )

        return {
            schemaScope: schemaScope.scope,
            selectionScope: selectionScope.scope,
            source: indexProbe.found ? 'index' : 'scan',
            issues: scan.issues,
            errors: schemaScope.errors.concat( selectionScope.errors )
        }
    }


    static async stats( { gradingDataRoot, scope } ) {
        const { status, messages } = ModuleApi.#validationStats( { gradingDataRoot, scope } )
        if( !status ) {
            return { scope: null, counts: null, gradeDistribution: null, errors: messages }
        }

        const state = await ModuleApi.readState( { gradingDataRoot } )
        if( state.errors.length > 0 && state.schemaScope === null ) {
            return { scope, counts: null, gradeDistribution: null, errors: state.errors }
        }

        const counts = scope === 'schema' ? state.schemaScope : state.selectionScope
        const distribution = await ModuleApi.#gradeDistribution( { gradingDataRoot, scope } )

        return {
            scope,
            counts,
            gradeDistribution: distribution.gradeDistribution,
            errors: distribution.errors
        }
    }


    static async addSchema( { gradingDataRoot, namespace, schemaPath, schemaId, schemaVersion, grader, options } ) {
        const { status, messages } = ModuleApi.#validationAddSchema( {
            gradingDataRoot, namespace, schemaPath, schemaId, schemaVersion, grader
        } )
        if( !status ) {
            return { snapshot: null, namespaceUpdated: false, alreadyPresent: false, errors: messages }
        }

        const loaded = await ModuleApi.#loadSchemaObject( { schemaPath } )
        if( loaded.errors.length > 0 ) {
            return { snapshot: null, namespaceUpdated: false, alreadyPresent: false, errors: loaded.errors }
        }

        const hashResult = HashGenerator.computeSchemaHash( { schema: loaded.schema } )
        if( hashResult.errors.length > 0 ) {
            return { snapshot: null, namespaceUpdated: false, alreadyPresent: false, errors: hashResult.errors }
        }
        const schemaHash = hashResult.hash

        const schemaName = ModuleApi.#deriveSchemaName( { schemaId } )

        const existing = await SourceSnapshot.listForNamespace( { gradingDataRoot, namespace } )
        const present = existing.snapshots.find( ( s ) => s.hash === schemaHash )
        const intentReplace = options !== undefined && options !== null && options.intent === 'replace'

        if( present !== undefined && !intentReplace ) {
            return {
                snapshot: { hash: schemaHash, schemaVersion, path: present.path },
                namespaceUpdated: false,
                alreadyPresent: true,
                errors: []
            }
        }

        const created = await SourceSnapshot.create( {
            sourcePath: schemaPath, gradingDataRoot, namespace, schemaName, schemaHash
        } )
        if( created.errors.length > 0 ) {
            return { snapshot: null, namespaceUpdated: false, alreadyPresent: false, errors: created.errors }
        }

        // Trigger the namespace index rebuild (the only overwritable artifact). The
        // rebuild is best-effort here; its errors are surfaced, never swallowed.
        const rebuild = await ModuleApi.#triggerNamespaceRebuild( { gradingDataRoot, namespace } )

        return {
            snapshot: { hash: schemaHash, schemaVersion, path: created.snapshotPath, schemaId },
            namespaceUpdated: rebuild.status,
            alreadyPresent: false,
            errors: rebuild.errors
        }
    }


    static async #triggerNamespaceRebuild( { gradingDataRoot, namespace } ) {
        const namespaceDir = join( gradingDataRoot, 'providers', namespace )
        const result = await RebuildIndex.rebuildNamespaceIndex( { namespaceDir } )
        return { status: result.status === true, errors: result.errors }
    }


    static #deriveSchemaName( { schemaId } ) {
        // schemaId convention: '<namespace>.<schema>' → '<schema>'. When there is no
        // dot, the whole id is the schema name.
        if( schemaId.includes( '.' ) ) {
            return schemaId.split( '.' )[ 1 ]
        }
        return schemaId
    }


    static async upgradeSchema( { gradingDataRoot, namespace, schemaId, schemaPath, fromVersion, toVersion, grader, options } ) {
        const { status, messages } = ModuleApi.#validationUpgradeSchema( {
            gradingDataRoot, namespace, schemaId, schemaPath, fromVersion, toVersion, grader
        } )
        if( !status ) {
            return { snapshot: null, diff: null, namespaceUpdated: false, errors: messages }
        }

        const versionCheck = ModuleApi.#compareSemver( { fromVersion, toVersion } )
        if( !versionCheck.higher ) {
            return {
                snapshot: null,
                diff: null,
                namespaceUpdated: false,
                errors: [ `API-003: Invalid version upgrade: toVersion ${toVersion} must be strictly higher than fromVersion ${fromVersion}` ]
            }
        }

        // v2: snapshots are timestamp-versioned (no in-source schemaVersion). The
        // "from" snapshot is the newest existing snapshot of THIS schema name —
        // sort().at(-1) is newest because the B2 timestamp sits before the hash.
        const schemaName = ModuleApi.#deriveSchemaName( { schemaId } )
        const existing = await SourceSnapshot.listForNamespace( { gradingDataRoot, namespace } )
        const forSchema = existing.snapshots
            .filter( ( s ) => s.schemaName === schemaName )
            .sort( ( a, b ) => ( a.timestamp < b.timestamp ? -1 : 1 ) )
        const fromSnapshot = forSchema.length > 0 ? forSchema[ forSchema.length - 1 ] : undefined
        if( fromSnapshot === undefined ) {
            return {
                snapshot: null,
                diff: null,
                namespaceUpdated: false,
                errors: [ `API-003: Invalid version upgrade: no existing snapshot for schema ${schemaName} in namespace ${namespace}` ]
            }
        }

        const oldSchema = await ModuleApi.#loadSchemaObject( { schemaPath: fromSnapshot.path } )
        const newSchema = await ModuleApi.#loadSchemaObject( { schemaPath } )
        const loadErrors = oldSchema.errors.concat( newSchema.errors )
        if( loadErrors.length > 0 ) {
            return { snapshot: null, diff: null, namespaceUpdated: false, errors: loadErrors }
        }

        const newHashResult = HashGenerator.computeSchemaHash( { schema: newSchema.schema } )
        if( newHashResult.errors.length > 0 ) {
            return { snapshot: null, diff: null, namespaceUpdated: false, errors: newHashResult.errors }
        }
        const newHash = newHashResult.hash

        if( newHash === fromSnapshot.hash ) {
            return {
                snapshot: null,
                diff: null,
                namespaceUpdated: false,
                errors: [ `API-003: Invalid version upgrade: new content is identical to fromVersion ${fromVersion} (same schemaHash ${newHash})` ]
            }
        }

        // No-overwrite: a new version always becomes a NEW snapshot (new hash),
        // the old snapshot stays untouched. v2 versioning is timestamp-based — the
        // SemVer bump tables (BumpHelper) are dropped (F20); a content change is a
        // new hash and a regrade marker, no bump classification.
        const created = await SourceSnapshot.create( {
            sourcePath: schemaPath, gradingDataRoot, namespace, schemaName, schemaHash: newHash
        } )
        if( created.errors.length > 0 ) {
            return { snapshot: null, diff: null, namespaceUpdated: false, errors: created.errors }
        }

        // Mark regrade need only — never auto-regrade. The old grading entry is not mutated.
        const trigger = options !== undefined && options !== null && typeof options.regradingTrigger === 'string'
            ? options.regradingTrigger
            : 'schema-content-change'

        return {
            snapshot: { hash: newHash, schemaVersion: toVersion, path: created.snapshotPath, schemaId },
            diff: { fromHash: fromSnapshot.hash, toHash: newHash, regradeMarked: true, regradingTrigger: trigger },
            namespaceUpdated: false,
            errors: []
        }
    }


    static assertFullScopeRule( { entry, scope } ) {
        const { status, messages } = ModuleApi.#validationAssertScope( { entry, scope } )
        if( !status ) {
            return { valid: false, expectedAreas: [], presentAreas: [], violations: [], errors: messages }
        }

        const expectedAreas = scope === 'schema' ? SCHEMA_AREA_KEYS.slice() : SELECTION_AREA_KEYS.slice()
        const areaMap = scope === 'schema' ? SCHEMA_AREAS : SELECTION_AREAS
        const foreignMap = scope === 'schema' ? SELECTION_AREAS : SCHEMA_AREAS

        // Reuse PartialGrading.listGradedDimensions — never reimplement.
        const listed = PartialGrading.listGradedDimensions( { entry } )
        if( listed.errors.length > 0 ) {
            return { valid: false, expectedAreas, presentAreas: [], violations: [], errors: listed.errors }
        }

        const gradedDimensions = listed.dimensions

        // Cross-scope guard: any dimension belonging to the OTHER scope is a hard
        // error — there is no "all ten areas in one run".
        const foreignDimensions = ModuleApi.#flattenAreaDimensions( { areaMap: foreignMap } )
        const crossScope = gradedDimensions.filter( ( d ) => foreignDimensions.includes( d ) )
        if( crossScope.length > 0 ) {
            return {
                valid: false,
                expectedAreas,
                presentAreas: [],
                violations: [],
                errors: [ `API-005: Cross-scope grading forbidden: ${scope}-scope entry carries foreign-scope dimensions [${crossScope.join( ', ' )}]` ]
            }
        }

        const presentAreas = expectedAreas
            .filter( ( areaKey ) => {
                const areaDims = areaMap[ areaKey ]
                return areaDims.some( ( dim ) => gradedDimensions.includes( dim ) )
            } )

        const missingAreas = expectedAreas
            .filter( ( areaKey ) => !presentAreas.includes( areaKey ) )

        // Reuse PartialGrading.validateSequence for the ordering invariant
        // (first-must-be-full, partial-must-not-change-aggregate).
        const sequence = PartialGrading.validateSequence( { gradingFiles: [ entry ] } )

        const violations = missingAreas
            .map( ( areaKey ) => ( {
                area: areaKey,
                rule: 'full-scope-requires-all-areas',
                message: `${scope}-Full missing area: ${areaKey}`
            } ) )
            .concat( sequence.violations )

        return {
            valid: violations.length === 0,
            expectedAreas,
            presentAreas,
            violations,
            errors: []
        }
    }


    static async assertSelectionRespectsSchemaFull( { gradingDataRoot, selectionId } ) {
        const { status, messages } = ModuleApi.#validationRespect( { gradingDataRoot, selectionId } )
        if( !status ) {
            return { mayProceed: false, respectsSchemaFull: false, blockedMembers: [], errors: messages }
        }

        // Pre-condition: every member-schema must already carry a stable single-grading.
        // A stable single-grading IS the existing Schema-Full — it is respected and
        // NOT re-graded; the selection only adds its own four areas on top.
        const pre = await PreConditionCheck.check( { gradingDataRoot, selectionId } )
        if( pre.errors.length > 0 && pre.blockedMembers.length === 0 ) {
            return { mayProceed: false, respectsSchemaFull: false, blockedMembers: [], errors: pre.errors }
        }

        return {
            mayProceed: pre.passed,
            respectsSchemaFull: pre.passed,
            blockedMembers: pre.blockedMembers,
            errors: pre.passed ? [] : pre.errors
        }
    }


    static async #buildSchemaScope( { gradingDataRoot, scan } ) {
        // v2: node statuses live in providers/<ns>/<ns>--<tool>--status.json snapshots
        // written by StablePromotion (the phase-status/ tree is dropped).
        const statuses = await ModuleApi.#readNamespaceStatuses( { gradingDataRoot, scan } )

        const stable = statuses.entries.filter( ( s ) => s.gradingStatus === 'stable' ).length
        const pending = statuses.entries.filter( ( s ) => s.gradingStatus === 'pending' ).length
        const schemaGaps = scan.issues
            .filter( ( i ) => i.severity === 'error' )
            .filter( ( i ) => typeof i.code === 'string' && [ 'SCN-005', 'SCN-012' ].includes( i.code ) )
            .length

        const scope = {
            namespaces: scan.summary.namespaces,
            schemas: scan.summary.schemas,
            stable,
            pending,
            gaps: schemaGaps
        }

        return { scope, errors: statuses.errors }
    }


    static async #readNamespaceStatuses( { gradingDataRoot, scan } ) {
        const providersDir = join( gradingDataRoot, 'providers' )
        const namespaces = await ModuleApi.#listDirs( { path: providersDir } )

        const perNamespace = await Promise.all(
            namespaces.map( async ( ns ) => {
                const nsDir = join( providersDir, ns )
                let names = []
                try {
                    names = await readdir( nsDir )
                } catch( error ) {
                    return []
                }
                const statusFiles = names.filter( ( n ) => n.endsWith( '--status.json' ) )
                const entries = await Promise.all(
                    statusFiles.map( async ( name ) => {
                        const parsed = await ModuleApi.#readJson( { path: join( nsDir, name ) } )
                        if( parsed === null ) { return { gradingStatus: null } }
                        return { gradingStatus: parsed.gradingStatus === undefined ? null : parsed.gradingStatus }
                    } )
                )
                return entries
            } )
        )

        const entries = perNamespace.reduce( ( acc, list ) => acc.concat( list ), [] )
        return { entries, errors: [] }
    }


    static async #buildSelectionScope( { gradingDataRoot, scan } ) {
        // v2: selections live under selections/<sel>/index.json. The frozen
        // lockSnapshot inside index.json carries the per-member 5-status; the
        // pre-condition reads that snapshot (no selection.lock.json lifecycle).
        const selectionDir = join( gradingDataRoot, 'selections' )
        const selectionIds = await ModuleApi.#listDirs( { path: selectionDir } )

        const perSelection = await Promise.all(
            selectionIds.map( async ( selectionId ) => {
                const indexPath = join( selectionDir, selectionId, 'index.json' )
                const index = await ModuleApi.#readJson( { path: indexPath } )
                const hasLock = index !== null && index.lockSnapshot !== undefined && index.lockSnapshot !== null
                if( !hasLock ) {
                    return { passed: false, hasLock: false }
                }
                const pre = PreConditionCheck.checkLockfile( { lockfile: index.lockSnapshot } )
                return { passed: pre.passed, hasLock: true }
            } )
        )

        const stable = perSelection.filter( ( s ) => s.passed && s.hasLock ).length
        const blocked = perSelection.filter( ( s ) => s.hasLock && !s.passed ).length
        const pending = perSelection.filter( ( s ) => !s.hasLock ).length
        const selectionGaps = scan.issues
            .filter( ( i ) => i.severity === 'error' )
            .filter( ( i ) => typeof i.code === 'string' && [ 'SCN-008' ].includes( i.code ) )
            .length

        const scope = {
            selectionsTotal: scan.summary.selections,
            stable,
            blocked,
            pending,
            gaps: selectionGaps
        }

        return { scope, errors: [] }
    }


    static async #readJson( { path } ) {
        try {
            const raw = await readFile( path, 'utf-8' )
            try {
                return JSON.parse( raw )
            } catch( parseError ) {
                return null
            }
        } catch( ioError ) {
            return null
        }
    }


    static async #gradeDistribution( { gradingDataRoot, scope } ) {
        const projectsDir = join( gradingDataRoot, 'projects' )
        const projects = await ModuleApi.#listDirs( { path: projectsDir } )

        const sectionKey = scope === 'schema' ? 'singleGradings' : 'selectionGradings'

        const reads = await Promise.all(
            projects.map( async ( projectName ) => {
                const read = await ProjectIndex.read( { gradingDataRoot, projectName } )
                if( read.errors.length > 0 ) { return { grades: [], errors: read.errors } }
                const section = read.index[ sectionKey ]
                const grades = Object.keys( section )
                    .map( ( key ) => section[ key ] )
                    .filter( ( value ) => value !== undefined && value !== null && typeof value === 'object' )
                    .map( ( value ) => value.aggregateGrade )
                    .filter( ( grade ) => typeof grade === 'string' )
                return { grades, errors: [] }
            } )
        )

        const allGrades = reads.reduce( ( acc, r ) => acc.concat( r.grades ), [] )
        const gradeDistribution = allGrades
            .reduce( ( acc, grade ) => {
                acc[ grade ] = acc[ grade ] === undefined ? 1 : acc[ grade ] + 1
                return acc
            }, {} )

        // Index-read errors here are non-fatal for a distribution; surface them
        // explicitly instead of swallowing them.
        const errors = reads.reduce( ( acc, r ) => acc.concat( r.errors ), [] )

        return { gradeDistribution, errors }
    }


    static async #probeIndex( { gradingDataRoot, indexPath } ) {
        if( typeof indexPath === 'string' ) {
            const found = await ModuleApi.#fileReadable( { path: indexPath } )
            return { found }
        }

        const projectsDir = join( gradingDataRoot, 'projects' )
        const projects = await ModuleApi.#listDirs( { path: projectsDir } )
        if( projects.length === 0 ) { return { found: false } }

        const checks = await Promise.all(
            projects.map( ( projectName ) => {
                const located = ProjectIndex.indexPath( { gradingDataRoot, projectName } )
                if( located.path === null ) { return Promise.resolve( false ) }
                return ModuleApi.#fileReadable( { path: located.path } )
            } )
        )

        return { found: checks.some( ( c ) => c === true ) }
    }


    static async #loadSchemaObject( { schemaPath } ) {
        try {
            const { pathToFileURL } = await import( 'node:url' )
            const mod = await import( pathToFileURL( schemaPath ).href )
            const schema = mod.main !== undefined ? mod.main : mod.schema
            if( schema === undefined ) {
                return { schema: null, errors: [ `API-002: Type mismatch for field schemaPath: module exports neither main nor schema (${schemaPath})` ] }
            }
            return { schema, errors: [] }
        } catch( error ) {
            return { schema: null, errors: [ `API-002: Type mismatch for field schemaPath: not importable (${error.message})` ] }
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


    static async #fileReadable( { path } ) {
        try {
            await readFile( path, 'utf-8' )
            return true
        } catch( error ) {
            return false
        }
    }


    static #flattenAreaDimensions( { areaMap } ) {
        return Object.keys( areaMap )
            .reduce( ( acc, key ) => acc.concat( areaMap[ key ] ), [] )
    }


    static #compareSemver( { fromVersion, toVersion } ) {
        const semverRegex = /^\d+\.\d+\.\d+$/
        if( !semverRegex.test( fromVersion ) || !semverRegex.test( toVersion ) ) {
            return { higher: false }
        }
        const fromParts = fromVersion.split( '.' ).map( ( p ) => Number( p ) )
        const toParts = toVersion.split( '.' ).map( ( p ) => Number( p ) )
        const fromValue = ( fromParts[ 0 ] * 1000000 ) + ( fromParts[ 1 ] * 1000 ) + fromParts[ 2 ]
        const toValue = ( toParts[ 0 ] * 1000000 ) + ( toParts[ 1 ] * 1000 ) + toParts[ 2 ]
        return { higher: toValue > fromValue }
    }


    static #validationReadState( { gradingDataRoot, indexPath } ) {
        const messages = []
        const struct = { status: false, messages }

        if( gradingDataRoot === undefined || gradingDataRoot === null ) {
            messages.push( 'API-001: Required field missing: gradingDataRoot' )
            return struct
        }
        if( typeof gradingDataRoot !== 'string' ) {
            messages.push( `API-002: Type mismatch for field gradingDataRoot: expected string, got ${typeof gradingDataRoot}` )
            return struct
        }
        if( indexPath !== undefined && indexPath !== null && typeof indexPath !== 'string' ) {
            messages.push( `API-002: Type mismatch for field indexPath: expected string, got ${typeof indexPath}` )
            return struct
        }

        struct.status = true
        return struct
    }


    static #validationStats( { gradingDataRoot, scope } ) {
        const messages = []
        const struct = { status: false, messages }

        if( gradingDataRoot === undefined || gradingDataRoot === null ) {
            messages.push( 'API-001: Required field missing: gradingDataRoot' )
            return struct
        }
        if( typeof gradingDataRoot !== 'string' ) {
            messages.push( `API-002: Type mismatch for field gradingDataRoot: expected string, got ${typeof gradingDataRoot}` )
            return struct
        }
        if( scope === undefined || scope === null ) {
            messages.push( 'API-001: Required field missing: scope' )
            return struct
        }
        if( !VALID_SCOPES.includes( scope ) ) {
            messages.push( `API-004: Invalid scope: ${scope} (expected \`schema\` or \`selection\`)` )
            return struct
        }

        struct.status = true
        return struct
    }


    static #validationAddSchema( { gradingDataRoot, namespace, schemaPath, schemaId, schemaVersion, grader } ) {
        const messages = []
        const struct = { status: false, messages }

        const pairs = [
            [ 'gradingDataRoot', gradingDataRoot, 'string' ],
            [ 'namespace', namespace, 'string' ],
            [ 'schemaPath', schemaPath, 'string' ],
            [ 'schemaId', schemaId, 'string' ],
            [ 'schemaVersion', schemaVersion, 'string' ],
            [ 'grader', grader, 'object' ]
        ]
        ModuleApi.#checkPairs( { pairs, messages } )
        if( messages.length > 0 ) { return struct }

        struct.status = true
        return struct
    }


    static #validationUpgradeSchema( { gradingDataRoot, namespace, schemaId, schemaPath, fromVersion, toVersion, grader } ) {
        const messages = []
        const struct = { status: false, messages }

        const pairs = [
            [ 'gradingDataRoot', gradingDataRoot, 'string' ],
            [ 'namespace', namespace, 'string' ],
            [ 'schemaId', schemaId, 'string' ],
            [ 'schemaPath', schemaPath, 'string' ],
            [ 'fromVersion', fromVersion, 'string' ],
            [ 'toVersion', toVersion, 'string' ],
            [ 'grader', grader, 'object' ]
        ]
        ModuleApi.#checkPairs( { pairs, messages } )
        if( messages.length > 0 ) { return struct }

        struct.status = true
        return struct
    }


    static #validationAssertScope( { entry, scope } ) {
        const messages = []
        const struct = { status: false, messages }

        if( entry === undefined || entry === null || typeof entry !== 'object' || Array.isArray( entry ) ) {
            messages.push( 'API-001: Required field missing: entry' )
            return struct
        }
        if( scope === undefined || scope === null ) {
            messages.push( 'API-001: Required field missing: scope' )
            return struct
        }
        if( !VALID_SCOPES.includes( scope ) ) {
            messages.push( `API-004: Invalid scope: ${scope} (expected \`schema\` or \`selection\`)` )
            return struct
        }

        struct.status = true
        return struct
    }


    static #validationRespect( { gradingDataRoot, selectionId } ) {
        const messages = []
        const struct = { status: false, messages }

        const pairs = [
            [ 'gradingDataRoot', gradingDataRoot, 'string' ],
            [ 'selectionId', selectionId, 'string' ]
        ]
        ModuleApi.#checkPairs( { pairs, messages } )
        if( messages.length > 0 ) { return struct }

        struct.status = true
        return struct
    }


    static #checkPairs( { pairs, messages } ) {
        pairs
            .forEach( ( [ key, value, type ] ) => {
                if( value === undefined || value === null ) {
                    messages.push( `API-001: Required field missing: ${key}` )
                    return
                }
                if( type === 'string' && typeof value !== 'string' ) {
                    messages.push( `API-002: Type mismatch for field ${key}: expected string, got ${typeof value}` )
                    return
                }
                if( type === 'object' && ( typeof value !== 'object' || Array.isArray( value ) ) ) {
                    messages.push( `API-002: Type mismatch for field ${key}: expected object, got ${Array.isArray( value ) ? 'array' : typeof value}` )
                }
            } )
    }
}


export { ModuleApi, SCHEMA_AREAS, SELECTION_AREAS, VALID_SCOPES }
