/**
 * ProviderProof — the Provider-Proof producer.
 *
 * Renders `providers/<ns>/grade.json` as a DERIVED PROJECTION of the island
 * namespace `index.json` that RebuildIndex.rebuildNamespaceIndex returns. It
 * NEVER recomputes grading: it copies the rollup `status`, the `namespaceAggregate`
 * node (the provider grade), the per-schema 5-status, and the
 * `blockers[]` list — including emit-on-failure `blocked`/`validation-failed`
 * entries — into a committable, CI-visible subset.
 *
 * Two guarantees:
 *   - A blocked-only namespace STILL produces a complete `grade.json`
 *     (status: blocked + blockers[]) — the scaling lever.
 *   - The `monitoring` backref block (githubIssue / boardColumn) is emitted with
 *     null placeholders on first write, and any existing NON-NULL value written
 *     by the P3b sync is PRESERVED on re-run (the duplicate-issue guard). This
 *     preservation is explicit (read existing, carry non-null), never a silent
 *     merge.
 *
 * grade.json is the ONLY artifact this producer writes — atomic tmp+rename.
 * Schema `.mjs` files, island snapshots and `_gradings/` are never touched.
 *
 * Module reads NO .env. NO SILENT DEFAULTS. Static methods, object params,
 * object returns. No network, no interactive prompt — headless / env-free.
 */

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { join } from 'node:path'

import { VALID_BLOCKED_REASONS } from './Grading.mjs'


const PROOF_VERSION = 1
const PROOF_FILENAME = 'grade.json'

// The committed proof's node `reason` is a blockedReason and MUST be a member of the
// closed grading-spec enum (gradingSpec index.schema.json $defs.blockedReason). The
// island index also carries free-text pending annotations on `reason` (e.g. "no
// grading yet", "not yet imported") — those are INTERNAL and are dropped from the
// committed projection so a pending proof still validates against the spec. NO SILENT
// DEFAULTS: a non-enum reason is omitted, never rewritten.
//
// The deterministic data-pretest bar is 2 working
// downloadable tests (DataPretest DEFAULT_MIN_WORKING_TESTS). A schema blocked by that
// bar emits a "below 2" reason that matched NO enum member before — the closed set only
// knew 'fewer-than-three-tests' — so #specReason discarded it and the real reason never
// reached the committed proof. We add 'fewer-than-two-tests' so the Bar=2 block survives.
// Spec-alignment: this is a grading-spec blockedReason enum addition (gradingSpec
// index.schema.json $defs.blockedReason). The grading repo is the authority for the
// pretest bar; the spec enum must carry the matching member. Coordinated as a spec note
// here (the spec bump itself lives in flowmcp-spec, out of this memo's edit scope) —
// 'fewer-than-three-tests' is retained for backward compatibility, never silently dropped.
// Befund I-5: the list is no longer duplicated here — it is the SINGLE canonical
// VALID_BLOCKED_REASONS imported from Grading (which mirrors grading-spec 08 +
// index.schema.json $defs/blockedReason). The two producers can no longer diverge.
const SPEC_BLOCKED_REASONS = VALID_BLOCKED_REASONS


class ProviderProof {
    /**
     * write — render and atomically write the Provider-Proof for one namespace.
     *
     * @param {Object} params
     * @param {Object} params.namespaceIndex — the object rebuildNamespaceIndex returns
     * @param {string} params.providerDir — repo-side provider folder (e.g. schemas/v4.0.0/providers/<ns>/)
     * @returns {Promise<{ status, proofPath, proof, errors }>}
     */
    static async write( { namespaceIndex, providerDir } ) {
        const empty = { status: false, proofPath: null, proof: null }
        const { status, messages } = ProviderProof.#validationWrite( { namespaceIndex, providerDir } )
        if( !status ) { return { ...empty, errors: messages } }

        const proofPath = join( providerDir, PROOF_FILENAME )

        // Idempotent backref preservation: read any existing grade.json and carry
        // its NON-NULL monitoring values forward (the rest is recomputed). This is
        // what makes the P3b sync idempotent — a re-run never wipes a known
        // issue/column backref. Explicit, never a silent merge.
        const existing = await ProviderProof.#readExistingProof( { path: proofPath } )
        const monitoring = ProviderProof.#buildMonitoring( { existing } )

        const proof = ProviderProof.#renderProof( { namespaceIndex, monitoring } )

        const written = await ProviderProof.#writeProofOverwritable( { path: proofPath, proof } )
        if( written.errors.length > 0 ) {
            return { ...empty, proofPath, errors: written.errors }
        }

        return { status: true, proofPath, proof, errors: [] }
    }


