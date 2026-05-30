/**
 * SelectionPhases — Skill-Familie 2 (group-bound).
 *
 * Phases S1-S4 (Memo 080 PRD-13):
 *
 * | Phase | Pruefung                          | Tier         |
 * |-------|-----------------------------------|--------------|
 * | S1    | Member-Coverage                   | group-bound  |
 * | S2    | Lockfile-Consistency              | group-bound  |
 * | S3    | Skills-Coverage (max 4)           | group-bound  |
 * | S4    | Persona-Reference-Coherence       | group-bound  |
 *
 * Memo 076 anchors:
 *   Z. 258 — Two skill families, shared data model
 *   Z. 294-297 — Selection-Validator consumes single-schema entries, writes S1-S4
 *   Z. 311 — personaIds required for non-deterministic dimensions
 *
 * Memo 080 anchors:
 *   Kap 5 — S1-S4 vollstaendig
 *   Kap 11 — Lockfile + selectionHash
 *   PRD-13 — Code-Implementation
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { Grading } from '../Grading.mjs'
import { HashGenerator } from '../HashGenerator.mjs'


const PHASES = [ 'S1', 'S2', 'S3', 'S4' ]
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

        const checkResults = await Promise.all(
            memberIds.map( async ( id ) => {
                const nsTool = id.replace( /\./g, '--' )
                const psPath = join( gradingDataRoot, 'phase-status', 'single', `${nsTool}.json` )
                const exists = await SelectionPhases.#fileExists( { path: psPath } )
                return { schemaId: id, exists }
            } )
        )

        const missing = checkResults
            .filter( ( r ) => !r.exists )
            .map( ( r ) => r.schemaId )

        const violations = []
        if( dupes.length > 0 ) {
            violations.push( `SEL-S1: Selection S1 (Member-Coverage) violation: duplicate members: ${[ ...new Set( dupes ) ].join( ', ' )}` )
        }
        if( missing.length > 0 ) {
            violations.push( `SEL-S1: Selection S1 (Member-Coverage) violation: missing phase-status for: ${missing.join( ', ' )}` )
        }

        return {
            entry,
            errors: violations,
            phase: 'S1',
            resolved: memberIds.filter( ( id ) => !missing.includes( id ) ),
            missing
        }
    }


    static async runS2( { entry, selectionId, selectionJson, lockfile, gradingDataRoot } ) {
        const { status, messages } = SelectionPhases.#validationRunPhaseRich( {
            entry, selectionId, phase: 'S2', selectionJson, gradingDataRoot
        } )
        if( !status ) { return { entry, errors: messages } }

        if( lockfile === undefined || lockfile === null ) {
            return {
                entry,
                errors: [ 'SEL-S2: Selection S2 (Lockfile-Consistency) violation: lockfile missing' ],
                phase: 'S2'
            }
        }

        const violations = []

        // Hash recomputation must match
        const recomputed = HashGenerator.computeSelectionHash( { selection: selectionJson } )
        if( recomputed.errors.length === 0 && lockfile.selectionHash !== recomputed.hash ) {
            violations.push(
                `SEL-S2: Selection S2 (Lockfile-Consistency) violation: selectionHash mismatch (lockfile=${lockfile.selectionHash}, recomputed=${recomputed.hash})`
            )
        }

        const selMembers = Array.isArray( selectionJson.members ) ? selectionJson.members.map( ( m ) => m.schemaId ) : []
        const lockMembers = Array.isArray( lockfile.members ) ? lockfile.members.map( ( m ) => m.schemaId ) : []

        const missingInLock = selMembers.filter( ( id ) => !lockMembers.includes( id ) )
        const orphanInLock = lockMembers.filter( ( id ) => !selMembers.includes( id ) )

        if( missingInLock.length > 0 ) {
            violations.push( `SEL-S2: Selection S2 (Lockfile-Consistency) violation: members missing from lockfile: ${missingInLock.join( ', ' )}` )
        }
        if( orphanInLock.length > 0 ) {
            violations.push( `SEL-S2: Selection S2 (Lockfile-Consistency) violation: lockfile-only orphan members: ${orphanInLock.join( ', ' )}` )
        }

        // Member-level hash consistency vs phase-status
        const psResults = await Promise.all(
            ( Array.isArray( lockfile.members ) ? lockfile.members : [] )
                .map( async ( m ) => {
                    if( m.schemaHash === null || m.schemaHash === undefined ) {
                        return { schemaId: m.schemaId, ok: true }
                    }
                    const nsTool = m.schemaId.replace( /\./g, '--' )
                    const psPath = join( gradingDataRoot, 'phase-status', 'single', `${nsTool}.json` )
                    try {
                        const raw = await readFile( psPath, 'utf-8' )
                        const ps = JSON.parse( raw )
                        return { schemaId: m.schemaId, ok: ps.schemaHash === m.schemaHash, psHash: ps.schemaHash, lockHash: m.schemaHash }
                    } catch( e ) {
                        return { schemaId: m.schemaId, ok: false, error: e.message }
                    }
                } )
        )

        const hashMismatches = psResults.filter( ( r ) => !r.ok )
        hashMismatches
            .forEach( ( r ) => {
                violations.push(
                    `SEL-S2: Selection S2 (Lockfile-Consistency) violation: schemaHash mismatch for ${r.schemaId} (lockfile=${r.lockHash}, phase-status=${r.psHash})`
                )
            } )

        return { entry, errors: violations, phase: 'S2' }
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

        const skillsDir = join( gradingDataRoot, 'selection', selectionId, 'skills' )
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
                { phase: 'S2', stub: true },
                { phase: 'S3', stub: true },
                { phase: 'S4', stub: true }
            ],
            tier: TIER,
            stub: true,
            todo: 'pass selectionJson + lockfile + gradingDataRoot to enable S1-S4'
        }
    }


    static async runAll( { entry, selectionId, selectionJson, lockfile, gradingDataRoot, personaIndex, schemaEntries, domainDocPath, personaIds } ) {
        if( selectionJson === undefined || selectionJson === null ) {
            return SelectionPhases.runAllStub( { entry } )
        }

        const phaseRuns = [
            { name: 'S1', call: () => SelectionPhases.runS1( { entry, selectionId, selectionJson, gradingDataRoot } ) },
            { name: 'S2', call: () => SelectionPhases.runS2( { entry, selectionId, selectionJson, lockfile, gradingDataRoot } ) },
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
