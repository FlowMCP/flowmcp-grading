/**
 * PartialGrading — Partial vs Full grading-mode + mandatory-sequence validator.
 *
 * Per the grading spec (gradingSpec/1.2.0 §06 §8 — gradingMode + 5-status):
 *   - First entry MUST be full
 *   - Last-before-stable MUST be full
 *   - Partial entries MUST NOT change aggregateGrade
 *   - Only a `full` grading can move a node to the 5-status `stable`; a `partial`
 *     keeps the node at its last full status.
 *   - v2 scoping: a partial entry carries the `area` (and `skillId` for per-skill
 *     areas) it re-grades, so the partial set is scoped to one Area instance.
 *
 * NO SILENT DEFAULTS. Static methods only, object params, object returns.
 */

const VALID_MODES = [ 'full', 'partial' ]
const NODE_STATUSES = [ 'pending', 'blocked', 'graded', 'stable', 'rejected' ]


class PartialGrading {
    static getValidModes() {
        return { modes: VALID_MODES.slice() }
    }


    static buildPartialEntry( { baseEntry, dimensions, newGradings, grader, schemaHash, schemaVersion, area, skillId } ) {
        const { status, messages } = PartialGrading.#validationBuildPartial( {
            baseEntry, dimensions, newGradings, grader, schemaHash, schemaVersion
        } )
        if( !status ) { return { entry: null, errors: messages } }

        const newDimSet = new Set( dimensions )
        const stranger = newGradings
            .map( ( g, idx ) => ( { g, idx } ) )
            .filter( ( { g } ) => !newDimSet.has( g.dimension ) )

        if( stranger.length > 0 ) {
            const detail = stranger
                .map( ( { g, idx } ) => `index ${idx}: dimension '${g.dimension}' not in dimensions[]` )
                .join( '; ' )
            return {
                entry: null,
                errors: [ `PRT-002: Invalid gradingMode payload — ${detail}` ]
            }
        }

        const inheritedFrom = baseEntry.schemaHash !== undefined
            ? `${baseEntry.schemaId}@${baseEntry.schemaHash}`
            : baseEntry.schemaId

        const filteredGradings = newGradings
            .filter( ( g ) => newDimSet.has( g.dimension ) )

        const entry = {
            schemaId: baseEntry.schemaId,
            selectionId: baseEntry.selectionId,
            schemaVersion,
            schemaHash,
            gradingMode: 'partial',
            gradingTier: baseEntry.gradingTier,
            grader,
            gradings: filteredGradings,
            categoricalVeto: null,
            aggregateGrade: baseEntry.aggregateGrade,
            maxAttainableGrade: baseEntry.maxAttainableGrade,
            inheritedFrom,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            options: baseEntry.options === undefined ? {} : baseEntry.options
        }

        // v2 scoping: carry the Area (and skillId for per-skill areas) the partial
        // re-grades. Present only when the caller passes them — no silent default.
        if( area !== undefined && area !== null ) {
            entry.area = area
        }
        if( skillId !== undefined && skillId !== null ) {
            entry.skillId = skillId
        }

        const warnings = []
        if( filteredGradings.length === 0 ) {
            warnings.push( 'PRT-WARN-001: Partial entry has empty gradings[]' )
        }

        return { entry, errors: warnings }
    }


    static validateSequence( { gradingFiles } ) {
        const { status, messages } = PartialGrading.#validationSequence( { gradingFiles } )
        if( !status ) { return { valid: false, violations: [], errors: messages } }

        if( gradingFiles.length === 0 ) {
            return { valid: true, violations: [], errors: [] }
        }

        const violations = []

        // Rule 1: first must be full
        const first = gradingFiles[ 0 ]
        if( first.gradingMode !== 'full' ) {
            violations.push( {
                index: 0,
                rule: 'first-must-be-full',
                message: 'PRT-003: First grading entry must be gradingMode: full'
            } )
        }

        // Rule 2: gradingMode must be valid value
        gradingFiles
            .forEach( ( file, idx ) => {
                if( !VALID_MODES.includes( file.gradingMode ) ) {
                    violations.push( {
                        index: idx,
                        rule: 'invalid-mode',
                        message: `PRT-002: Invalid gradingMode: ${file.gradingMode} (expected partial or full)`
                    } )
                }
            } )

        // Rule 3: partial entries must not change aggregateGrade
        gradingFiles
            .map( ( file, idx ) => ( { file, idx } ) )
            .filter( ( { file } ) => file.gradingMode === 'partial' )
            .forEach( ( { file, idx } ) => {
                if( idx === 0 ) { return }
                const prev = gradingFiles[ idx - 1 ]
                if( prev.aggregateGrade !== file.aggregateGrade ) {
                    violations.push( {
                        index: idx,
                        rule: 'partial-must-not-change-aggregate',
                        message: `PRT-004: Partial entry at index ${idx} changed aggregateGrade from ${prev.aggregateGrade} to ${file.aggregateGrade}`
                    } )
                }
            } )

        return { valid: violations.length === 0, violations, errors: [] }
    }


    /**
     * resolveNodeStatus — express the partial/full × 5-status interaction (§8.3).
     * `partial` keeps the node at its lastFullStatus; only `full` (above threshold)
     * may move it to `stable`. No silent default — an unknown mode/status errors.
     *
     * @param {Object} params
     * @param {string} params.mode            — 'full' | 'partial'
     * @param {string} params.lastFullStatus — the node status of the last full grading
     * @param {boolean} params.eligibleStable — whether a full grading qualifies for stable
     * @returns {{ nodeStatus: string|null, errors: string[] }}
     */
    static resolveNodeStatus( { mode, lastFullStatus, eligibleStable } ) {
        if( !VALID_MODES.includes( mode ) ) {
            return { nodeStatus: null, errors: [ `PRT-002: Invalid gradingMode: ${mode} (expected partial or full)` ] }
        }
        if( !NODE_STATUSES.includes( lastFullStatus ) ) {
            return { nodeStatus: null, errors: [ `PRT-005: Invalid lastFullStatus: ${lastFullStatus}` ] }
        }
        if( mode === 'partial' ) {
            // A partial NEVER promotes; the node stays at its last full status.
            return { nodeStatus: lastFullStatus, errors: [] }
        }
        // mode === 'full': eligible → stable, otherwise graded (a grade exists).
        return { nodeStatus: eligibleStable === true ? 'stable' : 'graded', errors: [] }
    }


    static listGradedDimensions( { entry } ) {
        const { status, messages } = PartialGrading.#validationListDimensions( { entry } )
        if( !status ) { return { dimensions: [], errors: messages } }

        const dims = entry.gradings
            .map( ( g ) => g.dimension )

        return { dimensions: dims, errors: [] }
    }


    static #validationBuildPartial( { baseEntry, dimensions, newGradings, grader, schemaHash, schemaVersion } ) {
        const messages = []
        const struct = { status: false, messages }

        if( baseEntry === undefined || baseEntry === null || typeof baseEntry !== 'object' || Array.isArray( baseEntry ) ) {
            messages.push( 'PRT-001: Required field missing: baseEntry' )
            return struct
        }
        if( !Array.isArray( dimensions ) ) {
            messages.push( 'PRT-001: Required field missing: dimensions' )
            return struct
        }
        if( !Array.isArray( newGradings ) ) {
            messages.push( 'PRT-001: Required field missing: newGradings' )
            return struct
        }
        if( grader === undefined || grader === null ) {
            messages.push( 'PRT-001: Required field missing: grader' )
            return struct
        }
        if( schemaHash === undefined || schemaHash === null ) {
            messages.push( 'PRT-001: Required field missing: schemaHash' )
            return struct
        }
        if( schemaVersion === undefined || schemaVersion === null ) {
            messages.push( 'PRT-001: Required field missing: schemaVersion' )
            return struct
        }
        if( typeof baseEntry.schemaId !== 'string' ) {
            messages.push( 'PRT-001: Required field missing: baseEntry.schemaId' )
            return struct
        }

        struct.status = true
        return struct
    }


    static #validationSequence( { gradingFiles } ) {
        const messages = []
        const struct = { status: false, messages }

        if( gradingFiles === undefined || gradingFiles === null ) {
            messages.push( 'PRT-001: Required field missing: gradingFiles' )
            return struct
        }
        if( !Array.isArray( gradingFiles ) ) {
            messages.push( 'PRT-001: Required field missing: gradingFiles (expected array)' )
            return struct
        }

        struct.status = true
        return struct
    }


    static #validationListDimensions( { entry } ) {
        const messages = []
        const struct = { status: false, messages }

        if( entry === undefined || entry === null || typeof entry !== 'object' ) {
            messages.push( 'PRT-001: Required field missing: entry' )
            return struct
        }
        if( !Array.isArray( entry.gradings ) ) {
            messages.push( 'PRT-001: Required field missing: entry.gradings' )
            return struct
        }

        struct.status = true
        return struct
    }
}


export { PartialGrading, VALID_MODES, NODE_STATUSES }
