import { describe, test, expect } from '@jest/globals'

import { ImprovementLoop } from '../../src/harness/ImprovementLoop.mjs'


const areas = [
    { id: 'single-test:toolA', level: 'tool' },
    { id: 'tools-aggregate-schema', level: 'schema' },
    { id: 'tools-aggregate-namespace', level: 'provider' }
]


// A mutable score table + an improveFn that raises the improved area by `step`,
// capped at `cap`. Lets each stop condition be exercised deterministically.
const makeWorld = ( { initial, step, cap } ) => {
    const scores = Object.assign( {}, initial )
    const scoreFn = async ( { area } ) => { return scores[ area.id ] }
    const improveFn = async ( { area } ) => {
        const next = Math.min( cap, scores[ area.id ] + step )
        const applied = next > scores[ area.id ]
        scores[ area.id ] = next
        return { applied, hints: [ `raise ${area.id}` ] }
    }
    return { scores, scoreFn, improveFn }
}


describe( 'ImprovementLoop floor selection', () => {
    test( 'picks the lowest score; ties broken tool < schema < provider', async () => {
        const world = makeWorld( { initial: { 'single-test:toolA': 2.0, 'tools-aggregate-schema': 2.0, 'tools-aggregate-namespace': 4.0 }, step: 0, cap: 5 } )
        const result = await ImprovementLoop.run( {
            areas, scoreFn: world.scoreFn, improveFn: world.improveFn,
            maxRounds: 1, tokenBudget: null, spentFn: () => 0, plateau: { rounds: 99, epsilon: 0 }
        } )
        expect( result.history[ 0 ].floorArea ).toBe( 'single-test:toolA' )
    } )
} )


describe( 'ImprovementLoop stop conditions', () => {
    test( 'round-limit stops even while still improving', async () => {
        const world = makeWorld( { initial: { 'single-test:toolA': 1.0, 'tools-aggregate-schema': 5.0, 'tools-aggregate-namespace': 5.0 }, step: 0.5, cap: 5 } )
        const result = await ImprovementLoop.run( {
            areas, scoreFn: world.scoreFn, improveFn: world.improveFn,
            maxRounds: 3, tokenBudget: null, spentFn: () => 0, plateau: { rounds: 99, epsilon: 0 }
        } )
        expect( result.stopReason ).toBe( 'round-limit' )
        expect( result.rounds ).toBe( 3 )
        // measurable improvement: the floor rose across the rounds
        expect( result.finalScores[ 'single-test:toolA' ] ).toBeGreaterThan( 1.0 )
    } )

    test( 'token-budget stops the loop', async () => {
        const world = makeWorld( { initial: { 'single-test:toolA': 1.0, 'tools-aggregate-schema': 5.0, 'tools-aggregate-namespace': 5.0 }, step: 0.5, cap: 5 } )
        let spent = 0
        const spentFn = () => { return spent }
        const improveFn = async ( { area } ) => {
            spent = spent + 60
            const r = await world.improveFn( { area } )
            return r
        }
        const result = await ImprovementLoop.run( {
            areas, scoreFn: world.scoreFn, improveFn,
            maxRounds: 100, tokenBudget: 100, spentFn, plateau: { rounds: 99, epsilon: 0 }
        } )
        expect( result.stopReason ).toBe( 'token-budget' )
    } )

    test( 'plateau stops when the floor stops improving', async () => {
        // step 0 -> no improvement ever -> plateau fires after the window
        const world = makeWorld( { initial: { 'single-test:toolA': 2.0, 'tools-aggregate-schema': 5.0, 'tools-aggregate-namespace': 5.0 }, step: 0, cap: 5 } )
        const result = await ImprovementLoop.run( {
            areas, scoreFn: world.scoreFn, improveFn: world.improveFn,
            maxRounds: 100, tokenBudget: null, spentFn: () => 0, plateau: { rounds: 2, epsilon: 0.01 }
        } )
        expect( result.stopReason ).toBe( 'plateau' )
        expect( result.rounds ).toBeLessThan( 100 )
    } )
} )


describe( 'ImprovementLoop validation', () => {
    test( 'rejects maxRounds < 1', async () => {
        const world = makeWorld( { initial: { 'single-test:toolA': 1 }, step: 0, cap: 5 } )
        const result = await ImprovementLoop.run( {
            areas: [ { id: 'single-test:toolA', level: 'tool' } ],
            scoreFn: world.scoreFn, improveFn: world.improveFn,
            maxRounds: 0, tokenBudget: null, spentFn: () => 0, plateau: { rounds: 1, epsilon: 0 }
        } )
        expect( result.stopReason ).toBe( 'invalid-input' )
        expect( result.errors.some( ( m ) => m.startsWith( 'LOOP-002' ) ) ).toBe( true )
    } )

    test( 'requires spentFn when tokenBudget is set', async () => {
        const world = makeWorld( { initial: { 'single-test:toolA': 1 }, step: 0, cap: 5 } )
        const result = await ImprovementLoop.run( {
            areas: [ { id: 'single-test:toolA', level: 'tool' } ],
            scoreFn: world.scoreFn, improveFn: world.improveFn,
            maxRounds: 5, tokenBudget: 100, spentFn: null, plateau: { rounds: 1, epsilon: 0 }
        } )
        expect( result.stopReason ).toBe( 'invalid-input' )
        expect( result.errors.some( ( m ) => m.startsWith( 'LOOP-003' ) ) ).toBe( true )
    } )
} )
