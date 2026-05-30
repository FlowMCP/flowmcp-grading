/**
 * SkillComposition — cross-reference rules for Selection-Skills (L1/L2/L3).
 *
 * Model (selection skill family, top-down navigation):
 *   - L1 is the signpost ("Wegweiser"): explains the selection in general and
 *     MUST reference every L2 topic area.
 *   - L2 are the topic areas.
 *   - L3 are in-depth application use cases; every L3 MUST be assigned to
 *     (mentioned in) at least one L2 topic area.
 *
 * Note: the FlowMCP Schemas Spec v4.1.0 skill object has no `level` field; the
 * L1/L2/L3 level is carried here as an additive field for selection-skill
 * grading. The "L1 atomic" wording in the grading spec refers to a different
 * model; this module implements the signpost/topic/depth model.
 *
 * Error codes: SKC-001 (bad input), SKC-002 (L1 misses an L2),
 * SKC-003 (L3 not assigned to any L2).
 */

const LEVELS = [ 'L1', 'L2', 'L3' ]

class SkillComposition {
    static getRules() {
        return {
            rules: [
                'A: every L1 skill mentions every L2 skill by name',
                'B: every L3 skill is mentioned in at least one L2 skill'
            ]
        }
    }


    static checkCrossReferences( { skills } ) {
        if( Array.isArray( skills ) === false ) {
            return { valid: false, ruleA: null, ruleB: null, ruleAViolations: [], ruleBViolations: [], errors: [ 'SKC-001: skills must be an array' ] }
        }

        const text = ( skill ) => [ skill.content, skill.description, skill.whenToUse ]
            .filter( ( part ) => typeof part === 'string' )
            .join( '\n' )

        const atLevel = ( level ) => skills.filter( ( skill ) => skill.level === level )
        const l1 = atLevel( 'L1' )
        const l2 = atLevel( 'L2' )
        const l3 = atLevel( 'L3' )
        const l2Names = l2.map( ( skill ) => skill.name )
        const l3Names = l3.map( ( skill ) => skill.name )

        // Rule A — every L1 mentions every L2 name.
        const ruleAViolations = l1
            .map( ( skill ) => {
                const body = text( skill )
                const missingL2 = l2Names.filter( ( name ) => body.includes( name ) === false )
                return { l1: skill.name, missingL2 }
            } )
            .filter( ( entry ) => entry.missingL2.length > 0 )

        // Rule B — every L3 name appears in at least one L2 body.
        const l2Body = l2.map( ( skill ) => text( skill ) ).join( '\n' )
        const ruleBViolations = l3Names
            .filter( ( name ) => l2Body.includes( name ) === false )

        const errors = []
        if( ruleAViolations.length > 0 ) {
            errors.push( `SKC-002: L1 must mention all L2 skills; violations: ${JSON.stringify( ruleAViolations )}` )
        }
        if( ruleBViolations.length > 0 ) {
            errors.push( `SKC-003: each L3 must be mentioned in at least one L2; unassigned L3: ${ruleBViolations.join( ', ' )}` )
        }

        const ruleA = ruleAViolations.length === 0
        const ruleB = ruleBViolations.length === 0
        return { valid: ruleA && ruleB, ruleA, ruleB, ruleAViolations, ruleBViolations, errors }
    }
}

export { SkillComposition, LEVELS }
