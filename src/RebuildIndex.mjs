/**
 * RebuildIndex — the single-point index builders defined by
 * gradingSpec/1.2.0 chapter 23 (index.json rollup) + index.schema.json,
 * with the naming grammar from chapter 15.
 *
 * Two builders walk a namespace- or selection-folder, resolve the newest
 * grading entry per _gradings/ (resolveLatest), build the 5-status rollup tree
 * (tool -> schema -> namespace / member -> selection) and write index.json.
 *
 * index.json is the ONLY overwritable artifact: it is derived and 100%
 * reproducible from the underlying grading entries + snapshots, which are NEVER
 * overwritten. The live rollup is recomputed on every rebuild; the frozen
 * `lockSnapshot` is written ONCE at grading start and PRESERVED byte-for-byte by
 * every subsequent rebuild (the rebuild MUST NOT recompute it).
 *
 * Two status vocabularies (do not mix):
 *   - node status (5-status enum): pending | blocked | graded | stable | rejected
 *   - rollup status (operational vocab): operational | partial | blocked | pending | rejected
 *
 * resolveLatest exploits the B2 naming grammar (`<name>--<date>--<hash>` and
 * `<area>[--persona--lens]--<ts>.json`): because the date/timestamp sits BEFORE
 * the random hash, a naive `sort().at(-1)` always yields the newest file.
 *
 * Module reads NO .env. NO SILENT DEFAULTS. Static methods, object params,
 * object returns.
 */

import { readFile, writeFile, mkdir, readdir, stat, rename } from 'node:fs/promises'
import { join, basename } from 'node:path'

import { SelectionLockfile } from './SelectionLockfile.mjs'
import { Grading } from './Grading.mjs'


const INDEX_VERSION = 2
const INDEX_FILENAME = 'index.json'
const GRADINGS_DIR = '_gradings'

// Area -> grading tier. Provider-side areas are `autonomous` (max grade B);
// selection-side areas are `group-bound` (max grade A). Used to compute a grade
// from an answer-envelope at rollup time (the envelope carries no grade field —
// index.json is the derived, reproducible rollup).
const PROVIDER_AREAS = Object.freeze( [
    'single-test', 'tools-aggregate-schema', 'tools-aggregate-namespace',
    'namespace-description', 'namespace-skills', 'about-namespace'
] )
const SELECTION_AREAS = Object.freeze( [
    'about-selection', 'selection-skills-L1', 'selection-skills-L2',
    'selection-skills-L3', 'selection-aggregate'
] )

const NODE_STATUSES = Object.freeze( [ 'pending', 'blocked', 'graded', 'stable', 'rejected' ] )
const ROLLUP_STATUSES = Object.freeze( [ 'operational', 'partial', 'blocked', 'pending', 'rejected' ] )

// Veto / aggregate-grade REJECTED maps to the terminal node status `rejected`.
const AGGREGATE_TO_NODE_STATUS = Object.freeze( {
    REJECTED: 'rejected'
} )

// B2 primitive grammar: <logicalName>--<YYYY-MM-DDTHH-MM-SSZ>--<hash8>.<ext>
const PRIMITIVE_FILENAME_REGEX = /^(.+)--(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)--([0-9a-f]{8})\.([A-Za-z0-9]+)$/
// Grading grammar: <area>[--<basePersona>--<lens>]--<ts>.json (ts is last segment, no hash)
const GRADING_FILENAME_REGEX = /^(.+)--(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)\.json$/


class RebuildIndex {
    /**
     * resolveLatest — one resolver for primitives AND gradings.
     * Filters dir-entries on the `logicalName` prefix, sorts, takes the last.
     * Date-before-hash (B2) makes the naive sort correct. Empty result yields an
     * explicit { status:false, reason:'no-version' } — no silent default.
     */
    static async resolveLatest( { dir, logicalName } ) {
        const { status, messages } = RebuildIndex.#validationResolveLatest( { dir, logicalName } )
        if( !status ) { return { status: false, reason: 'invalid-input', file: null, errors: messages } }

        const dirExists = await RebuildIndex.#dirExists( { path: dir } )
        if( !dirExists ) { return { status: false, reason: 'no-version', file: null, errors: [] } }

        const entries = await readdir( dir )
        const matched = entries
            .filter( ( name ) => name.startsWith( `${logicalName}--` ) )
            .sort()

        if( matched.length === 0 ) {
            return { status: false, reason: 'no-version', file: null, errors: [] }
        }

        const file = matched.at( -1 )
        return { status: true, reason: null, file, path: join( dir, file ), errors: [] }
    }


