import { describe, test, expect } from '@jest/globals'

import { AreaPromptLoader } from '../../src/AreaPromptLoader.mjs'


// Memo 141 — the persona-required Schema-Area wiring: the four persona NAME tokens
// ({{BASE_PERSONA_NAME/_FILE}}, {{LENS_NAME/_FILE}}), the package personas root, and
// the composition-time personaAreas allow-list that gates which persona-required
// areas actually compose (about-namespace corpus-wide, namespace-skills only when a
// skill exists). The technical Schema-Persona is schema-maintainer through the
// documentation-dx-reviewer lens.
const schemaPersona = {
    id: 'schema-maintainer--documentation-dx-reviewer',
    basePersona: 'schema-maintainer',
    lens: 'documentation-dx-reviewer'
}


// A complete substitution context covering both persona-required Schema-Areas.
const fullSubstitutions = {
    namespace: 'aave',
    schemaName: 'aave',
    toolName: 'getReserves, getMarkets',
    schemaPath: 'repos/flowmcp-schemas-private/schemas/v4.0.0/providers/aave/aave.mjs',
    responseFixturePath: 'x/summary.json',
    namespacePath: 'repos/flowmcp-schemas-private/schemas/v4.0.0/providers/aave/aave.mjs',
    aboutPath: 'repos/flowmcp-schemas-private/schemas/v4.0.0/providers/aave/resources/about/aave-about.md',
    domainKnowledgePath: 'repos/flowmcp-schemas-private/schemas/v4.0.0/providers/aave/resources/about/aave-about.md',
    skillName: 'lending-snapshot',
    skillPath: 'repos/flowmcp-schemas-private/schemas/v4.0.0/providers/aave/skills/lending-snapshot.mjs',
    basePersonaName: 'schema-maintainer',
    basePersonaFile: 'repos/flowmcp-spec/personas/schema-maintainer.md',
    lensName: 'documentation-dx-reviewer',
    lensFile: 'repos/flowmcp-grading/personas/documentation-dx-reviewer.md',
    personaPath: 'repos/flowmcp-spec/personas/schema-maintainer.md',
    lensPath: 'repos/flowmcp-grading/personas/documentation-dx-reviewer.md'
}


describe( 'AreaPromptLoader.getPersonasRoot (Memo 141)', () => {
    test( 'resolves the package-local personas/ tree', () => {
        const { personasRoot } = AreaPromptLoader.getPersonasRoot()

        expect( typeof personasRoot ).toBe( 'string' )
        expect( personasRoot.endsWith( 'personas' ) ).toBe( true )
    } )
} )


describe( 'AreaPromptLoader.loadArea — persona NAME tokens (Memo 141)', () => {
    test( 'about-namespace fills all four persona tokens — no torso survives', async () => {
        const { promptsRoot } = AreaPromptLoader.getPromptsRoot()
        const { prompt } = await AreaPromptLoader.loadArea( {
            promptsRoot, area: 'about-namespace', persona: schemaPersona, substitutions: fullSubstitutions
        } )

        expect( prompt.includes( '{{BASE_PERSONA_NAME}}' ) ).toBe( false )
        expect( prompt.includes( '{{BASE_PERSONA_FILE}}' ) ).toBe( false )
        expect( prompt.includes( '{{LENS_NAME}}' ) ).toBe( false )
        expect( prompt.includes( '{{LENS_FILE}}' ) ).toBe( false )
        expect( prompt.includes( 'schema-maintainer' ) ).toBe( true )
        expect( prompt.includes( 'documentation-dx-reviewer' ) ).toBe( true )
        expect( prompt.match( /\{\{[A-Za-z_]+\}\}/g ) ).toBe( null )
    } )


    test( 'throws APL-010 when a persona NAME token has no substitution value', async () => {
        const { promptsRoot } = AreaPromptLoader.getPromptsRoot()
        const missingLens = { ...fullSubstitutions, lensName: '' }

        await expect(
            AreaPromptLoader.loadArea( { promptsRoot, area: 'about-namespace', persona: schemaPersona, substitutions: missingLens } )
        ).rejects.toThrow( /APL-010/ )
    } )
} )


describe( 'AreaPromptLoader.loadAllAreas — personaAreas allow-list (Memo 141)', () => {
    test( 'about-namespace composes, namespace-skills defers when not allow-listed', async () => {
        const { promptsRoot } = AreaPromptLoader.getPromptsRoot()
        const { areas } = await AreaPromptLoader.loadAllAreas( {
            promptsRoot, flow: 'provider', persona: schemaPersona,
            personaAreas: [ 'about-namespace' ], substitutions: fullSubstitutions
        } )

        const about = areas.find( ( a ) => a.area === 'about-namespace' )
        const skills = areas.find( ( a ) => a.area === 'namespace-skills' )

        expect( about.deferred ).toBe( false )
        expect( typeof about.prompt ).toBe( 'string' )
        expect( skills.deferred ).toBe( true )
        expect( skills.prompt ).toBe( null )
    } )


    test( 'both persona areas compose when both are allow-listed', async () => {
        const { promptsRoot } = AreaPromptLoader.getPromptsRoot()
        const { areas } = await AreaPromptLoader.loadAllAreas( {
            promptsRoot, flow: 'provider', persona: schemaPersona,
            personaAreas: [ 'about-namespace', 'namespace-skills' ], substitutions: fullSubstitutions
        } )

        const about = areas.find( ( a ) => a.area === 'about-namespace' )
        const skills = areas.find( ( a ) => a.area === 'namespace-skills' )

        expect( about.deferred ).toBe( false )
        expect( skills.deferred ).toBe( false )
        expect( skills.prompt.includes( '{{SKILL_NAME}}' ) ).toBe( false )
        expect( skills.prompt.includes( 'lending-snapshot' ) ).toBe( true )
    } )


    test( 'a null personaAreas keeps every persona-required area composed (back-compat)', async () => {
        const { promptsRoot } = AreaPromptLoader.getPromptsRoot()
        const { areas } = await AreaPromptLoader.loadAllAreas( {
            promptsRoot, flow: 'provider', persona: schemaPersona, substitutions: fullSubstitutions
        } )

        const personaAreas = areas.filter( ( a ) => a.personaRequired === true )
        expect( personaAreas.every( ( a ) => a.deferred === false ) ).toBe( true )
    } )


    test( 'persona-required areas still defer when no persona is supplied (legacy Task-B path)', async () => {
        const { promptsRoot } = AreaPromptLoader.getPromptsRoot()
        const { areas } = await AreaPromptLoader.loadAllAreas( {
            promptsRoot, flow: 'provider', substitutions: fullSubstitutions
        } )

        const about = areas.find( ( a ) => a.area === 'about-namespace' )
        expect( about.deferred ).toBe( true )
    } )
} )
