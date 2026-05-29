/**
 * FleetRunner — sequential orchestrator for the mini-praxis-fleet (Memo 082 Phase 5).
 *
 * Engine code only. NO LLM calls. Delegates to skills via a caller-supplied
 * `skillInvoker` callback (production: Claude Code skill engine; tests: mock).
 *
 * Loop:
 *   1. Validate input (FLEET-001..007 — no silent defaults).
 *   2. Load selection.lock.json (P4 output).
 *   3. Run PreConditionCheck — every member must be `stable`.
 *   4. For each member sequentially:
 *        For each area in `areas[]`:
 *          - Invoke `<area>-start-grade` skill via `skillInvoker`.
 *          - Persist returned gradingJson under
 *            `<outputBase>/single/<ns>--<tool>/gradings/<filename>.json`.
 *   5. After all 7 singles, run selection-grading once. Persist under
 *      `<outputBase>/selection/<selectionId>/gradings/<filename>.json`.
 *   6. Return structured summary.
 *
 * No batch-state-file (Memo 082 Kap 15.1 P5 explicit override of F4 recovery).
 * For the 7-schema mini-run a crash means "run again from scratch" — individual
 * gradings remain on disk under stable paths.
 *
 * Memo anchors:
 *   Kap 4.5  — Folder layout (Spec 19 §17.1)
 *   Kap 4.6  — Three folder types (public / gitignored grading-data / .memo)
 *   Kap 7.4  — Persona application per area
 *   Kap 12   — Recursive feedback loop (handed off to <area>-start-grade skills)
 *   Kap 15.1 — Phases and Phase 5 override
 *   Kap 15.2 — Mini-praxis scope (7 schemas)
 *
 * NO SILENT DEFAULTS. Static methods only, object params, object returns.
 */

import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

import { Grading } from './Grading.mjs'
import { PreConditionCheck } from './PreConditionCheck.mjs'


const AREAS_WITH_PERSONA = Object.freeze( [
    'about-namespace',
    'about-selection',
    'selection-skills-L1',
    'selection-skills-L2',
    'selection-skills-L3',
    'namespace-skills'
] )

const AREAS_NEUTRAL = Object.freeze( [
    'single-test',
    'tools-aggregate-schema',
    'namespace-description',
    'tools-aggregate-namespace'
] )

const KNOWN_AREAS = Object.freeze( AREAS_WITH_PERSONA.concat( AREAS_NEUTRAL ) )

const SELECTION_AREAS = Object.freeze( [
    'about-selection',
    'selection-skills-L1',
    'selection-skills-L2',
    'selection-skills-L3'
] )


