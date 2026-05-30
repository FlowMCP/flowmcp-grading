/**
 * Integration tests for FleetRunner.
 *
 * Eight required tests:
 *   1. Happy-path — 7 members × N areas, sequential order, output paths under outputBase.
 *   2. Pre-Condition fail — at least one member not 'stable' → FLEET-004.
 *   3. Validation fail (persona) — area with personaRequired=true, persona=null → FLEET-001.
 *   4. Validation fail (iterations) — iterations=0 → FLEET-007.
 *   5. Validation fail (lockfile) — selectionPath non-existent → FLEET-002.
 *   6. Public-tree protection — outputBase under src/ → FLEET-005.
 *   7. Sequential order — skillInvoker call sequence equals members[] × areas[].
 *   8. Blocker recovery — member 3 blocker, member 4+ proceed; FLEET-006 in errors.
 *
 * Mock skillInvoker is defined inline — no external mock library, no LLM, no network.
 */

import { describe, test, expect, beforeAll, afterEach, afterAll } from '@jest/globals'
import { mkdtemp, rm, mkdir, writeFile, readdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { FleetRunner } from '../../src/FleetRunner.mjs'


let tempRoot = null
let gradingDataRoot = null
let lockfilePath = null


const buildLockfile = ( { allStable } ) => {
    const baseMembers = [
        { schemaId: 'coinmarketcap', schemaVersion: '1.0.0', schemaHash: 'a1b2c3d4', gradingStatus: 'stable' },
        { schemaId: 'ccxt',          schemaVersion: '1.0.0', schemaHash: 'b2c3d4e5', gradingStatus: 'stable' },
        { schemaId: 'uniswap',       schemaVersion: '1.0.0', schemaHash: 'c3d4e5f6', gradingStatus: 'stable' },
        { schemaId: 'dexscreener',   schemaVersion: '1.0.0', schemaHash: 'd4e5f6a7', gradingStatus: 'stable' },
        { schemaId: 'etherscan',     schemaVersion: '1.0.0', schemaHash: 'e5f6a7b8', gradingStatus: 'stable' },
        { schemaId: 'moralis',       schemaVersion: '1.0.0', schemaHash: 'f6a7b8c9', gradingStatus: 'stable' },
        { schemaId: 'defillama',     schemaVersion: '1.0.0', schemaHash: '0a7b8c9d', gradingStatus: 'stable' }
    ]

    if( !allStable ) {
        baseMembers[ 2 ].gradingStatus = 'pending'
        baseMembers[ 5 ].gradingStatus = 'pending'
    }

    return {
        selectionId: 'crypto-mini',
        selectionVersion: '1.0.0',
        selectionHash: '00000000',
        generatedAt: '2026-05-30T00:00:00.000Z',
        members: baseMembers
    }
}


const writeLockfile = async ( { content, path } ) => {
    await mkdir( dirname( path ), { recursive: true } )
    await writeFile( path, JSON.stringify( content, null, 4 ), 'utf-8' )
}


const makeMockInvoker = ( { calls, blockerForSchemaId, blockerForArea } ) => {
    const fn = async ( { skillName, payload } ) => {
        calls.push( { skillName, payload } )

        const schemaId = payload.schemaId === undefined ? payload.selectionId : payload.schemaId
        const area = payload.area

        if( blockerForSchemaId !== undefined && schemaId === blockerForSchemaId ) {
            return { blocker: 'simulated blocker', reason: 'test fixture' }
        }
        if( blockerForArea !== undefined && area === blockerForArea ) {
            return { blocker: 'simulated blocker', reason: 'test fixture' }
        }

        return {
            gradingJson: {
                schemaId,
                area,
                personaSlug: payload.personaSlug,
                iteration: 1,
                gradings: [ { dimension: 'test', score: 'pass', determinism: 'deterministic' } ]
            },
            iteration: 1
        }
    }
    return fn
}


const NEUTRAL_AREAS = [ 'single-test', 'tools-aggregate-schema', 'namespace-description', 'tools-aggregate-namespace' ]
const PERSONA_AREAS = [ 'about-namespace', 'about-selection', 'selection-skills-L1', 'selection-skills-L2', 'selection-skills-L3', 'namespace-skills' ]


beforeAll( async () => {
    tempRoot = await mkdtemp( join( tmpdir(), 'fleet-runner-' ) )
} )


afterEach( async () => {
    // wipe contents between tests but keep tempRoot
    if( tempRoot !== null ) {
        const entries = await readdir( tempRoot )
        await Promise.all( entries.map( ( name ) => rm( join( tempRoot, name ), { recursive: true, force: true } ) ) )
    }
    gradingDataRoot = null
    lockfilePath = null
} )


afterAll( async () => {
    if( tempRoot !== null ) {
        await rm( tempRoot, { recursive: true, force: true } )
    }
} )


const prepareCase = async ( { allStable } ) => {
    gradingDataRoot = join( tempRoot, 'grading-data' )
    await mkdir( gradingDataRoot, { recursive: true } )

    lockfilePath = join( gradingDataRoot, 'selection', 'crypto-mini', 'selection.lock.json' )
    const lock = buildLockfile( { allStable } )
    await writeLockfile( { content: lock, path: lockfilePath } )
}


describe( 'FleetRunner.run', () => {
    test( '1) happy-path: 7 members × N areas, sequential, outputs under outputBase', async () => {
        await prepareCase( { allStable: true } )
        const areas = [ 'single-test', 'tools-aggregate-schema' ]
        const calls = []
        const invoker = makeMockInvoker( { calls } )

        const result = await FleetRunner.run( {
            selectionPath: lockfilePath,
            areas,
            persona: 'decision-maker--crypto-trader',
            iterations: 3,
            outputBase: gradingDataRoot,
            skillInvoker: invoker
        } )

        expect( result.status ).toBe( 'ok' )
        expect( result.schemasProcessed ).toBe( 7 )
        expect( result.singleGradings.length ).toBe( 7 )
        expect( result.selectionGrading ).not.toBeNull()

        // Output paths under outputBase
        const singlePaths = result.singleGradings
            .flatMap( ( g ) => Object.values( g.areas ).map( ( a ) => a.path ) )
        singlePaths
            .forEach( ( p ) => {
                expect( p.startsWith( gradingDataRoot ) ).toBe( true )
            } )

        // Selection-Grading wrote at least one file under selection/<id>/gradings/
        const selectionDir = join( gradingDataRoot, 'selection', 'crypto-mini', 'gradings' )
        const stats = await stat( selectionDir )
        expect( stats.isDirectory() ).toBe( true )
    } )

    test( '2) pre-condition fail: members not stable → FLEET-004, no skill calls', async () => {
        await prepareCase( { allStable: false } )
        const calls = []
        const invoker = makeMockInvoker( { calls } )

        const result = await FleetRunner.run( {
            selectionPath: lockfilePath,
            areas: [ 'single-test' ],
            persona: null,
            iterations: 3,
            outputBase: gradingDataRoot,
            skillInvoker: invoker
        } )

        expect( result.status ).toBe( 'fail' )
        expect( result.schemasProcessed ).toBe( 0 )
        expect( result.errors[ 0 ].code ).toBe( 'FLEET-004' )
        expect( calls.length ).toBe( 0 )
    } )

    test( '3) validation fail (persona missing for area): FLEET-001', async () => {
        await prepareCase( { allStable: true } )
        const calls = []
        const invoker = makeMockInvoker( { calls } )

        await expect( FleetRunner.run( {
            selectionPath: lockfilePath,
            areas: [ 'about-namespace' ],
            persona: null,
            iterations: 3,
            outputBase: gradingDataRoot,
            skillInvoker: invoker
        } ) ).rejects.toThrow( /FLEET-001.*persona required/ )
        expect( calls.length ).toBe( 0 )
    } )

    test( '4) validation fail (iterations=0): FLEET-007', async () => {
        await prepareCase( { allStable: true } )
        const calls = []
        const invoker = makeMockInvoker( { calls } )

        await expect( FleetRunner.run( {
            selectionPath: lockfilePath,
            areas: [ 'single-test' ],
            persona: null,
            iterations: 0,
            outputBase: gradingDataRoot,
            skillInvoker: invoker
        } ) ).rejects.toThrow( /FLEET-007/ )
        expect( calls.length ).toBe( 0 )
    } )

    test( '5) validation fail (lockfile not found): FLEET-002', async () => {
        gradingDataRoot = join( tempRoot, 'grading-data' )
        await mkdir( gradingDataRoot, { recursive: true } )
        const missingPath = join( gradingDataRoot, 'does-not-exist.lock.json' )
        const calls = []
        const invoker = makeMockInvoker( { calls } )

        await expect( FleetRunner.run( {
            selectionPath: missingPath,
            areas: [ 'single-test' ],
            persona: null,
            iterations: 3,
            outputBase: gradingDataRoot,
            skillInvoker: invoker
        } ) ).rejects.toThrow( /FLEET-002/ )
        expect( calls.length ).toBe( 0 )
    } )

    test( '6) public-tree protection: outputBase under src/ → FLEET-005', async () => {
        await prepareCase( { allStable: true } )
        // outputBase points at a fake src/ folder — refuses to write
        const fakeSrcBase = join( tempRoot, 'fake-repo', 'src' )
        await mkdir( fakeSrcBase, { recursive: true } )
        const calls = []
        const invoker = makeMockInvoker( { calls } )

        await expect( FleetRunner.run( {
            selectionPath: lockfilePath,
            areas: [ 'single-test' ],
            persona: null,
            iterations: 1,
            outputBase: fakeSrcBase,
            skillInvoker: invoker
        } ) ).rejects.toThrow( /FLEET-005/ )
    } )

    test( '7) sequential order: members[] × areas[] (no parallel)', async () => {
        await prepareCase( { allStable: true } )
        const areas = [ 'single-test', 'tools-aggregate-schema' ]
        const calls = []
        const invoker = makeMockInvoker( { calls } )

        await FleetRunner.run( {
            selectionPath: lockfilePath,
            areas,
            persona: 'decision-maker--crypto-trader',
            iterations: 2,
            outputBase: gradingDataRoot,
            skillInvoker: invoker
        } )

        // First 7×2 = 14 calls are single-grading area-loops in lockfile order
        const lock = buildLockfile( { allStable: true } )
        const expectedSequence = []
        lock.members
            .forEach( ( m ) => {
                areas
                    .forEach( ( a ) => {
                        expectedSequence.push( { schemaId: m.schemaId, area: a } )
                    } )
            } )

        const actualSingle = calls
            .slice( 0, expectedSequence.length )
            .map( ( c ) => ( { schemaId: c.payload.schemaId, area: c.payload.area } ) )

        expect( actualSingle ).toEqual( expectedSequence )

        // After that come the selection-area calls (always 4 — about-selection + L1/L2/L3)
        const selectionCalls = calls.slice( expectedSequence.length )
        const selectionAreas = selectionCalls.map( ( c ) => c.payload.area )
        expect( selectionAreas ).toEqual( [ 'about-selection', 'selection-skills-L1', 'selection-skills-L2', 'selection-skills-L3' ] )
    } )

    test( '8) blocker for one member: marks blocked, continues, FLEET-006 warning', async () => {
        await prepareCase( { allStable: true } )
        const areas = [ 'single-test' ]
        const calls = []
        // Force blocker on member 3 (uniswap)
        const invoker = makeMockInvoker( { calls, blockerForSchemaId: 'uniswap' } )

        const result = await FleetRunner.run( {
            selectionPath: lockfilePath,
            areas,
            persona: null,
            iterations: 1,
            outputBase: gradingDataRoot,
            skillInvoker: invoker
        } )

        expect( result.singleGradings[ 2 ].status ).toBe( 'blocked' )
        expect( result.singleGradings[ 3 ].status ).toBe( 'ok' )
        const blockerErrors = result.errors
            .filter( ( e ) => e.code === 'FLEET-006' )
        expect( blockerErrors.length ).toBeGreaterThan( 0 )
        // overall status reflects at least one blocker
        expect( result.status ).toBe( 'fail' )
    } )

    test( 'neutral areas map persona to "neutral" regardless of supplied persona', async () => {
        await prepareCase( { allStable: true } )
        const calls = []
        const invoker = makeMockInvoker( { calls } )

        await FleetRunner.run( {
            selectionPath: lockfilePath,
            areas: [ 'single-test' ],
            persona: 'decision-maker--crypto-trader',
            iterations: 1,
            outputBase: gradingDataRoot,
            skillInvoker: invoker
        } )

        const singleTestCalls = calls
            .filter( ( c ) => c.payload.area === 'single-test' )
        singleTestCalls
            .forEach( ( c ) => {
                expect( c.payload.personaSlug ).toBe( 'neutral' )
            } )
    } )
} )


// Sanity: known areas lists (helps maintain the persona-application mapping)
describe( 'FleetRunner area constants', () => {
    test( 'neutral and persona area sets are disjoint and complete', () => {
        const overlap = NEUTRAL_AREAS
            .filter( ( a ) => PERSONA_AREAS.includes( a ) )
        expect( overlap.length ).toBe( 0 )
        expect( NEUTRAL_AREAS.length + PERSONA_AREAS.length ).toBe( 10 )
    } )
} )


// Additional coverage targeting selection-grading branches and edge paths
describe( 'FleetRunner.run — additional branches for coverage', () => {
    test( 'selection-grading: blocker on selection area marks status blocked', async () => {
        await prepareCase( { allStable: true } )
        const calls = []
        // Force blocker on first selection-area
        const invoker = makeMockInvoker( { calls, blockerForArea: 'about-selection' } )

        const result = await FleetRunner.run( {
            selectionPath: lockfilePath,
            areas: [ 'single-test' ],
            persona: 'decision-maker--crypto-trader',
            iterations: 1,
            outputBase: gradingDataRoot,
            skillInvoker: invoker
        } )

        expect( result.selectionGrading.status ).toBe( 'blocked' )
        expect( result.status ).toBe( 'fail' )
        const fleet006 = result.errors
            .filter( ( e ) => e.code === 'FLEET-006' )
        expect( fleet006.length ).toBeGreaterThan( 0 )
    } )

    test( 'skill-invoker that throws → FLEET-006 warning, member continues', async () => {
        await prepareCase( { allStable: true } )
        const calls = []
        let count = 0
        const invoker = async ( { skillName, payload } ) => {
            calls.push( { skillName, payload } )
            count = count + 1
            if( count === 1 ) {
                throw new Error( 'simulated skill-invoker network failure' )
            }
            return {
                gradingJson: { schemaId: payload.schemaId, area: payload.area, persona: payload.personaSlug },
                iteration: 1
            }
        }

        const result = await FleetRunner.run( {
            selectionPath: lockfilePath,
            areas: [ 'single-test' ],
            persona: null,
            iterations: 1,
            outputBase: gradingDataRoot,
            skillInvoker: invoker
        } )

        // first member throw → blocked, others proceed
        expect( result.singleGradings[ 0 ].status ).toBe( 'blocked' )
        expect( result.singleGradings[ 1 ].status ).toBe( 'ok' )
        const errs = result.errors
            .filter( ( e ) => e.code === 'FLEET-006' )
        expect( errs.length ).toBeGreaterThan( 0 )
    } )

    test( 'invoker returns non-object → FLEET-006 blocker', async () => {
        await prepareCase( { allStable: true } )
        const invoker = async () => 'not-an-object'

        const result = await FleetRunner.run( {
            selectionPath: lockfilePath,
            areas: [ 'single-test' ],
            persona: null,
            iterations: 1,
            outputBase: gradingDataRoot,
            skillInvoker: invoker
        } )

        expect( result.singleGradings[ 0 ].status ).toBe( 'blocked' )
        expect( result.status ).toBe( 'fail' )
    } )

    test( 'selection-grading invoker throws → FLEET-006', async () => {
        await prepareCase( { allStable: true } )
        const calls = []
        const invoker = async ( { skillName, payload } ) => {
            calls.push( { skillName, payload } )
            if( skillName.includes( 'selection-skills' ) || skillName.includes( 'about-selection' ) ) {
                throw new Error( 'selection skill failure' )
            }
            return {
                gradingJson: { schemaId: payload.schemaId, area: payload.area, persona: payload.personaSlug },
                iteration: 1
            }
        }

        const result = await FleetRunner.run( {
            selectionPath: lockfilePath,
            areas: [ 'single-test' ],
            persona: 'decision-maker--crypto-trader',
            iterations: 1,
            outputBase: gradingDataRoot,
            skillInvoker: invoker
        } )

        expect( result.selectionGrading.status ).toBe( 'blocked' )
        const errs = result.errors
            .filter( ( e ) => e.code === 'FLEET-006' )
        expect( errs.length ).toBeGreaterThan( 0 )
    } )

    test( 'selection-grading invoker returns non-object → FLEET-006', async () => {
        await prepareCase( { allStable: true } )
        const invoker = async ( { skillName, payload } ) => {
            if( skillName.includes( 'selection-skills' ) || skillName.includes( 'about-selection' ) ) {
                return null
            }
            return {
                gradingJson: { schemaId: payload.schemaId, area: payload.area },
                iteration: 1
            }
        }

        const result = await FleetRunner.run( {
            selectionPath: lockfilePath,
            areas: [ 'single-test' ],
            persona: 'decision-maker--crypto-trader',
            iterations: 1,
            outputBase: gradingDataRoot,
            skillInvoker: invoker
        } )

        expect( result.selectionGrading.status ).toBe( 'blocked' )
    } )

    test( 'lockfile not parsable → FLEET-002', async () => {
        gradingDataRoot = join( tempRoot, 'grading-data' )
        await mkdir( gradingDataRoot, { recursive: true } )
        const path = join( gradingDataRoot, 'selection', 'crypto-mini', 'selection.lock.json' )
        await mkdir( dirname( path ), { recursive: true } )
        await writeFile( path, 'this is not valid json {{{', 'utf-8' )
        const calls = []
        const invoker = makeMockInvoker( { calls } )

        await expect( FleetRunner.run( {
            selectionPath: path,
            areas: [ 'single-test' ],
            persona: null,
            iterations: 1,
            outputBase: gradingDataRoot,
            skillInvoker: invoker
        } ) ).rejects.toThrow( /FLEET-002/ )
    } )

    test( 'lockfile missing selectionId → FLEET-002', async () => {
        gradingDataRoot = join( tempRoot, 'grading-data' )
        await mkdir( gradingDataRoot, { recursive: true } )
        const path = join( gradingDataRoot, 'selection', 'crypto-mini', 'selection.lock.json' )
        await mkdir( dirname( path ), { recursive: true } )
        await writeFile( path, JSON.stringify( { members: [] } ), 'utf-8' )
        const calls = []
        const invoker = makeMockInvoker( { calls } )

        await expect( FleetRunner.run( {
            selectionPath: path,
            areas: [ 'single-test' ],
            persona: null,
            iterations: 1,
            outputBase: gradingDataRoot,
            skillInvoker: invoker
        } ) ).rejects.toThrow( /FLEET-002/ )
    } )

    test( 'lockfile empty members[] → FLEET-003', async () => {
        gradingDataRoot = join( tempRoot, 'grading-data' )
        await mkdir( gradingDataRoot, { recursive: true } )
        const path = join( gradingDataRoot, 'selection', 'crypto-mini', 'selection.lock.json' )
        await mkdir( dirname( path ), { recursive: true } )
        await writeFile( path, JSON.stringify( { selectionId: 'crypto-mini', members: [] } ), 'utf-8' )
        const calls = []
        const invoker = makeMockInvoker( { calls } )

        await expect( FleetRunner.run( {
            selectionPath: path,
            areas: [ 'single-test' ],
            persona: null,
            iterations: 1,
            outputBase: gradingDataRoot,
            skillInvoker: invoker
        } ) ).rejects.toThrow( /FLEET-003/ )
    } )

    test( 'unknown area → FLEET-001', async () => {
        await prepareCase( { allStable: true } )
        const calls = []
        const invoker = makeMockInvoker( { calls } )

        await expect( FleetRunner.run( {
            selectionPath: lockfilePath,
            areas: [ 'totally-unknown-area' ],
            persona: null,
            iterations: 1,
            outputBase: gradingDataRoot,
            skillInvoker: invoker
        } ) ).rejects.toThrow( /unknown area/ )
    } )

    test( 'invalid persona format → FLEET-001', async () => {
        await prepareCase( { allStable: true } )
        const calls = []
        const invoker = makeMockInvoker( { calls } )

        await expect( FleetRunner.run( {
            selectionPath: lockfilePath,
            areas: [ 'about-namespace' ],
            persona: 'invalid persona slug!!',
            iterations: 1,
            outputBase: gradingDataRoot,
            skillInvoker: invoker
        } ) ).rejects.toThrow( /FLEET-001/ )
    } )

    test( 'missing required fields → FLEET-001', async () => {
        await prepareCase( { allStable: true } )
        const calls = []
        const invoker = makeMockInvoker( { calls } )

        await expect( FleetRunner.run( {
            selectionPath: lockfilePath,
            areas: undefined,
            persona: null,
            iterations: 1,
            outputBase: gradingDataRoot,
            skillInvoker: invoker
        } ) ).rejects.toThrow( /FLEET-001/ )

        await expect( FleetRunner.run( {
            selectionPath: lockfilePath,
            areas: [ 'single-test' ],
            persona: 42,
            iterations: 1,
            outputBase: gradingDataRoot,
            skillInvoker: invoker
        } ) ).rejects.toThrow( /persona.*expected string or null/ )

        await expect( FleetRunner.run( {
            selectionPath: lockfilePath,
            areas: [],
            persona: null,
            iterations: 1,
            outputBase: gradingDataRoot,
            skillInvoker: invoker
        } ) ).rejects.toThrow( /areas\[\] must not be empty/ )

        await expect( FleetRunner.run( {
            selectionPath: lockfilePath,
            areas: [ 'single-test' ],
            persona: null,
            iterations: 'not-a-number',
            outputBase: gradingDataRoot,
            skillInvoker: invoker
        } ) ).rejects.toThrow( /FLEET-001/ )

        await expect( FleetRunner.run( {
            selectionPath: lockfilePath,
            areas: [ 'single-test' ],
            persona: null,
            iterations: 1.5,
            outputBase: gradingDataRoot,
            skillInvoker: invoker
        } ) ).rejects.toThrow( /FLEET-007/ )
    } )

    test( 'response with missing gradingJson → write-time throw caught and recorded', async () => {
        await prepareCase( { allStable: true } )
        const invoker = async () => ( { iteration: 1 } )

        // The write attempt throws because gradingJson is undefined.
        await expect( FleetRunner.run( {
            selectionPath: lockfilePath,
            areas: [ 'single-test' ],
            persona: null,
            iterations: 1,
            outputBase: gradingDataRoot,
            skillInvoker: invoker
        } ) ).rejects.toThrow( /gradingJson missing/ )
    } )
} )
