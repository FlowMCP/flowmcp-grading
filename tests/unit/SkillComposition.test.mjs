import { describe, test, expect } from '@jest/globals'

import { SkillComposition } from '../../src/SkillComposition.mjs'


const mk = ( { name, level, content } ) => ( { name, level, version: 'flowmcp/4.0.0', type: 'selection', content } )

// Valid family: L1 mentions both L2; the L3 is mentioned in one L2.
const validSkills = [
    mk( { name: 'l1-entry', level: 'L1', content: 'Topic areas: l2-trend and l2-compare.' } ),
    mk( { name: 'l2-trend', level: 'L2', content: 'Trend topic area. Leads to l3-daily-briefing.' } ),
    mk( { name: 'l2-compare', level: 'L2', content: 'Comparison topic area.' } ),
    mk( { name: 'l3-daily-briefing', level: 'L3', content: 'Daily depth routine.' } )
]


describe( 'SkillComposition.checkCrossReferences', () => {
    test( 'valid family passes both rules', () => {
        const r = SkillComposition.checkCrossReferences( { skills: validSkills } )
        expect( r.valid ).toBe( true )
        expect( r.ruleA ).toBe( true )
        expect( r.ruleB ).toBe( true )
        expect( r.errors ).toEqual( [] )
    } )

    test( 'Rule A fails when L1 does NOT mention every L2', () => {
        const skills = [
            mk( { name: 'l1-entry', level: 'L1', content: 'Topic areas: l2-trend.' } ), // misses l2-compare
            mk( { name: 'l2-trend', level: 'L2', content: 'Leads to l3-daily-briefing.' } ),
            mk( { name: 'l2-compare', level: 'L2', content: 'Comparison.' } ),
            mk( { name: 'l3-daily-briefing', level: 'L3', content: 'Routine.' } )
        ]
        const r = SkillComposition.checkCrossReferences( { skills } )
        expect( r.ruleA ).toBe( false )
        expect( r.valid ).toBe( false )
        expect( r.ruleAViolations[ 0 ].missingL2 ).toContain( 'l2-compare' )
        expect( r.errors.some( ( e ) => e.includes( 'SKC-002' ) ) ).toBe( true )
    } )

    test( 'Rule B fails when an L3 is not mentioned in any L2', () => {
        const skills = [
            mk( { name: 'l1-entry', level: 'L1', content: 'Topic areas: l2-trend and l2-compare.' } ),
            mk( { name: 'l2-trend', level: 'L2', content: 'Trend topic area.' } ), // no L3 mention
            mk( { name: 'l2-compare', level: 'L2', content: 'Comparison topic area.' } ),
            mk( { name: 'l3-daily-briefing', level: 'L3', content: 'Routine.' } )
        ]
        const r = SkillComposition.checkCrossReferences( { skills } )
        expect( r.ruleB ).toBe( false )
        expect( r.valid ).toBe( false )
        expect( r.ruleBViolations ).toContain( 'l3-daily-briefing' )
        expect( r.errors.some( ( e ) => e.includes( 'SKC-003' ) ) ).toBe( true )
    } )

    test( 'non-array input yields SKC-001', () => {
        const r = SkillComposition.checkCrossReferences( { skills: null } )
        expect( r.valid ).toBe( false )
        expect( r.errors[ 0 ] ).toContain( 'SKC-001' )
    } )
} )