    /**
     * rebuildNamespaceIndex — walk providers/<ns>/, resolve newest grade per
     * _gradings/, build the tool->schema->namespace 5-status rollup, preserve any
     * existing lockSnapshot, write index.json (the only overwritable file).
     */
    static async rebuildNamespaceIndex( { namespaceDir } ) {
        const { status, messages } = RebuildIndex.#validationDir( { dir: namespaceDir, key: 'namespaceDir' } )
        if( !status ) { return { status: false, indexPath: null, index: null, errors: messages } }

        const dirExists = await RebuildIndex.#dirExists( { path: namespaceDir } )
        if( !dirExists ) {
            return { status: false, indexPath: null, index: null, errors: [ `IDX-006: namespaceDir not found: ${namespaceDir}` ] }
        }

        const namespace = basename( namespaceDir )
        const indexFilePath = join( namespaceDir, INDEX_FILENAME )

        const blockers = []

        // Re-Grade Hash-Invalidation (PRD-006 Kap. 6.5): read the previous index up
        // front so each schema node can compare the hash a prior grade was bound to
        // (`snapshot.hash` / `toolsAggregate.boundTo`) against the live snapshot
        // hash. On mismatch the schema area falls to `pending` instead of surfacing
        // a stale grade. This is read here ONCE (not per node) — no silent default.
        const priorIndex = await RebuildIndex.#readExistingIndex( { path: indexFilePath } )

        const aboutNode = await RebuildIndex.#resolveAboutNamespace( { namespaceDir, blockers } )
        const namespaceAggregate = await RebuildIndex.#resolveAggregate( {
            gradingsDir: join( namespaceDir, GRADINGS_DIR ),
            logicalName: 'tools-aggregate-namespace',
            nodePath: 'namespaceAggregate',
            blockers
        } )
        const descriptionNode = await RebuildIndex.#resolveNamespaceDescription( { namespaceDir, blockers } )
        const skillsNode = await RebuildIndex.#resolveNamespaceSkills( { namespaceDir, blockers } )

        const schemaNames = await RebuildIndex.#listSchemaDirs( { namespaceDir } )
        const schemas = {}

        await schemaNames
            .reduce( async ( prev, schemaName ) => {
                await prev
                const priorSchemaNode = priorIndex !== null && priorIndex.schemas !== undefined && priorIndex.schemas !== null
                    ? priorIndex.schemas[ schemaName ]
                    : undefined
                const schemaNode = await RebuildIndex.#buildSchemaNode( { namespaceDir, schemaName, blockers, priorSchemaNode } )
                schemas[ schemaName ] = schemaNode
            }, Promise.resolve() )

        const summary = RebuildIndex.#buildNamespaceSummary( { schemas, aboutNode, descriptionNode, skillsNode } )
        const allNodeStatuses = RebuildIndex.#collectNamespaceNodeStatuses( { schemas, aboutNode, descriptionNode, skillsNode, namespaceAggregate } )
        const rollupStatus = RebuildIndex.#rollupStatus( { nodeStatuses: allNodeStatuses } )
        const rollupGrade = RebuildIndex.#rollupGrade( { schemas, descriptionNode, skillsNode, namespaceAggregate } )

        const preservedLock = priorIndex === null ? undefined : priorIndex.lockSnapshot

        const index = {
            indexVersion: INDEX_VERSION,
            namespace,
            updatedAt: RebuildIndex.#nowTimestamp(),
            status: rollupStatus,
            grade: rollupGrade,
            summary,
            about: aboutNode,
            description: descriptionNode,
            skills: skillsNode,
            namespaceAggregate,
            schemas,
            blockers
        }
        if( preservedLock !== undefined ) { index.lockSnapshot = preservedLock }

        const validation = RebuildIndex.validateIndex( { index } )
        if( !validation.valid ) {
            return { status: false, indexPath: indexFilePath, index: null, errors: validation.errors }
        }

        const written = await RebuildIndex.#writeIndexOverwritable( { path: indexFilePath, index } )
        if( written.errors.length > 0 ) {
            return { status: false, indexPath: indexFilePath, index: null, errors: written.errors }
        }

        return { status: true, indexPath: indexFilePath, index, errors: [] }
    }


    /**
     * rebuildSelectionIndex — analog to namespace, plus the member-resolution
     * manifest (SEL003) and the frozen lockSnapshot. On the very first build the
     * lockSnapshot is created (grading start) via buildLockSnapshot; on every
     * later rebuild the existing one is preserved unchanged.
     */
    static async rebuildSelectionIndex( { selectionDir, providersRoot } ) {
        const { status, messages } = RebuildIndex.#validationDir( { dir: selectionDir, key: 'selectionDir' } )
        if( !status ) { return { status: false, indexPath: null, index: null, errors: messages } }

        const dirExists = await RebuildIndex.#dirExists( { path: selectionDir } )
        if( !dirExists ) {
            return { status: false, indexPath: null, index: null, errors: [ `IDX-006: selectionDir not found: ${selectionDir}` ] }
        }

        const selectionId = basename( selectionDir )
        const indexFilePath = join( selectionDir, INDEX_FILENAME )

        const blockers = []

        const selectionDef = await RebuildIndex.#readSelectionDef( { selectionDir } )
        if( selectionDef.errors.length > 0 ) {
            return { status: false, indexPath: indexFilePath, index: null, errors: selectionDef.errors }
        }

        const aboutNode = await RebuildIndex.#resolveAboutSelection( { selectionDir, blockers } )
        const selectionAggregate = await RebuildIndex.#resolveAggregate( {
            gradingsDir: join( selectionDir, GRADINGS_DIR ),
            logicalName: 'selection-aggregate',
            nodePath: 'selectionAggregate',
            blockers
        } )

        const members = await RebuildIndex.#buildMemberManifest( {
            selectionDef: selectionDef.def,
            providersRoot,
            blockers
        } )

        const memberStatuses = Object.values( members )
            .map( ( m ) => m.status )
        const allNodeStatuses = memberStatuses
            .concat( [ aboutNode.status, selectionAggregate.status ] )
        const rollupStatus = RebuildIndex.#rollupStatus( { nodeStatuses: allNodeStatuses } )
        const rollupGrade = RebuildIndex.#rollupGrade( { schemas: {}, namespaceAggregate: selectionAggregate } )

        const summary = {
            members: Object.keys( members ).length,
            membersStable: memberStatuses.filter( ( s ) => s === 'stable' ).length,
            about: aboutNode.status
        }

        // Frozen lockSnapshot: write once at grading start, preserve afterwards.
        const existing = await RebuildIndex.#readExistingIndex( { path: indexFilePath } )
        let lockSnapshot = existing === null ? undefined : existing.lockSnapshot
        if( lockSnapshot === undefined ) {
            const built = RebuildIndex.#buildLockSnapshotFromManifest( {
                selectionDef: selectionDef.def,
                selectionId,
                members
            } )
            if( built.errors.length > 0 ) {
                return { status: false, indexPath: indexFilePath, index: null, errors: built.errors }
            }
            lockSnapshot = built.lockSnapshot
        }

        const index = {
            indexVersion: INDEX_VERSION,
            selectionId,
            updatedAt: RebuildIndex.#nowTimestamp(),
            status: rollupStatus,
            grade: rollupGrade,
            summary,
            about: aboutNode,
            selectionAggregate,
            members,
            lockSnapshot,
            blockers
        }

        const validation = RebuildIndex.validateIndex( { index } )
        if( !validation.valid ) {
            return { status: false, indexPath: indexFilePath, index: null, errors: validation.errors }
        }

        const written = await RebuildIndex.#writeIndexOverwritable( { path: indexFilePath, index } )
        if( written.errors.length > 0 ) {
            return { status: false, indexPath: indexFilePath, index: null, errors: written.errors }
        }

        return { status: true, indexPath: indexFilePath, index, errors: [] }
    }


    /**
     * buildLockSnapshot — salvaged from SelectionLockfile.generate. Reproduces
     * selectionId, selectionVersion, selectionHash, generatedAt and, per member,
     * { schemaId, schemaVersion, schemaHash, gradingStatus(5-status), override }.
     * Pure compute: takes the selection definition + already-resolved member
     * statuses; does NOT touch the filesystem.
     */
    static buildLockSnapshot( { selectionDef, members } ) {
        const { status, messages } = RebuildIndex.#validationLockSnapshot( { selectionDef, members } )
        if( !status ) { return { lockSnapshot: null, errors: messages } }

        const overrideErrors = members
            .flatMap( ( m ) => {
                if( m.override === undefined || m.override === null ) { return [] }
                const check = SelectionLockfile.validateOverride( { override: m.override } )
                return check.valid
                    ? []
                    : check.errors.map( ( e ) => `${e} (member ${m.schemaId})` )
            } )
        if( overrideErrors.length > 0 ) {
            return { lockSnapshot: null, errors: overrideErrors }
        }

        const memberEntries = members
            .map( ( m ) => {
                const gradingStatus = RebuildIndex.#requireNodeStatus( { value: m.gradingStatus, context: `member ${m.schemaId}` } )
                return {
                    schemaId: m.schemaId,
                    schemaVersion: m.schemaVersion === undefined ? null : m.schemaVersion,
                    schemaHash: m.schemaHash === undefined ? null : m.schemaHash,
                    gradingStatus: gradingStatus.value,
                    override: m.override === undefined ? null : m.override
                }
            } )

        const statusErrors = memberEntries
            .filter( ( m ) => m.gradingStatus === null )
            .map( ( m ) => `LCK-005: Invalid gradingStatus for member ${m.schemaId}` )
        if( statusErrors.length > 0 ) {
            return { lockSnapshot: null, errors: statusErrors }
        }

        const lockSnapshot = {
            selectionId: selectionDef.selectionId,
            selectionVersion: selectionDef.selectionVersion === undefined ? null : selectionDef.selectionVersion,
            selectionHash: selectionDef.selectionHash === undefined ? null : selectionDef.selectionHash,
            generatedAt: RebuildIndex.#nowTimestamp(),
            members: memberEntries
        }

        return { lockSnapshot, errors: [] }
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
        if( typeof index.namespace !== 'string' && typeof index.selectionId !== 'string' ) {
            errors.push( 'IDX-001: Required field missing: index.namespace or index.selectionId' )
        }
        if( !ROLLUP_STATUSES.includes( index.status ) ) {
            errors.push( `IDX-007: Invalid rollup status: ${index.status} (expected one of [${ROLLUP_STATUSES.join( ', ' )}])` )
        }
        if( typeof index.updatedAt !== 'string' ) {
            errors.push( 'IDX-001: Required field missing: index.updatedAt' )
        }

        // Namespace indices must carry the full 6-area rollup: a `description`
        // single-node and a `skills` subtree ({ '<schema>.<skill>': node }).
        // An empty skills subtree {} is valid (no skills graded).
        if( typeof index.namespace === 'string' ) {
            if( index.description === undefined || typeof index.description !== 'object' || Array.isArray( index.description ) ) {
                errors.push( 'IDX-001: Required field missing: index.description' )
            } else if( !NODE_STATUSES.includes( index.description.status ) ) {
                errors.push( `IDX-007: Invalid node status for index.description: ${index.description.status}` )
            }
            if( index.skills === undefined || typeof index.skills !== 'object' || Array.isArray( index.skills ) ) {
                errors.push( 'IDX-001: Required field missing: index.skills' )
            } else {
                Object.entries( index.skills )
                    .filter( ( [ , node ] ) => !NODE_STATUSES.includes( node.status ) )
                    .forEach( ( [ key, node ] ) => {
                        errors.push( `IDX-007: Invalid node status for index.skills.${key}: ${node.status}` )
                    } )
            }
        }

        return { valid: errors.length === 0, errors }
    }


    static mapAggregateGradeToStatus( { aggregateGrade } ) {
        if( aggregateGrade === undefined || aggregateGrade === null ) {
            return { status: null, errors: [ 'IDX-001: Required field missing: aggregateGrade' ] }
        }
        const mapped = AGGREGATE_TO_NODE_STATUS[ aggregateGrade ]
        if( mapped !== undefined ) { return { status: mapped, errors: [] } }
        // Any non-REJECTED graded aggregate is a `graded` node by default of the
        // grade-derivation; promotion to `stable` is decided by StablePromotion,
        // not here. Unknown values error (no silent default).
        const KNOWN_GRADES = [ 'A', 'B', 'C', 'D', 'F' ]
        if( KNOWN_GRADES.includes( aggregateGrade ) ) { return { status: 'graded', errors: [] } }
        return { status: null, errors: [ `IDX-007: Unknown aggregateGrade: ${aggregateGrade}` ] }
    }


    // ---- internal: schema/about/aggregate node builders -------------------

    static async #buildSchemaNode( { namespaceDir, schemaName, blockers, priorSchemaNode } ) {
        const schemaDir = join( namespaceDir, schemaName )

        const snapshot = await RebuildIndex.#resolveSnapshot( { schemaDir, schemaName } )

        // Re-Grade Hash-Invalidation (PRD-006 Kap. 6.5): if a prior index bound a
        // grade to an OLD snapshot hash and the live snapshot now carries a
        // DIFFERENT hash (a doctor fix changed the schema), the bound grade is
        // stale. The affected area falls to `pending` (`schema changed, regrade
        // required`) instead of surfacing the stale grade. This is a regrade signal
        // (not a `blocked` blocker). Determined explicitly — no silent default.
        const hashInvalidated = RebuildIndex.#detectHashInvalidation( { priorSchemaNode, snapshot } )

        const toolsAggregate = hashInvalidated.invalidated === true
            ? { status: 'pending', reason: hashInvalidated.reason }
            : await RebuildIndex.#resolveAggregate( {
                gradingsDir: join( schemaDir, GRADINGS_DIR ),
                logicalName: 'tools-aggregate-schema',
                nodePath: `schemas.${schemaName}.toolsAggregate`,
                blockers
            } )
        const tools = hashInvalidated.invalidated === true
            ? RebuildIndex.#pendingToolNodesFromPrior( { priorSchemaNode, reason: hashInvalidated.reason } )
            : await RebuildIndex.#buildToolNodes( { schemaDir, schemaName, blockers } )

        const toolStatuses = Object.values( tools )
            .map( ( t ) => t.status )
        const nodeStatus = RebuildIndex.#schemaNodeStatus( {
            toolStatuses,
            aggregateStatus: toolsAggregate.status
        } )

        const node = {
            status: nodeStatus.status,
            tools,
            toolsAggregate
        }
        if( nodeStatus.reason !== null ) {
            node.reason = nodeStatus.reason
            // A regrade-required pending state is a signal, not a hard blocker.
            if( hashInvalidated.invalidated !== true ) {
                blockers.push( { node: `schemas.${schemaName}`, reason: nodeStatus.reason } )
            }
        }
        if( hashInvalidated.invalidated === true ) {
            node.reason = hashInvalidated.reason
        }
        if( toolsAggregate.grade !== undefined ) { node.grade = toolsAggregate.grade }
        if( snapshot !== null ) {
            node.snapshot = snapshot
            if( toolsAggregate.status !== 'pending' ) { node.toolsAggregate.boundTo = snapshot.hash }
        }

        return node
    }


    // #detectHashInvalidation — compare the hash a prior grade was bound to against
    // the live snapshot hash. The prior binding lives on the prior index node as
    // `toolsAggregate.boundTo` (set on the last non-pending rebuild) or, failing
    // that, the prior `snapshot.hash`. A mismatch with the live snapshot means the
    // schema changed and any bound grade is stale. NO silent default — when there
    // is no prior binding or no live snapshot, nothing is invalidated.
    static #detectHashInvalidation( { priorSchemaNode, snapshot } ) {
        if( snapshot === null || typeof snapshot.hash !== 'string' ) {
            return { invalidated: false, reason: null }
        }
        if( priorSchemaNode === undefined || priorSchemaNode === null || typeof priorSchemaNode !== 'object' ) {
            return { invalidated: false, reason: null }
        }

        const priorBound = priorSchemaNode.toolsAggregate !== undefined
            && priorSchemaNode.toolsAggregate !== null
            && typeof priorSchemaNode.toolsAggregate.boundTo === 'string'
            ? priorSchemaNode.toolsAggregate.boundTo
            : ( priorSchemaNode.snapshot !== undefined && priorSchemaNode.snapshot !== null && typeof priorSchemaNode.snapshot.hash === 'string'
                ? priorSchemaNode.snapshot.hash
                : null )

        if( priorBound === null ) {
            return { invalidated: false, reason: null }
        }
        if( priorBound === snapshot.hash ) {
            return { invalidated: false, reason: null }
        }

        return { invalidated: true, reason: 'schema changed, regrade required' }
    }


    // Project the prior tool subtree to `pending` on a hash invalidation so the
    // rollup reflects the regrade-required state without surfacing stale tool
    // grades. An absent prior subtree yields {} (nothing to invalidate).
    static #pendingToolNodesFromPrior( { priorSchemaNode, reason } ) {
        const priorTools = priorSchemaNode !== undefined && priorSchemaNode !== null
            && priorSchemaNode.tools !== undefined && priorSchemaNode.tools !== null
            && typeof priorSchemaNode.tools === 'object'
            ? priorSchemaNode.tools
            : {}

        return Object.keys( priorTools )
            .reduce( ( acc, toolName ) => {
                acc[ toolName ] = { status: 'pending', reason }
                return acc
            }, {} )
    }


    static async #buildToolNodes( { schemaDir, schemaName, blockers } ) {
        const toolsDir = join( schemaDir, 'tools' )
        const toolsDirExists = await RebuildIndex.#dirExists( { path: toolsDir } )
        if( !toolsDirExists ) { return {} }

        // testDepth (Memo 101 Kap. 5, F4): the per-tool Test-Leiter rung is a
        // DETERMINISTIC dimension distinct from the LLM outputSchemaMatch (Q-02).
        // It is read from the DataPretest summary.json the same gradingDataRoot
        // already carries — no new artifact, no grade coupling.
        const testDepthByTool = await RebuildIndex.#readTestDepthMap( { schemaDir } )

        const toolNames = await RebuildIndex.#listSubDirs( { dir: toolsDir } )
        const tools = {}

        await toolNames
            .reduce( async ( prev, toolName ) => {
                await prev
                const node = await RebuildIndex.#resolveSingleTest( {
                    toolDir: join( toolsDir, toolName ),
                    nodePath: `schemas.${schemaName}.tools.${toolName}`,
                    blockers
                } )
                const testDepth = testDepthByTool[ toolName ]
                tools[ toolName ] = testDepth === undefined ? node : { ...node, testDepth }
            }, Promise.resolve() )

        return tools
    }


    // #readTestDepthMap — read providers/<ns>/<schema>/summary.json (written by
    // DataPretest) and project its perTool[].level into a { toolName: level } map.
    // Absent/unparseable summary → empty map (the deterministic pretest simply has
    // not run yet; testDepth is then omitted, never guessed).
    static async #readTestDepthMap( { schemaDir } ) {
        const summaryPath = join( schemaDir, 'summary.json' )
        try {
            const raw = await readFile( summaryPath, 'utf-8' )
            const parsed = JSON.parse( raw )
            const perTool = parsed !== null && typeof parsed === 'object' ? parsed.perTool : null
            if( perTool === null || typeof perTool !== 'object' ) { return {} }
            return Object.keys( perTool )
                .reduce( ( acc, toolName ) => {
                    const level = perTool[ toolName ] === null || typeof perTool[ toolName ] !== 'object'
                        ? undefined
                        : perTool[ toolName ].level
                    if( typeof level === 'string' && level.length > 0 ) { acc[ toolName ] = level }
                    return acc
                }, {} )
        } catch( error ) {
            return {}
        }
    }


    static async #resolveSingleTest( { toolDir, nodePath, blockers } ) {
        const gradingsDir = join( toolDir, GRADINGS_DIR )
        const resolved = await RebuildIndex.resolveLatest( { dir: gradingsDir, logicalName: 'single-test' } )
        if( !resolved.status ) {
            return { status: 'pending', reason: 'no grading yet' }
        }

        const parsed = await RebuildIndex.#readGradingFile( { path: resolved.path } )
        return RebuildIndex.#gradingToNode( {
            parsed,
            ref: RebuildIndex.#relativeGradingRef( { gradingsDir, file: resolved.file, levels: 4 } ),
            nodePath,
            blockers
        } )
    }


    static async #resolveAggregate( { gradingsDir, logicalName, nodePath, blockers } ) {
        const resolved = await RebuildIndex.resolveLatest( { dir: gradingsDir, logicalName } )
        if( !resolved.status ) {
            return { status: 'pending', reason: 'no grading yet' }
        }
        const parsed = await RebuildIndex.#readGradingFile( { path: resolved.path } )
        return RebuildIndex.#gradingToNode( {
            parsed,
            ref: RebuildIndex.#relativeGradingRef( { gradingsDir, file: resolved.file, levels: 2 } ),
            nodePath,
            blockers
        } )
    }


    static async #resolveAboutNamespace( { namespaceDir, blockers } ) {
        // About lives in one schema: providers/<ns>/<schema>/resources/about/_gradings/
        const schemaNames = await RebuildIndex.#listSchemaDirs( { namespaceDir } )

        const found = await schemaNames
            .reduce( async ( prevPromise, schemaName ) => {
                const prev = await prevPromise
                if( prev !== null ) { return prev }
                const gradingsDir = join( namespaceDir, schemaName, 'resources', 'about', GRADINGS_DIR )
                const resolved = await RebuildIndex.resolveLatest( { dir: gradingsDir, logicalName: 'about-namespace' } )
                if( !resolved.status ) { return null }
                const parsed = await RebuildIndex.#readGradingFile( { path: resolved.path } )
                return RebuildIndex.#gradingToNode( {
                    parsed,
                    ref: `${schemaName}/resources/about/${GRADINGS_DIR}/${resolved.file}`,
                    nodePath: 'about',
                    blockers
                } )
            }, Promise.resolve( null ) )

        if( found === null ) { return { status: 'pending', reason: 'no about graded' } }
        return found
    }


    /**
     * #resolveNamespaceDescription — reads the namespace-description grading from
     * providers/<ns>/_gradings/ (the SAME dir as tools-aggregate-namespace).
     * resolveLatest filters on the `namespace-description--` prefix, so the two
     * coexist conflict-free. Returns a single node (no subtree).
     */
    static async #resolveNamespaceDescription( { namespaceDir, blockers } ) {
        const gradingsDir = join( namespaceDir, GRADINGS_DIR )
        const resolved = await RebuildIndex.resolveLatest( { dir: gradingsDir, logicalName: 'namespace-description' } )
        if( !resolved.status ) { return { status: 'pending', reason: 'no description graded' } }
        const parsed = await RebuildIndex.#readGradingFile( { path: resolved.path } )
        return RebuildIndex.#gradingToNode( {
            parsed,
            ref: RebuildIndex.#relativeGradingRef( { gradingsDir, file: resolved.file, levels: 2 } ),
            nodePath: 'description',
            blockers
        } )
    }


    /**
     * #resolveNamespaceSkills — namespace-skills is schemaId- AND skill-scoped:
     * providers/<ns>/<schemaId>/skills/<skill>/_gradings/ (AreaScorer). There can
     * be many skill gradings per namespace (one per <schemaId>/<skill>), so this
     * builds a SUBTREE keyed by `<schemaId>.<skill>` -> node. An empty subtree {}
     * is valid (no skills graded). No silent default.
     */
    static async #resolveNamespaceSkills( { namespaceDir, blockers } ) {
        const schemaNames = await RebuildIndex.#listSchemaDirs( { namespaceDir } )
        const skills = {}

        await schemaNames
            .reduce( async ( prevSchema, schemaName ) => {
                await prevSchema
                const skillsRoot = join( namespaceDir, schemaName, 'skills' )
                const skillNames = await RebuildIndex.#listSubDirs( { dir: skillsRoot } )
                await skillNames
                    .reduce( async ( prevSkill, skillName ) => {
                        await prevSkill
                        const gradingsDir = join( skillsRoot, skillName, GRADINGS_DIR )
                        const key = `${schemaName}.${skillName}`
                        const resolved = await RebuildIndex.resolveLatest( { dir: gradingsDir, logicalName: 'namespace-skills' } )
                        if( !resolved.status ) {
                            skills[ key ] = { status: 'pending', reason: 'no skills graded' }
                            return
                        }
                        const parsed = await RebuildIndex.#readGradingFile( { path: resolved.path } )
                        skills[ key ] = RebuildIndex.#gradingToNode( {
                            parsed,
                            ref: `${schemaName}/skills/${skillName}/${GRADINGS_DIR}/${resolved.file}`,
                            nodePath: `skills.${key}`,
                            blockers
                        } )
                    }, Promise.resolve() )
            }, Promise.resolve() )

        return skills
    }


    static async #resolveAboutSelection( { selectionDir, blockers } ) {
        const gradingsDir = join( selectionDir, 'resources', 'about', GRADINGS_DIR )
        const resolved = await RebuildIndex.resolveLatest( { dir: gradingsDir, logicalName: 'about-selection' } )
        if( !resolved.status ) { return { status: 'pending', reason: 'no about graded' } }
        const parsed = await RebuildIndex.#readGradingFile( { path: resolved.path } )
        return RebuildIndex.#gradingToNode( {
            parsed,
            ref: `resources/about/${GRADINGS_DIR}/${resolved.file}`,
            nodePath: 'about',
            blockers
        } )
    }


    static async #resolveSnapshot( { schemaDir, schemaName } ) {
        const snapshotDir = join( schemaDir, 'schema' )
        const resolved = await RebuildIndex.resolveLatest( { dir: snapshotDir, logicalName: schemaName } )
        if( !resolved.status ) { return null }
        const parsed = PRIMITIVE_FILENAME_REGEX.exec( resolved.file )
        if( parsed === null ) { return null }
        return { file: resolved.file, hash: parsed[ 3 ] }
    }


    // ---- internal: status derivation (no silent defaults) -----------------

    /**
     * #gradingToNode — turn a parsed grading entry into a node.
     * 5-status map: aggregateGrade REJECTED -> rejected; status==='stable' ->
     * stable; otherwise a present grade -> graded; explicit blocker -> blocked.
     */
    static #gradingToNode( { parsed, ref, nodePath, blockers } ) {
        if( parsed.errors.length > 0 ) {
            blockers.push( { node: nodePath, reason: parsed.errors[ 0 ] } )
            return { status: 'blocked', reason: parsed.errors[ 0 ] }
        }
        const entry = parsed.json

        if( entry.blocked === true ) {
            const reason = typeof entry.blockedReason === 'string' ? entry.blockedReason : 'blocked'
            blockers.push( { node: nodePath, reason } )
            return { status: 'blocked', reason, ref }
        }

        if( entry.aggregateGrade === 'REJECTED' ) {
            return { status: 'rejected', grade: 'REJECTED', ref }
        }

        if( entry.status === 'stable' ) {
            const node = { status: 'stable', ref }
            if( entry.grade !== undefined ) { node.grade = entry.grade }
            // F11 (normalizedScore projection): carry the numeric normalizedScore into the node when
            // the grading entry persisted one (AreaScorer writes it alongside grade).
            if( typeof entry.normalizedScore === 'number' ) { node.normalizedScore = entry.normalizedScore }
            return node
        }

        const gradeValue = entry.grade !== undefined ? entry.grade : entry.aggregateGrade
        if( gradeValue !== undefined ) {
            const mapped = RebuildIndex.mapAggregateGradeToStatus( { aggregateGrade: gradeValue } )
            if( mapped.errors.length > 0 ) {
                blockers.push( { node: nodePath, reason: mapped.errors[ 0 ] } )
                return { status: 'blocked', reason: mapped.errors[ 0 ], ref }
            }
            const node = { status: mapped.status, grade: gradeValue, ref }
            if( typeof entry.normalizedScore === 'number' ) { node.normalizedScore = entry.normalizedScore }
            return node
        }

        // Derived path: the entry is an answer-envelope (answers[], no explicit
        // grade). Compute the aggregate grade from the answers via Scoring/Grading.
        if( Array.isArray( entry.answers ) && entry.answers.length > 0 ) {
            const gradingTier = RebuildIndex.#areaTier( { area: entry.area } )
            if( gradingTier === null ) {
                const reason = `IDX-009: cannot derive grading tier for area: ${entry.area}`
                blockers.push( { node: nodePath, reason } )
                return { status: 'blocked', reason, ref }
            }
            const computed = Grading.computeAggregateGrade( {
                entry: { gradings: entry.answers, gradingTier, categoricalVeto: null }
            } )
            if( computed.errors.length > 0 ) {
                blockers.push( { node: nodePath, reason: computed.errors[ 0 ] } )
                return { status: 'blocked', reason: computed.errors[ 0 ], ref }
            }
            if( computed.aggregateGrade === null ) {
                return { status: 'pending', reason: 'no scorable answers', ref }
            }
            const mapped = RebuildIndex.mapAggregateGradeToStatus( { aggregateGrade: computed.aggregateGrade } )
            if( mapped.errors.length > 0 ) {
                blockers.push( { node: nodePath, reason: mapped.errors[ 0 ] } )
                return { status: 'blocked', reason: mapped.errors[ 0 ], ref }
            }
            const node = { status: mapped.status, grade: computed.aggregateGrade, ref }
            if( typeof computed.normalizedScore === 'number' ) { node.normalizedScore = computed.normalizedScore }
            return node
        }

        return { status: 'pending', reason: 'no grade in entry', ref }
    }


    // area -> grading tier ('autonomous' | 'group-bound'), or null when unknown.
    static #areaTier( { area } ) {
        if( PROVIDER_AREAS.includes( area ) ) { return 'autonomous' }
        if( SELECTION_AREAS.includes( area ) ) { return 'group-bound' }
        return null
    }


    static #schemaNodeStatus( { toolStatuses, aggregateStatus } ) {
        if( toolStatuses.includes( 'rejected' ) || aggregateStatus === 'rejected' ) {
            return { status: 'rejected', reason: null }
        }
        if( toolStatuses.includes( 'blocked' ) ) {
            return { status: 'blocked', reason: 'one or more tools blocked' }
        }
        if( toolStatuses.length === 0 && aggregateStatus === 'pending' ) {
            return { status: 'pending', reason: 'not yet imported' }
        }
        const graded = toolStatuses.filter( ( s ) => s === 'graded' || s === 'stable' )
        const allStable = toolStatuses.length > 0
            && toolStatuses.every( ( s ) => s === 'stable' )
            && aggregateStatus === 'stable'
        if( allStable ) { return { status: 'stable', reason: null } }
        if( graded.length > 0 || aggregateStatus === 'graded' || aggregateStatus === 'stable' ) {
            return { status: 'graded', reason: null }
        }
        return { status: 'pending', reason: 'not yet graded' }
    }


    /**
     * #rollupStatus — node statuses -> rollup vocabulary (operational vocab).
     * Rule (no `||`): any rejected -> rejected; nothing graded/stable -> if any
     * blocked then blocked else pending; all stable -> operational; mixed -> partial.
     */
    static #rollupStatus( { nodeStatuses } ) {
        const statuses = nodeStatuses
            .filter( ( s ) => s !== undefined && s !== null )

        if( statuses.includes( 'rejected' ) ) { return 'rejected' }

        const usable = statuses.filter( ( s ) => s === 'graded' || s === 'stable' )
        if( usable.length === 0 ) {
            if( statuses.includes( 'blocked' ) ) { return 'blocked' }
            return 'pending'
        }

        const allStable = statuses.length > 0 && statuses.every( ( s ) => s === 'stable' )
        if( allStable ) { return 'operational' }

        return 'partial'
    }


    static #rollupGrade( { schemas, descriptionNode, skillsNode, namespaceAggregate } ) {
        const grades = Object.values( schemas )
            .map( ( s ) => s.grade )
            .filter( ( g ) => g !== undefined && g !== null )
        if( namespaceAggregate !== undefined && namespaceAggregate.grade !== undefined ) {
            grades.push( namespaceAggregate.grade )
        }
        if( descriptionNode !== undefined && descriptionNode.grade !== undefined ) {
            grades.push( descriptionNode.grade )
        }
        if( skillsNode !== undefined ) {
            Object.values( skillsNode )
                .map( ( n ) => n.grade )
                .filter( ( g ) => g !== undefined && g !== null )
                .forEach( ( g ) => grades.push( g ) )
        }
        if( grades.includes( 'REJECTED' ) ) { return 'REJECTED' }
        const ORDER = [ 'A', 'B', 'C', 'D', 'F' ]
        const present = ORDER.filter( ( g ) => grades.includes( g ) )
        if( present.length === 0 ) { return 'F' }
        // worst-case (lowest) grade as the conservative rollup grade
        return present.at( -1 )
    }


    static #buildNamespaceSummary( { schemas, aboutNode, descriptionNode, skillsNode } ) {
        const schemaNames = Object.keys( schemas )
        const toolCounts = schemaNames
            .map( ( name ) => Object.keys( schemas[ name ].tools === undefined ? {} : schemas[ name ].tools ) )
        const tools = toolCounts
            .reduce( ( acc, list ) => acc + list.length, 0 )
        const toolsStable = schemaNames
            .flatMap( ( name ) => {
                const t = schemas[ name ].tools === undefined ? {} : schemas[ name ].tools
                return Object.values( t )
            } )
            .filter( ( t ) => t.status === 'stable' )
            .length

        // namespace-skills is schemaId+skill scoped -> real count of graded
        // skill entries (graded/stable), not a hardcoded 0.
        const skillsGraded = Object.values( skillsNode )
            .filter( ( n ) => n.status === 'graded' || n.status === 'stable' )
            .length

        return {
            schemas: schemaNames.length,
            tools,
            toolsStable,
            about: aboutNode.status,
            description: descriptionNode.status,
            skills: skillsGraded
        }
    }


    static #collectNamespaceNodeStatuses( { schemas, aboutNode, descriptionNode, skillsNode, namespaceAggregate } ) {
        const schemaStatuses = Object.values( schemas )
            .map( ( s ) => s.status )
        const toolStatuses = Object.values( schemas )
            .flatMap( ( s ) => Object.values( s.tools === undefined ? {} : s.tools ) )
            .map( ( t ) => t.status )
        const skillStatuses = Object.values( skillsNode )
            .map( ( n ) => n.status )
        return schemaStatuses
            .concat( toolStatuses )
            .concat( skillStatuses )
            .concat( [ aboutNode.status, descriptionNode.status, namespaceAggregate.status ] )
    }


    // ---- internal: member manifest (SEL003) -------------------------------

    static async #buildMemberManifest( { selectionDef, providersRoot, blockers } ) {
        const memberDefs = Array.isArray( selectionDef.members ) ? selectionDef.members : []
        const members = {}

        await memberDefs
            .reduce( async ( prev, memberDef ) => {
                await prev
                const schemaId = memberDef.schemaId
                const resolved = await RebuildIndex.#resolveMember( { schemaId, providersRoot, blockers } )
                members[ schemaId ] = resolved
            }, Promise.resolve() )

        return members
    }


    static async #resolveMember( { schemaId, providersRoot, blockers } ) {
        const parts = schemaId.split( '.' )
        if( parts.length !== 2 ) {
            blockers.push( { node: `members.${schemaId}`, reason: `malformed schemaId: ${schemaId}` } )
            return { status: 'blocked', reason: `malformed schemaId: ${schemaId}` }
        }
        const [ namespace, schemaName ] = parts

        if( typeof providersRoot !== 'string' ) {
            blockers.push( { node: `members.${schemaId}`, reason: 'providersRoot not provided' } )
            return { status: 'blocked', reason: 'providersRoot not provided' }
        }

        const schemaDir = join( providersRoot, namespace, schemaName )
        const schemaDirExists = await RebuildIndex.#dirExists( { path: schemaDir } )
        if( !schemaDirExists ) {
            blockers.push( { node: `members.${schemaId}`, reason: 'selection member, not imported' } )
            return { status: 'pending', reason: 'selection member, not imported' }
        }

        const snapshot = await RebuildIndex.#resolveSnapshot( { schemaDir, schemaName } )
        const toolsAggregate = await RebuildIndex.#resolveAggregate( {
            gradingsDir: join( schemaDir, GRADINGS_DIR ),
            logicalName: 'tools-aggregate-schema',
            nodePath: `members.${schemaId}`,
            blockers
        } )

        const node = {
            status: toolsAggregate.status,
            resolvedArtifact: snapshot === null ? null : `${namespace}/${schemaName}/schema/${snapshot.file}`
        }
        if( toolsAggregate.grade !== undefined ) { node.grade = toolsAggregate.grade }
        if( toolsAggregate.ref !== undefined ) { node.ref = toolsAggregate.ref }
        return node
    }


    static #buildLockSnapshotFromManifest( { selectionDef, selectionId, members } ) {
        const memberDefs = Array.isArray( selectionDef.members ) ? selectionDef.members : []
        const memberInput = memberDefs
            .map( ( memberDef ) => {
                const resolved = members[ memberDef.schemaId ]
                return {
                    schemaId: memberDef.schemaId,
                    schemaVersion: memberDef.schemaVersion,
                    schemaHash: memberDef.schemaHash,
                    gradingStatus: resolved === undefined ? 'pending' : resolved.status,
                    override: memberDef.override
                }
            } )

        const def = Object.assign( {}, selectionDef, { selectionId } )
        return RebuildIndex.buildLockSnapshot( { selectionDef: def, members: memberInput } )
    }


    // ---- internal: filesystem + parsing -----------------------------------

    static async #readSelectionDef( { selectionDir } ) {
        const defDir = join( selectionDir, 'selection' )
        const selectionId = basename( selectionDir )
        const resolved = await RebuildIndex.resolveLatest( { dir: defDir, logicalName: selectionId } )
        if( !resolved.status ) {
            return { def: null, errors: [ `SEL-001: selection definition not found in ${defDir}` ] }
        }
        const parsed = await RebuildIndex.#readGradingFile( { path: resolved.path } )
        if( parsed.errors.length > 0 ) {
            return { def: null, errors: parsed.errors }
        }
        return { def: parsed.json, errors: [] }
    }


    static async #listSchemaDirs( { namespaceDir } ) {
        const all = await RebuildIndex.#listSubDirs( { dir: namespaceDir } )
        return all
            .filter( ( name ) => name !== GRADINGS_DIR )
    }


    static async #listSubDirs( { dir } ) {
        const dirExists = await RebuildIndex.#dirExists( { path: dir } )
        if( !dirExists ) { return [] }
        const entries = await readdir( dir, { withFileTypes: true } )
        return entries
            .filter( ( e ) => e.isDirectory() )
            .map( ( e ) => e.name )
            .sort()
    }


    static async #readGradingFile( { path } ) {
        try {
            const content = await readFile( path, 'utf-8' )
            try {
                return { json: JSON.parse( content ), errors: [] }
            } catch( parseError ) {
                return { json: null, errors: [ `IDX-004: grading entry not parseable: ${parseError.message}` ] }
            }
        } catch( ioError ) {
            return { json: null, errors: [ `IDX-006: grading entry not readable: ${path}` ] }
        }
    }


    static async #readExistingIndex( { path } ) {
        try {
            const content = await readFile( path, 'utf-8' )
            try {
                return JSON.parse( content )
            } catch( parseError ) {
                return null
            }
        } catch( ioError ) {
            return null
        }
    }


    static #relativeGradingRef( { gradingsDir, file, levels } ) {
        const segments = gradingsDir.split( /[\\/]/ )
        const tail = segments.slice( -levels )
        return `${tail.join( '/' )}/${file}`
    }


    /**
     * #writeIndexOverwritable — index.json is the SINGLE overwritable artifact.
     * Atomic tmp+rename. Source gradings/snapshots are never touched.
     */
    static async #writeIndexOverwritable( { path, index } ) {
        try {
            await mkdir( join( path, '..' ), { recursive: true } )
            const tmpPath = `${path}.tmp-${process.pid}`
            await writeFile( tmpPath, JSON.stringify( index, null, 4 ), 'utf-8' )
            await rename( tmpPath, path )
            return { errors: [] }
        } catch( error ) {
            return { errors: [ `IDX-008: index write failed: ${error.message}` ] }
        }
    }


    static #nowTimestamp() {
        return new Date().toISOString().replace( /:/g, '-' )
    }


    static #requireNodeStatus( { value, context } ) {
        if( !NODE_STATUSES.includes( value ) ) {
            return { value: null, errors: [ `invalid node status '${value}' for ${context}` ] }
        }
        return { value, errors: [] }
    }


    static async #dirExists( { path } ) {
        try {
            const s = await stat( path )
            return s.isDirectory()
        } catch( e ) { return false }
    }


    static #validationResolveLatest( { dir, logicalName } ) {
        const messages = []
        const struct = { status: false, messages }
        const pairs = [
            [ 'dir', dir, 'string' ],
            [ 'logicalName', logicalName, 'string' ]
        ]
        pairs
            .forEach( ( [ key, value, type ] ) => {
                if( value === undefined || value === null ) {
                    messages.push( `IDX-001: Required field missing: ${key}` )
                    return
                }
                if( type === 'string' && typeof value !== 'string' ) {
                    messages.push( `IDX-002: Type mismatch for field ${key}: expected string, got ${typeof value}` )
                }
            } )
        if( messages.length > 0 ) { return struct }
        struct.status = true
        return struct
    }


    static #validationDir( { dir, key } ) {
        const messages = []
        const struct = { status: false, messages }
        if( dir === undefined || dir === null ) {
            messages.push( `IDX-001: Required field missing: ${key}` )
            return struct
        }
        if( typeof dir !== 'string' ) {
            messages.push( `IDX-002: Type mismatch for field ${key}: expected string, got ${typeof dir}` )
            return struct
        }
        struct.status = true
        return struct
    }


    static #validationLockSnapshot( { selectionDef, members } ) {
        const messages = []
        const struct = { status: false, messages }

        if( selectionDef === undefined || selectionDef === null ) {
            messages.push( 'LCK-001: Required field missing: selectionDef' )
            return struct
        }
        if( typeof selectionDef !== 'object' || Array.isArray( selectionDef ) ) {
            messages.push( `LCK-002: Type mismatch for field selectionDef: expected object, got ${Array.isArray( selectionDef ) ? 'array' : typeof selectionDef}` )
            return struct
        }
        if( typeof selectionDef.selectionId !== 'string' ) {
            messages.push( 'LCK-001: Required field missing: selectionDef.selectionId' )
        }
        if( !Array.isArray( members ) ) {
            messages.push( 'LCK-003: Type mismatch for field members: expected array' )
        }
        if( messages.length > 0 ) { return struct }
        struct.status = true
        return struct
    }
}


export {
    RebuildIndex,
    INDEX_VERSION as REBUILD_INDEX_VERSION,
    INDEX_FILENAME as REBUILD_INDEX_FILENAME,
    NODE_STATUSES,
    ROLLUP_STATUSES,
    PRIMITIVE_FILENAME_REGEX,
    GRADING_FILENAME_REGEX
}
