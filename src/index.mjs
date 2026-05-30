/**
 * flowmcp-grading — public API entry point.
 *
 * Single entry point per the grading spec. Consumers MUST program against this
 * module only — internal modules are not exposed via package.json#exports.
 *
 * Public API inventory:
 *
 * | Export                  | Type     | Signature                                                                                  | Error Codes               |
 * |-------------------------|----------|--------------------------------------------------------------------------------------------|---------------------------|
 * | Grading                 | class    | static getVersion / createEntry / addGrading / computeAggregateGrade / applyRegradingTrigger / checkAging | GRD-*           |
 * | Scoring                 | class    | static getVersion / scoreDimension / validateScore / computeWeightedSum                    | SCO-*, GRD-*              |
 * | Veto                    | class    | static getTriggers / applyVeto / isVetoed / validateVeto                                   | VET-*                     |
 * | SingleSchemaPhases      | class    | static getTier / runP1..runP7 / runAll                                                     | GRD-*                     |
 * | SelectionPhases         | class    | static getTier / runS1..runS4 / runAll / runAllStub                                        | GRD-*, SEL-*              |
 * | ErrorCodes              | class    | static getCode / formatMessage / listByPrefix / listBySeverity / validateCodeFormat        | GRD-*                     |
 * | HashGenerator           | class    | static canonicalize / computeHash / computeSchemaHash / computeSelectionHash / ...         | HSH-*                     |
 * | SourceSnapshot          | class    | static create / parseSnapshotFilename / verify / listForNamespace                          | SNP-*                     |
 * | PartialGrading          | class    | static getValidModes / buildPartialEntry / validateSequence / listGradedDimensions         | PRT-*                     |
 * | StablePromotion         | class    | static checkEligibility / promoteIfEligible                                                | STB-*                     |
 * | SelectionLockfile       | class    | static generate / read / diff / validateOverride                                           | LCK-*                     |
 * | ProjectIndex            | class    | static init / read / write / validateIndex / indexPath                                     | IDX-*                     |
 * | PreConditionCheck       | class    | static check / checkLockfile                                                               | PRE-*                     |
 * | BumpHelper              | class    | static diffSchemas / diffSelections / checkVersionHashConsistency                          | BMP-*                     |
 * | FolderScanner           | class    | static scan / checkNamespaceFolder / checkSchemaSnapshots / checkSelectionFolder           | SCN-*                     |
 * | AboutConsistencyCheck   | class    | static checkNamespaceAbout / checkSelectionAbout / verifyNamespace                         | ABT-*                     |
 * | NaReason                | class    | static (closed-set n/a-reason validator)                                                   | NA-*                      |
 * | SharedLists             | class    | static (shared-list loader + hash + filename)                                              | SL-*                      |
 * | DataPretest             | class    | static getVersion / run                                                                    | DPT-*                     |
 * | ModuleApi               | class    | static readState / stats / addSchema / upgradeSchema / assertFullScopeRule / assertSelectionRespectsSchemaFull / getScopes | API-* |
 * | gradeSingleSchema       | function | ( { schemaPath, schemaId, grader, options } ) → { grading, errors }                        | GRD-001, GRD-002, GRD-003 |
 * | gradeSelection          | function | ( { selectionId, schemaIds, grader, options } ) → { grading, errors }                      | GRD-001, GRD-002, GRD-004 |
 * | validateGradingEntry    | function | ( { entry } ) → { valid, errors }                                                          | GRD-001, GRD-002          |
 * | getVersion              | function | () → { scoringSystem, gradingSystem, repoVersion }                                         | —                         |
 *
 * Per the grading spec:
 *   - Follows the Agent-Probe pattern (entry point, named exports, error codes).
 *   - src/index.mjs is the single entry point.
 *   - The public API is documented here.
 */