class FleetRunner {
    /**
     * Run the mini-fleet sequentially over all members of selection.lock.json.
     *
     * @param {Object}   params
     * @param {string}   params.selectionPath — absolute path to selection.lock.json (P4 output)
     * @param {string[]} params.areas         — ordered list of area-slugs to grade per schema
     * @param {string|null} params.persona    — persona-slug for areas with personaRequired=true (or null — areas with persona-required then fail validation)
     * @param {number}   params.iterations    — max iterations forwarded to start-grade skills (>=1)
     * @param {string}   params.outputBase    — absolute path to grading-data/ root
     * @param {Function} params.skillInvoker  — async ({ skillName, payload }) => { gradingJson, iteration, blocker? }
     * @returns {Promise<{ status: string, schemasProcessed: number, singleGradings: Object[], selectionGrading: Object|null, errors: Object[] }>}
     */
    static async run( { selectionPath, areas, persona, iterations, outputBase, skillInvoker } ) {
        const validation = FleetRunner.#validateInput( {
            selectionPath, areas, persona, iterations, outputBase, skillInvoker
        } )
        if( !validation.status ) {
            throw new Error( validation.messages.join( '; ' ) )
        }

        // Public-tree-protection — verify outputBase BEFORE any skill is called.
        // Throws FLEET-005 if outputBase points into src/, prompts/, skills/, spec/, tests/, scripts/, docs/.
        FleetRunner.#assertOutputBaseSafe( { outputBase } )

        const loaded = await FleetRunner.#loadLock( { selectionPath } )
        if( loaded.error !== null ) {
            throw new Error( loaded.error )
        }
        const { selectionId, members } = loaded

        const gateResult = PreConditionCheck.checkLockfile( { lockfile: { members } } )
        if( !gateResult.passed ) {
            const missing = gateResult.missingSingleGradings.join( ', ' )
            const errMessage = `FLEET-004: Pre-Condition not met: missing stable single-gradings: ${missing}`
            return {
                status: 'fail',
                schemasProcessed: 0,
                singleGradings: [],
                selectionGrading: null,
                errors: [ { code: 'FLEET-004', message: errMessage } ]
            }
        }

        const errors = []
        const singleGradings = []

        const memberCount = members.length
        const memberIndices = Array.from( { length: memberCount }, ( _, i ) => i )

        await memberIndices.reduce( async ( prev, idx ) => {
            await prev
            const member = members[ idx ]
            const memberResult = await FleetRunner.#runSingleGrading( {
                member, areas, persona, iterations, outputBase, skillInvoker
            } )
            singleGradings.push( memberResult.summary )
            memberResult.errors
                .forEach( ( e ) => errors.push( e ) )
        }, Promise.resolve() )

        // Selection-Grading only runs when persona is provided — all selection areas
        // (about-selection, selection-skills-L1/L2/L3) require persona per Kap 7.4.
        // When persona is null the caller explicitly wants neutral-only grading,
        // so the selection step is skipped (no silent fallback to 'neutral').
        let selectionGradingSummary = null
        let selectionStatus = 'ok'
        if( persona !== null ) {
            const selectionResult = await FleetRunner.#runSelectionGrading( {
                selectionId, persona, iterations, outputBase, skillInvoker
            } )
            selectionResult.errors
                .forEach( ( e ) => errors.push( e ) )
            selectionGradingSummary = selectionResult.summary
            selectionStatus = selectionResult.summary.status
        }

        const hasBlocker = singleGradings
            .some( ( g ) => g.status === 'blocked' ) || selectionStatus === 'blocked'
        const finalStatus = hasBlocker ? 'fail' : 'ok'

        return {
            status: finalStatus,
            schemasProcessed: memberCount,
            singleGradings,
            selectionGrading: selectionGradingSummary,
            errors
        }
    }


    static #validateInput( { selectionPath, areas, persona, iterations, outputBase, skillInvoker } ) {
        const messages = []
        const struct = { status: false, messages }

        const pairs = [
            [ 'selectionPath', selectionPath, 'string' ],
            [ 'areas', areas, 'array' ],
            [ 'iterations', iterations, 'number' ],
            [ 'outputBase', outputBase, 'string' ],
            [ 'skillInvoker', skillInvoker, 'function' ]
        ]

        pairs
            .forEach( ( [ key, value, type ] ) => {
                if( value === undefined || value === null ) {
                    messages.push( `FLEET-001: Required field missing: ${key}` )
                    return
                }
                if( type === 'string' && typeof value !== 'string' ) {
                    messages.push( `FLEET-001: Type mismatch for field ${key}: expected string, got ${typeof value}` )
                    return
                }
                if( type === 'array' && !Array.isArray( value ) ) {
                    messages.push( `FLEET-001: Type mismatch for field ${key}: expected array, got ${typeof value}` )
                    return
                }
                if( type === 'number' && typeof value !== 'number' ) {
                    messages.push( `FLEET-001: Type mismatch for field ${key}: expected number, got ${typeof value}` )
                    return
                }
                if( type === 'function' && typeof value !== 'function' ) {
                    messages.push( `FLEET-001: Type mismatch for field ${key}: expected function, got ${typeof value}` )
                }
            } )

        // persona is special — string OR null is accepted (null means "no persona supplied")
        if( persona !== null && typeof persona !== 'string' ) {
            messages.push( `FLEET-001: Type mismatch for field persona: expected string or null, got ${typeof persona}` )
        }

        if( messages.length > 0 ) { return struct }

        if( areas.length === 0 ) {
            messages.push( 'FLEET-001: areas[] must not be empty' )
            return struct
        }

        const unknownAreas = areas
            .map( ( a, i ) => ( { area: a, index: i } ) )
            .filter( ( pair ) => !KNOWN_AREAS.includes( pair.area ) )
        if( unknownAreas.length > 0 ) {
            unknownAreas
                .forEach( ( { area, index } ) => {
                    messages.push( `FLEET-001: areas[${index}] unknown area: '${area}'` )
                } )
            return struct
        }

        if( iterations <= 0 || !Number.isInteger( iterations ) ) {
            messages.push( `FLEET-007: iterations must be integer >= 1, got: ${iterations}` )
            return struct
        }

        // Persona-required check — no silent fallback (Kap 7.4)
        const personaMissingFor = areas
            .map( ( a, i ) => ( { area: a, index: i } ) )
            .filter( ( pair ) => AREAS_WITH_PERSONA.includes( pair.area ) && persona === null )
        if( personaMissingFor.length > 0 ) {
            personaMissingFor
                .forEach( ( { area, index } ) => {
                    messages.push( `FLEET-001: persona required for area '${area}' at areas[${index}]` )
                } )
            return struct
        }

        // Optional persona-format validation (when present)
        if( persona !== null ) {
            const isNeutral = persona === 'neutral'
            const personaPattern = /^[a-z][a-z0-9-]*--[a-z][a-z0-9-]*$/
            if( !isNeutral && !personaPattern.test( persona ) ) {
                messages.push( `FLEET-001: persona must be 'neutral' or '<base>--<lens>', got: '${persona}'` )
                return struct
            }
        }

        struct.status = true
        return struct
    }


    static async #loadLock( { selectionPath } ) {
        let raw
        try {
            raw = await readFile( selectionPath, 'utf-8' )
        } catch( ioError ) {
            return {
                error: `FLEET-002: selection.lock.json not readable at ${selectionPath}: ${ioError.message}`,
                selectionId: null,
                members: []
            }
        }

        let parsed
        try {
            parsed = JSON.parse( raw )
        } catch( parseError ) {
            return {
                error: `FLEET-002: selection.lock.json not parsable: ${parseError.message}`,
                selectionId: null,
                members: []
            }
        }

        if( typeof parsed !== 'object' || parsed === null || Array.isArray( parsed ) ) {
            return {
                error: 'FLEET-002: selection.lock.json malformed: expected object',
                selectionId: null,
                members: []
            }
        }
        if( typeof parsed.selectionId !== 'string' || parsed.selectionId.length === 0 ) {
            return {
                error: 'FLEET-002: selection.lock.json missing selectionId',
                selectionId: null,
                members: []
            }
        }
        if( !Array.isArray( parsed.members ) ) {
            return {
                error: 'FLEET-002: selection.lock.json malformed: members[] missing',
                selectionId: null,
                members: []
            }
        }
        if( parsed.members.length === 0 ) {
            return {
                error: 'FLEET-003: selection.lock.json has empty members[]',
                selectionId: null,
                members: []
            }
        }

        return { error: null, selectionId: parsed.selectionId, members: parsed.members }
    }


    static async #runSingleGrading( { member, areas, persona, iterations, outputBase, skillInvoker } ) {
        const { schemaId, schemaHash, schemaVersion } = member
        const ns = FleetRunner.#deriveNamespace( { schemaId } )
        const tool = FleetRunner.#deriveTool( { schemaId } )
        const summary = {
            schemaId,
            ns,
            tool,
            areas: {},
            status: 'ok'
        }
        const errors = []

        const areaIndices = Array.from( { length: areas.length }, ( _, i ) => i )

        await areaIndices.reduce( async ( prev, idx ) => {
            await prev
            const area = areas[ idx ]
            const personaSlug = FleetRunner.#resolvePersona( { area, persona } )
            const skillName = `${area}-start-grade`

            const payload = {
                schemaId,
                ns,
                tool,
                schemaHash,
                schemaVersion,
                area,
                personaSlug,
                iterations,
                outputBase
            }

            let response
            try {
                response = await skillInvoker( { skillName, payload } )
            } catch( invokerError ) {
                errors.push( {
                    code: 'FLEET-006',
                    severity: 'WARNING',
                    message: `FLEET-006: skill ${skillName} threw for ${schemaId}: ${invokerError.message}`,
                    schemaId,
                    area
                } )
                summary.status = 'blocked'
                summary.areas[ area ] = { status: 'blocked', path: null }
                return
            }

            if( response === undefined || response === null || typeof response !== 'object' ) {
                errors.push( {
                    code: 'FLEET-006',
                    severity: 'WARNING',
                    message: `FLEET-006: skill ${skillName} returned no response object for ${schemaId}`,
                    schemaId,
                    area
                } )
                summary.status = 'blocked'
                summary.areas[ area ] = { status: 'blocked', path: null }
                return
            }

            if( response.blocker !== undefined && response.blocker !== null ) {
                errors.push( {
                    code: 'FLEET-006',
                    severity: 'WARNING',
                    message: `FLEET-006: skill ${skillName} reported blocker for ${schemaId}: ${response.blocker}`,
                    schemaId,
                    area
                } )
                summary.status = 'blocked'
                summary.areas[ area ] = { status: 'blocked', path: null }
                return
            }

            const targetPath = FleetRunner.#buildSinglePath( {
                outputBase, ns, tool, schemaHash, personaSlug
            } )
            FleetRunner.#assertUnderGradingData( { path: targetPath, outputBase } )

            await FleetRunner.#writeGradingJson( {
                targetPath, gradingJson: response.gradingJson
            } )

            summary.areas[ area ] = { status: 'ok', path: targetPath }
        }, Promise.resolve() )

        return { summary, errors }
    }


    static async #runSelectionGrading( { selectionId, persona, iterations, outputBase, skillInvoker } ) {
        const summary = {
            selectionId,
            areas: {},
            status: 'ok',
            path: null
        }
        const errors = []

        const areaIndices = Array.from( { length: SELECTION_AREAS.length }, ( _, i ) => i )

        await areaIndices.reduce( async ( prev, idx ) => {
            await prev
            const area = SELECTION_AREAS[ idx ]
            const personaSlug = FleetRunner.#resolvePersona( { area, persona } )
            const skillName = `${area}-start-grade`

            const payload = {
                selectionId,
                area,
                personaSlug,
                iterations,
                outputBase
            }

            let response
            try {
                response = await skillInvoker( { skillName, payload } )
            } catch( invokerError ) {
                errors.push( {
                    code: 'FLEET-006',
                    severity: 'WARNING',
                    message: `FLEET-006: selection-skill ${skillName} threw: ${invokerError.message}`,
                    selectionId,
                    area
                } )
                summary.status = 'blocked'
                summary.areas[ area ] = { status: 'blocked', path: null }
                return
            }

            if( response === undefined || response === null || typeof response !== 'object' ) {
                errors.push( {
                    code: 'FLEET-006',
                    severity: 'WARNING',
                    message: `FLEET-006: selection-skill ${skillName} returned no response object`,
                    selectionId,
                    area
                } )
                summary.status = 'blocked'
                summary.areas[ area ] = { status: 'blocked', path: null }
                return
            }

            if( response.blocker !== undefined && response.blocker !== null ) {
                errors.push( {
                    code: 'FLEET-006',
                    severity: 'WARNING',
                    message: `FLEET-006: selection-skill ${skillName} reported blocker: ${response.blocker}`,
                    selectionId,
                    area
                } )
                summary.status = 'blocked'
                summary.areas[ area ] = { status: 'blocked', path: null }
                return
            }

            const targetPath = FleetRunner.#buildSelectionPath( {
                outputBase, selectionId, personaSlug
            } )
            FleetRunner.#assertUnderGradingData( { path: targetPath, outputBase } )

            await FleetRunner.#writeGradingJson( {
                targetPath, gradingJson: response.gradingJson
            } )

            summary.areas[ area ] = { status: 'ok', path: targetPath }
            summary.path = targetPath
        }, Promise.resolve() )

        return { summary, errors }
    }


    static #resolvePersona( { area, persona } ) {
        if( AREAS_NEUTRAL.includes( area ) ) {
            return 'neutral'
        }
        // AREAS_WITH_PERSONA — persona is guaranteed non-null by #validateInput
        return persona
    }


    static #buildSinglePath( { outputBase, ns, tool, schemaHash, personaSlug } ) {
        const ts = FleetRunner.#timestamp()
        const filenameResult = Grading.formatGradingFilename( {
            hash: schemaHash, ts, persona: personaSlug
        } )
        return join( outputBase, 'single', `${ns}--${tool}`, 'gradings', filenameResult.filename )
    }


    static #buildSelectionPath( { outputBase, selectionId, personaSlug } ) {
        const ts = FleetRunner.#timestamp()
        // Selection-Grading uses a stable placeholder hash for the selection itself
        // (selectionHash lives on the lockfile; the per-area filename keeps ts + persona unique).
        const placeholder = 'PLACEHOLDER001'
        const filenameResult = Grading.formatGradingFilename( {
            hash: placeholder, ts, persona: personaSlug
        } )
        return join( outputBase, 'selection', selectionId, 'gradings', filenameResult.filename )
    }


    static #timestamp() {
        const iso = new Date().toISOString()
        // 2026-05-30T10:15:00.000Z → 2026-05-30T10-15-00Z
        const noMillis = iso.replace( /\.\d{3}Z$/, 'Z' )
        return noMillis.replace( /:/g, '-' )
    }


    static #deriveNamespace( { schemaId } ) {
        // schemaId convention: <ns> or <ns>:<tool>; for selection.lock entries we treat schemaId as namespace.
        if( typeof schemaId !== 'string' || schemaId.length === 0 ) {
            return 'unknown'
        }
        if( schemaId.includes( ':' ) ) {
            return schemaId.split( ':' )[ 0 ]
        }
        return schemaId
    }


    static #deriveTool( { schemaId } ) {
        if( typeof schemaId !== 'string' || schemaId.length === 0 ) {
            return 'unknown'
        }
        if( schemaId.includes( ':' ) ) {
            return schemaId.split( ':' )[ 1 ]
        }
        return schemaId
    }


    static #assertUnderGradingData( { path, outputBase } ) {
        const resolvedTarget = resolve( path )
        const resolvedBase = resolve( outputBase )
        const baseWithSep = resolvedBase.endsWith( sep ) ? resolvedBase : `${resolvedBase}${sep}`
        if( resolvedTarget !== resolvedBase && !resolvedTarget.startsWith( baseWithSep ) ) {
            throw new Error( `FLEET-005: refusing to write outside outputBase: target='${resolvedTarget}', outputBase='${resolvedBase}'` )
        }

        FleetRunner.#assertOutputBaseSafe( { outputBase } )
    }


    static #assertOutputBaseSafe( { outputBase } ) {
        const resolvedBase = resolve( outputBase )
        const forbiddenSegments = [
            `${sep}src${sep}`,
            `${sep}prompts${sep}`,
            `${sep}skills${sep}`,
            `${sep}spec${sep}`,
            `${sep}tests${sep}`,
            `${sep}scripts${sep}`,
            `${sep}docs${sep}`
        ]
        const baseSegmentCheck = `${resolvedBase}${sep}`
        const hit = forbiddenSegments
            .find( ( seg ) => baseSegmentCheck.includes( seg ) )
        if( hit !== undefined ) {
            throw new Error( `FLEET-005: outputBase points into public tree '${hit.trim()}'; refusing to write` )
        }
    }


    static async #writeGradingJson( { targetPath, gradingJson } ) {
        if( gradingJson === undefined || gradingJson === null ) {
            throw new Error( 'FLEET-006: gradingJson missing in skill response' )
        }
        const folder = dirname( targetPath )
        await mkdir( folder, { recursive: true } )
        const tmpPath = `${targetPath}.tmp`
        const payload = JSON.stringify( gradingJson, null, 4 )
        await writeFile( tmpPath, payload, 'utf-8' )
        await rename( tmpPath, targetPath )
    }
}


export { FleetRunner }