    // ---- internal: projection ---------------------------------------------

    /**
     * #renderProof — copy the committable subset out of the namespace index.
     * Derived projection ONLY: no grade is recomputed. `namespaceAggregate` is
     * copied verbatim (grade present only when graded). Per-schema nodes are
     * projected to { status, grade?, reason? }. blockers[] is copied verbatim.
     */
    static #renderProof( { namespaceIndex, monitoring } ) {
        const schemas = ProviderProof.#projectSchemas( { schemas: namespaceIndex.schemas } )
        const namespaceAggregate = ProviderProof.#projectAggregate( { node: namespaceIndex.namespaceAggregate } )
        const blockers = Array.isArray( namespaceIndex.blockers )
            ? namespaceIndex.blockers.map( ( b ) => ( { ...b } ) )
            : []

        return {
            proofVersion: PROOF_VERSION,
            namespace: namespaceIndex.namespace,
            generatedAt: new Date().toISOString(),
            status: namespaceIndex.status,
            namespaceAggregate,
            schemas,
            blockers,
            monitoring
        }
    }


    static #projectSchemas( { schemas } ) {
        return Object.entries( schemas )
            .reduce( ( acc, [ name, node ] ) => {
                const projected = { status: node.status }
                if( node.grade !== undefined ) { projected.grade = node.grade }
                const reason = ProviderProof.#specReason( { reason: node.reason } )
                if( reason !== null ) { projected.reason = reason }
                acc[ name ] = projected
                return acc
            }, {} )
    }


    /**
     * #specReason — normalise an island node reason to its exact grading-spec
     * blockedReason. The island carries either the bare enum value
     * ('validation-failed') or a detailed prefix ('validation-failed: bad schema');
     * the committed proof must use the EXACT enum value (the detail survives in
     * blockers[], which the spec leaves unconstrained). Free-text pending reasons
     * ('no grading yet') match nothing and are dropped. Returns null when no spec
     * blockedReason matches — NO SILENT DEFAULTS.
     */
    static #specReason( { reason } ) {
        if( typeof reason !== 'string' ) { return null }
        const match = SPEC_BLOCKED_REASONS
            .find( ( r ) => reason === r || reason.startsWith( `${r}:` ) || reason.startsWith( `${r} ` ) )
        return match === undefined ? null : match
    }


    /**
     * #projectAggregate — copy the namespaceAggregate node. grade is surfaced
     * only when present (pending/blocked aggregate carries no grade — omitted,
     * not defaulted).
     */
    static #projectAggregate( { node } ) {
        const projected = { status: node.status }
        if( node.grade !== undefined ) { projected.grade = node.grade }
        // F11 (normalizedScore projection): surface the numeric normalizedScore into the proof so the
        // board Score field can be driven by it. Omitted (not defaulted to 0) when
        // the namespace is pending/blocked — NO SILENT DEFAULTS.
        if( node.normalizedScore !== undefined ) { projected.normalizedScore = node.normalizedScore }
        if( node.ref !== undefined ) { projected.ref = node.ref }
        const reason = ProviderProof.#specReason( { reason: node.reason } )
        if( reason !== null ) { projected.reason = reason }
        return projected
    }


    /**
     * #buildMonitoring — emit { githubIssue, boardColumn } with null placeholders
     * on first write; preserve any existing NON-NULL value from a prior proof.
     */
    static #buildMonitoring( { existing } ) {
        const prior = existing !== null && typeof existing.monitoring === 'object' && existing.monitoring !== null
            ? existing.monitoring
            : {}

        const githubIssue = prior.githubIssue !== undefined && prior.githubIssue !== null
            ? prior.githubIssue
            : null
        const boardColumn = prior.boardColumn !== undefined && prior.boardColumn !== null
            ? prior.boardColumn
            : null

        return { githubIssue, boardColumn }
    }


    // ---- internal: filesystem ---------------------------------------------

    static async #readExistingProof( { path } ) {
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


    /**
     * #writeProofOverwritable — grade.json is the SINGLE overwritable artifact
     * this producer writes. Atomic tmp+rename. No schema/island file is touched.
     */
    static async #writeProofOverwritable( { path, proof } ) {
        try {
            await mkdir( join( path, '..' ), { recursive: true } )
            const tmpPath = `${path}.tmp-${process.pid}`
            await writeFile( tmpPath, JSON.stringify( proof, null, 4 ), 'utf-8' )
            await rename( tmpPath, path )
            return { errors: [] }
        } catch( error ) {
            return { errors: [ `PRF-008: proof write failed: ${error.message}` ] }
        }
    }


    // ---- internal: validation (no silent defaults) ------------------------

    static #validationWrite( { namespaceIndex, providerDir } ) {
        const messages = []
        const struct = { status: false, messages }

        if( namespaceIndex === undefined || namespaceIndex === null ) {
            messages.push( 'PRF-001: Required field missing: namespaceIndex' )
        } else if( typeof namespaceIndex !== 'object' || Array.isArray( namespaceIndex ) ) {
            messages.push( `PRF-002: Type mismatch for field namespaceIndex: expected object, got ${Array.isArray( namespaceIndex ) ? 'array' : typeof namespaceIndex}` )
        } else {
            ProviderProof.#validateIndexShape( { namespaceIndex, messages } )
        }

        if( providerDir === undefined || providerDir === null ) {
            messages.push( 'PRF-001: Required field missing: providerDir' )
        } else if( typeof providerDir !== 'string' ) {
            messages.push( `PRF-002: Type mismatch for field providerDir: expected string, got ${typeof providerDir}` )
        } else if( providerDir.length === 0 ) {
            messages.push( 'PRF-003: Empty field: providerDir must be a non-empty string' )
        }

        if( messages.length > 0 ) { return struct }
        struct.status = true
        return struct
    }


    static #validateIndexShape( { namespaceIndex, messages } ) {
        if( typeof namespaceIndex.namespace !== 'string' ) {
            messages.push( 'PRF-001: Required field missing: namespaceIndex.namespace' )
        }
        if( typeof namespaceIndex.status !== 'string' ) {
            messages.push( 'PRF-001: Required field missing: namespaceIndex.status' )
        }
        if( namespaceIndex.namespaceAggregate === undefined || namespaceIndex.namespaceAggregate === null
            || typeof namespaceIndex.namespaceAggregate !== 'object' || Array.isArray( namespaceIndex.namespaceAggregate ) ) {
            messages.push( 'PRF-001: Required field missing: namespaceIndex.namespaceAggregate' )
        }
        if( namespaceIndex.schemas === undefined || namespaceIndex.schemas === null
            || typeof namespaceIndex.schemas !== 'object' || Array.isArray( namespaceIndex.schemas ) ) {
            messages.push( 'PRF-002: Type mismatch for field namespaceIndex.schemas: expected object' )
        }
        if( !Array.isArray( namespaceIndex.blockers ) ) {
            messages.push( 'PRF-002: Type mismatch for field namespaceIndex.blockers: expected array' )
        }
    }
}


export {
    ProviderProof,
    PROOF_VERSION as PROVIDER_PROOF_VERSION,
    PROOF_FILENAME as PROVIDER_PROOF_FILENAME
}