import { Grading } from './Grading.mjs'
import { Scoring } from './Scoring.mjs'
import { Veto } from './Veto.mjs'
import { SingleSchemaPhases } from './Phases/SingleSchema.mjs'
import { SelectionPhases } from './Phases/Selection.mjs'
import { ErrorCodes } from './ErrorCodes.mjs'
import { HashGenerator } from './HashGenerator.mjs'
import { SourceSnapshot } from './SourceSnapshot.mjs'
import { PartialGrading } from './Phases/PartialGrading.mjs'
import { StablePromotion } from './StablePromotion.mjs'
import { SelectionLockfile } from './SelectionLockfile.mjs'
import { ProjectIndex } from './ProjectIndex.mjs'
import { PreConditionCheck } from './PreConditionCheck.mjs'
import { BumpHelper } from './BumpHelper.mjs'
import { FolderScanner } from './FolderScanner.mjs'
import { AboutConsistencyCheck } from './AboutConsistencyCheck.mjs'
import { NaReason } from './NaReason.mjs'
import { SharedLists } from './SharedLists.mjs'
import { DataPretest } from './DataPretest.mjs'
import { ModuleApi } from './ModuleApi.mjs'
import { SkillComposition } from './SkillComposition.mjs'


const REPO_VERSION = '1.0.0'


const validationGradeSingleSchema = ( { schemaPath, schemaId, grader } ) => {
    const messages = []
    const pairs = [
        [ 'schemaPath', schemaPath, 'string' ],
        [ 'schemaId', schemaId, 'string' ],
        [ 'grader', grader, 'object' ]
    ]

    pairs
        .forEach( ( [ key, value, type ] ) => {
            if( value === undefined || value === null ) {
                messages.push( `GRD-001: Required field missing: ${key}` )
                return
            }
            if( type === 'string' && typeof value !== 'string' ) {
                messages.push( `GRD-002: Type mismatch for field ${key}: expected string, got ${typeof value}` )
                return
            }
            if( type === 'object' && ( typeof value !== 'object' || Array.isArray( value ) ) ) {
                messages.push( `GRD-002: Type mismatch for field ${key}: expected object, got ${Array.isArray( value ) ? 'array' : typeof value}` )
            }
        } )

    return { status: messages.length === 0, messages }
}


const validationGradeSelection = ( { selectionId, schemaIds, grader } ) => {
    const messages = []
    const pairs = [
        [ 'selectionId', selectionId, 'string' ],
        [ 'schemaIds', schemaIds, 'array' ],
        [ 'grader', grader, 'object' ]
    ]

    pairs
        .forEach( ( [ key, value, type ] ) => {
            if( value === undefined || value === null ) {
                messages.push( `GRD-001: Required field missing: ${key}` )
                return
            }
            if( type === 'string' && typeof value !== 'string' ) {
                messages.push( `GRD-002: Type mismatch for field ${key}: expected string, got ${typeof value}` )
                return
            }
            if( type === 'array' && !Array.isArray( value ) ) {
                messages.push( `GRD-002: Type mismatch for field ${key}: expected array, got ${typeof value}` )
                return
            }
            if( type === 'object' && ( typeof value !== 'object' || Array.isArray( value ) ) ) {
                messages.push( `GRD-002: Type mismatch for field ${key}: expected object, got ${Array.isArray( value ) ? 'array' : typeof value}` )
            }
        } )

    return { status: messages.length === 0, messages }
}


const validationEntryInput = ( { entry } ) => {
    const messages = []

    if( entry === undefined || entry === null ) {
        messages.push( 'GRD-001: Required field missing: entry' )
        return { status: false, messages }
    }
    if( typeof entry !== 'object' || Array.isArray( entry ) ) {
        messages.push( `GRD-002: Type mismatch for field entry: expected object, got ${Array.isArray( entry ) ? 'array' : typeof entry}` )
        return { status: false, messages }
    }
    if( typeof entry.schemaId !== 'string' ) {
        messages.push( 'GRD-001: Required field missing: entry.schemaId' )
        return { status: false, messages }
    }
    if( !Array.isArray( entry.gradings ) ) {
        messages.push( 'GRD-002: Type mismatch for field entry.gradings: expected array, got non-array' )
        return { status: false, messages }
    }
    if( entry.gradingTier !== 'autonomous' && entry.gradingTier !== 'group-bound' ) {
        messages.push( `GRD-003: Invalid gradingTier: ${entry.gradingTier} (expected \`autonomous\` or \`group-bound\`)` )
        return { status: false, messages }
    }

    return { status: true, messages }
}


