/**
 * SelectionPhases — skill family 2 (group-bound), v2 selection-side Areas.
 *
 * The legacy S2 (Lockfile-Consistency) check is DROPPED — there is no
 * selection.lock.json lifecycle any more (pins live in index.json.lockSnapshot).
 * The remaining checks map to the selection-side Areas:
 *
 * | Phase | Area mapping                      | Tier         |
 * |-------|-----------------------------------|--------------|
 * | S1    | member-coverage (about-selection) | group-bound  |
 * | S3    | selection-skills (max 4)          | group-bound  |
 * | S4    | persona-reference (selection-aggregate) | group-bound |
 *
 * Per the grading spec (gradingSpec/3.0.0):
 *   - There are two skill families sharing one data model.
 *   - The selection validator consumes single-schema base units.
 *   - personaIds are required for non-deterministic dimensions.
 *   - Member status is read from index.json (the phase-status tree is dropped).
 *   - MAX_SKILLS = 4 (Spec v4.1.0 SKL018).
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { Grading } from '../Grading.mjs'


const PHASES = [ 'S1', 'S3', 'S4' ]
const TIER = 'group-bound'
const MAX_SKILLS = 4


class SelectionPhases {
    static getTier() {
        return { tier: TIER }
    }


    static async runS1( { entry, selectionId, selectionJson, gradingDataRoot } ) {
        const { status, messages } = SelectionPhases.#validationRunPhaseRich( {
            entry, selectionId, phase: 'S1', selectionJson, gradingDataRoot
        } )
        if( !status ) { return { entry, errors: messages } }

        const members = selectionJson.members
        if( !Array.isArray( members ) ) {
            return { entry, errors: [ 'SEL-S1: Selection S1 (Member-Coverage) violation: members[] missing' ], phase: 'S1' }
        }

        const memberIds = members.map( ( m ) => m.schemaId )
        const seen = new Set()
        const dupes = memberIds.filter( ( id ) => {
            if( seen.has( id ) ) { return true }
            seen.add( id )
            return false
        } )

        // v2: member STABLE-status is read from index.json.lockSnapshot, not from a
        // phase-status tree. S1 here only checks structural coverage (no duplicates,
        // resolvable members); the "all members stable" gate is PreConditionCheck.
        const indexPath = join( gradingDataRoot, 'selections', selectionId, 'index.json' )
        const lockSnapshot = await SelectionPhases.#readLockSnapshot( { path: indexPath } )
        const pinnedIds = lockSnapshot === null
            ? []
            : lockSnapshot.members.map( ( m ) => m.schemaId )

        const missing = lockSnapshot === null
            ? []
            : memberIds.filter( ( id ) => !pinnedIds.includes( id ) )

        const violations = []
        if( dupes.length > 0 ) {
            violations.push( `SEL-S1: Selection S1 (Member-Coverage) violation: duplicate members: ${[ ...new Set( dupes ) ].join( ', ' )}` )
        }
        if( missing.length > 0 ) {
            violations.push( `SEL-S1: Selection S1 (Member-Coverage) violation: members not pinned in index.json.lockSnapshot: ${missing.join( ', ' )}` )
        }

        return {
            entry,
            errors: violations,
            phase: 'S1',
            resolved: memberIds.filter( ( id ) => !missing.includes( id ) ),
            missing
        }
    }


    static async runS3( { entry, selectionId, selectionJson, gradingDataRoot } ) {
        const { status, messages } = SelectionPhases.#validationRunPhaseRich( {
            entry, selectionId, phase: 'S3', selectionJson, gradingDataRoot
        } )
        if( !status ) { return { entry, errors: messages } }

        const skills = Array.isArray( selectionJson.skills ) ? selectionJson.skills : []
        const violations = []

        if( skills.length > MAX_SKILLS ) {
            violations.push(
                `SEL-S3: Selection S3 (Skills-Coverage) violation: skills count ${skills.length} exceeds maximum ${MAX_SKILLS} (Spec v4.1.0 SKL018)`
            )
        }

        const seen = new Set()
        const dupes = skills.filter( ( name ) => {
            if( seen.has( name ) ) { return true }
            seen.add( name )
            return false
        } )
        if( dupes.length > 0 ) {
            violations.push(
                `SEL-S3: Selection S3 (Skills-Coverage) violation: duplicate skill names: ${[ ...new Set( dupes ) ].join( ', ' )}`
            )
        }

        const skillsDir = join( gradingDataRoot, 'selections', selectionId, 'skills' )
        const fileChecks = await Promise.all(
            skills.map( async ( skillRef ) => {
                const base = skillRef.split( '/' ).pop()
                const filename = base.endsWith( '.mjs' ) ? base : `${base}.mjs`
                const path = join( skillsDir, filename )
                const exists = await SelectionPhases.#fileExists( { path } )
                return { skillRef, exists, path }
            } )
        )

        const missingFiles = fileChecks.filter( ( c ) => !c.exists )
        missingFiles
            .forEach( ( c ) => {
                violations.push(
                    `SEL-S3: Selection S3 (Skills-Coverage) violation: skill file not found: ${c.path}`
                )
            } )

        return { entry, errors: violations, phase: 'S3' }
    }


    static async runS4( { entry, selectionId, selectionJson, personaIndex } ) {
        const { status, messages } = SelectionPhases.#validationRunPhaseRich( {
            entry, selectionId, phase: 'S4', selectionJson, gradingDataRoot: 'noop'
        } )
        if( !status ) { return { entry, errors: messages } }

        const personaIds = Array.isArray( selectionJson.personaIds ) ? selectionJson.personaIds : []
        const violations = []

        if( personaIds.length === 0 ) {
            violations.push( 'SEL-S4: Selection S4 (Persona-Reference-Coherence) violation: personaIds[] is empty' )
        }

        if( personaIndex === undefined || personaIndex === null ) {
            violations.push( 'SEL-S4: Selection S4 (Persona-Reference-Coherence) violation: personaIndex not provided' )
            return { entry, errors: violations, phase: 'S4' }
        }

        const unresolved = personaIds.filter( ( id ) => personaIndex[ id ] === undefined )
        if( unresolved.length > 0 ) {
            violations.push(
                `SEL-S4: Selection S4 (Persona-Reference-Coherence) violation: unresolved personaIds: ${unresolved.join( ', ' )}`
            )
        }

        const domainDocId = selectionJson.domainDocId
        if( domainDocId === undefined || domainDocId === null || typeof domainDocId !== 'string' || domainDocId.length === 0 ) {
            violations.push( 'SEL-S4: Selection S4 (Persona-Reference-Coherence) violation: domainDocId missing' )
        }

        return { entry, errors: violations, phase: 'S4' }
    }


    static runAllStub( { entry } ) {
        // Synchronous back-compat path for callers that have not migrated to the
        // lockfile-aware API yet (e.g. api.gradeSelection without selectionJson).
        return {
            entry,
            errors: [],
            phases: [
                { phase: 'S1', stub: true },
                { phase: 'S3', stub: true },
                { phase: 'S4', stub: true }
            ],
            tier: TIER,
            stub: true,
            todo: 'pass selectionJson + gradingDataRoot to enable S1/S3/S4'
        }
    }


    static async runAll( { entry, selectionId, selectionJson, gradingDataRoot, personaIndex, schemaEntries, domainDocPath, personaIds } ) {
        if( selectionJson === undefined || selectionJson === null ) {
            return SelectionPhases.runAllStub( { entry } )
        }

        // S2 (Lockfile-Consistency) is DROPPED in v2.
        const phaseRuns = [
            { name: 'S1', call: () => SelectionPhases.runS1( { entry, selectionId, selectionJson, gradingDataRoot } ) },
            { name: 'S3', call: () => SelectionPhases.runS3( { entry, selectionId, selectionJson, gradingDataRoot } ) },
            { name: 'S4', call: () => SelectionPhases.runS4( { entry, selectionId, selectionJson, personaIndex } ) }
        ]

        const results = []
        await phaseRuns
            .reduce( async ( accPromise, item ) => {
                const acc = await accPromise
                const r = await item.call()
                results.push( { phase: item.name, errors: r.errors === undefined ? [] : r.errors } )
                return acc
            }, Promise.resolve( null ) )

        const allErrors = results
            .reduce( ( acc, r ) => acc.concat( r.errors ), [] )

        return {
            entry,
            errors: allErrors,
            phases: results.map( ( r ) => ( { phase: r.phase, errors: r.errors } ) ),
            tier: TIER
        }
    }


    static async #fileExists( { path } ) {
        try {
            await stat( path )
            return true
        } catch( e ) {
            return false
        }
    }


    static async #readLockSnapshot( { path } ) {
        try {
            const raw = await readFile( path, 'utf-8' )
            const parsed = JSON.parse( raw )
            if( parsed.lockSnapshot === undefined || parsed.lockSnapshot === null ) { return null }
            if( !Array.isArray( parsed.lockSnapshot.members ) ) { return null }
            return parsed.lockSnapshot
        } catch( e ) {
            return null
        }
    }


    static #validationRunPhaseRich( { entry, selectionId, phase, selectionJson, gradingDataRoot } ) {
        const messages = []
        const struct = { status: false, messages }

        if( entry === undefined || entry === null || typeof entry !== 'object' ) {
            messages.push( 'GRD-001: Required field missing: entry' )
            return struct
        }
        if( selectionId === undefined || selectionId === null ) {
            messages.push( 'GRD-004: selectionId required when gradingTier=group-bound' )
            return struct
        }
        if( typeof selectionId !== 'string' ) {
            messages.push( `GRD-002: Type mismatch for field selectionId: expected string, got ${typeof selectionId}` )
            return struct
        }
        if( !PHASES.includes( phase ) ) {
            messages.push( `GRD-002: Type mismatch for field phase: expected one of [${PHASES.join( ', ' )}], got ${phase}` )
            return struct
        }
        if( entry.gradingTier !== TIER ) {
            messages.push( `GRD-003: Invalid gradingTier: ${entry.gradingTier} (expected \`group-bound\`)` )
            return struct
        }
        if( selectionJson === undefined || selectionJson === null || typeof selectionJson !== 'object' ) {
            messages.push( 'GRD-001: Required field missing: selectionJson' )
            return struct
        }
        if( gradingDataRoot === undefined || gradingDataRoot === null || typeof gradingDataRoot !== 'string' ) {
            messages.push( 'GRD-001: Required field missing: gradingDataRoot' )
            return struct
        }

        struct.status = true
        return struct
    }
}


export { SelectionPhases, MAX_SKILLS }