/**
 * gradeSingleSchema — convenience entry to grade a single schema (autonomous tier).
 *
 * @param {Object} params
 * @param {string} params.schemaPath — filesystem path to the schema (.mjs)
 * @param {string} params.schemaId — stable id for the schema
 * @param {Object} params.grader — graderIdentity object ({ kind, name, version, ... })
 * @param {Object} [params.options] — optional options object
 * @returns {{ grading: Object|null, errors: string[] }}
 * @throws GRD-001 (missing field), GRD-002 (type mismatch), GRD-003 (invalid tier)
 */
const gradeSingleSchema = ( { schemaPath, schemaId, grader, options } ) => {
    const { status, messages } = validationGradeSingleSchema( { schemaPath, schemaId, grader } )
    if( !status ) { return { grading: null, errors: messages } }

    const created = Grading.createEntry( {
        schemaId,
        selectionId: null,
        gradingTier: 'autonomous',
        grader,
        options
    } )
    if( created.errors.length > 0 ) {
        return { grading: created.entry, errors: created.errors }
    }

    const run = SingleSchemaPhases.runAll( { entry: created.entry, schemaPath } )
    const aggregate = Grading.computeAggregateGrade( { entry: run.entry } )

    return {
        grading: Object.assign( {}, run.entry, {
            aggregateGrade: aggregate.aggregateGrade,
            maxAttainableGrade: aggregate.maxAttainableGrade
        } ),
        errors: run.errors.concat( aggregate.errors === undefined ? [] : aggregate.errors )
    }
}


/**
 * gradeSelection — convenience entry to grade a selection (group-bound tier).
 *
 * @param {Object} params
 * @param {string} params.selectionId — id of the selection group
 * @param {string[]} params.schemaIds — schema ids contained in the selection
 * @param {Object} params.grader — graderIdentity object
 * @param {Object} [params.options] — optional options object
 * @returns {{ grading: Object|null, errors: string[] }}
 * @throws GRD-001, GRD-002, GRD-004
 */
const gradeSelection = ( { selectionId, schemaIds, grader, options } ) => {
    const { status, messages } = validationGradeSelection( { selectionId, schemaIds, grader } )
    if( !status ) { return { grading: null, errors: messages } }

    const created = Grading.createEntry( {
        schemaId: `selection:${selectionId}`,
        selectionId,
        gradingTier: 'group-bound',
        grader,
        options
    } )
    if( created.errors.length > 0 ) {
        return { grading: created.entry, errors: created.errors }
    }

    const run = SelectionPhases.runAllStub( { entry: created.entry } )
    const aggregate = Grading.computeAggregateGrade( { entry: run.entry } )

    return {
        grading: Object.assign( {}, run.entry, {
            aggregateGrade: aggregate.aggregateGrade,
            maxAttainableGrade: aggregate.maxAttainableGrade,
            schemaIds
        } ),
        errors: run.errors.concat( aggregate.errors === undefined ? [] : aggregate.errors )
    }
}


/**
 * validateGradingEntry — validates a grading entry object against the model.
 *
 * @param {Object} params
 * @param {Object} params.entry — the grading entry to validate
 * @returns {{ valid: boolean, errors: string[] }}
 * @throws GRD-001, GRD-002, GRD-003
 */
const validateGradingEntry = ( { entry } ) => {
    const { status, messages } = validationEntryInput( { entry } )
    if( !status ) { return { valid: false, errors: messages } }

    return { valid: true, errors: [] }
}


/**
 * getVersion — returns the version triple for repo + scoring + grading systems.
 *
 * @returns {{ scoringSystem: string, gradingSystem: string, repoVersion: string }}
 */
const getVersion = () => {
    const sco = Scoring.getVersion()
    const grd = Grading.getVersion()
    return {
        scoringSystem: sco.version,
        gradingSystem: grd.version,
        repoVersion: REPO_VERSION
    }
}


export {
    Grading,
    Scoring,
    Veto,
    SingleSchemaPhases,
    SelectionPhases,
    ErrorCodes,
    HashGenerator,
    SourceSnapshot,
    PartialGrading,
    StablePromotion,
    SelectionLockfile,
    ProjectIndex,
    PreConditionCheck,
    BumpHelper,
    FolderScanner,
    AboutConsistencyCheck,
    NaReason,
    SharedLists,
    DataPretest,
    ModuleApi,
    SkillComposition,
    gradeSingleSchema,
    gradeSelection,
    validateGradingEntry,
    getVersion
}
