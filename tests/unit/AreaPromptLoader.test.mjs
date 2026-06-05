import { describe, test, expect } from '@jest/globals'

import { AreaPromptLoader, PROVIDER_AREAS, SELECTION_AREAS } from '../../src/AreaPromptLoader.mjs'


const samplePersona = {
    id: 'decision-maker--crypto-trader',
    basePersona: 'decision-maker',
    lens: 'crypto-trader'
}


describe( 'AreaPromptLoader.getPromptsRoot', () => {
    test( 'resolves the package-local prompts/ tree', () => {
        const { promptsRoot } = AreaPromptLoader.getPromptsRoot()

        expect( typeof promptsRoot ).toBe( 'string' )
        expect( promptsRoot.endsWith( 'prompts' ) ).toBe( true )
    } )
} )


describe( 'AreaPromptLoader.getAreasForFlow', () => {
    test( 'provider flow returns the 6 provider areas', () => {
        const { areas } = AreaPromptLoader.getAreasForFlow( { flow: 'provider' } )

        expect( areas ).toEqual( PROVIDER_AREAS )
        expect( areas.length ).toBe( 6 )
    } )


    test( 'selection flow returns the 4 question-bearing selection areas', () => {
        const { areas } = AreaPromptLoader.getAreasForFlow( { flow: 'selection' } )

        expect( areas ).toEqual( SELECTION_AREAS )
        expect( areas.includes( 'selection-aggregate' ) ).toBe( false )
    } )


    test( 'throws on an invalid flow (no silent default)', () => {
        expect( () => AreaPromptLoader.getAreasForFlow( { flow: 'bogus' } ) ).toThrow( /APL-004/ )
    } )
} )


describe( 'AreaPromptLoader.loadArea', () => {
    test( 'composes ONE prompt for a neutral area with the real prompts/ tree', async () => {
        const { promptsRoot } = AreaPromptLoader.getPromptsRoot()
        const result = await AreaPromptLoader.loadArea( { promptsRoot, area: 'single-test' } )

        expect( result.area ).toBe( 'single-test' )
        expect( typeof result.prompt ).toBe( 'string' )
        expect( result.prompt.length ).toBeGreaterThan( 100 )
        expect( result.questionCount ).toBeGreaterThan( 0 )
        expect( result.personaRequired ).toBe( false )
        // The composed prompt must contain the rendered question block, NOT just
        // a goal block — proving build() was used, not buildGoalBlock().
        expect( result.prompt.includes( '## Questions' ) ).toBe( true )
    } )


    test( 'composes a persona area when a valid persona is supplied', async () => {
        const { promptsRoot } = AreaPromptLoader.getPromptsRoot()
        const result = await AreaPromptLoader.loadArea( { promptsRoot, area: 'about-namespace', persona: samplePersona } )

        expect( result.area ).toBe( 'about-namespace' )
        expect( result.personaRequired ).toBe( true )
        expect( result.metadata.persona ).toBe( 'decision-maker--crypto-trader' )
        expect( result.prompt.includes( '## Questions' ) ).toBe( true )
    } )


    test( 'rejects a persona area when persona is missing (no silent skip)', async () => {
        const { promptsRoot } = AreaPromptLoader.getPromptsRoot()

        await expect(
            AreaPromptLoader.loadArea( { promptsRoot, area: 'about-namespace' } )
        ).rejects.toThrow( /PB-005/ )
    } )


    test( 'throws when promptsRoot points nowhere (no silent skip)', async () => {
        await expect(
            AreaPromptLoader.loadArea( { promptsRoot: '/nonexistent-prompts-root-xyz', area: 'single-test' } )
        ).rejects.toThrow( /APL-006/ )
    } )


    test( 'throws on an unknown area', async () => {
        const { promptsRoot } = AreaPromptLoader.getPromptsRoot()

        await expect(
            AreaPromptLoader.loadArea( { promptsRoot, area: 'not-an-area' } )
        ).rejects.toThrow( /APL-005/ )
    } )
} )


describe( 'AreaPromptLoader.loadAllAreas', () => {
    test( 'provider flow emits one composed prompt per provider area', async () => {
        const { promptsRoot } = AreaPromptLoader.getPromptsRoot()
        const { areas } = await AreaPromptLoader.loadAllAreas( { promptsRoot, flow: 'provider', persona: samplePersona } )

        expect( areas.length ).toBe( PROVIDER_AREAS.length )
        areas
            .forEach( ( entry ) => {
                expect( typeof entry.prompt ).toBe( 'string' )
                expect( entry.prompt.length ).toBeGreaterThan( 100 )
                expect( PROVIDER_AREAS.includes( entry.area ) ).toBe( true )
            } )
    } )


    test( 'selection flow emits one composed prompt per selection area', async () => {
        const { promptsRoot } = AreaPromptLoader.getPromptsRoot()
        const { areas } = await AreaPromptLoader.loadAllAreas( { promptsRoot, flow: 'selection', persona: samplePersona } )

        expect( areas.length ).toBe( SELECTION_AREAS.length )
    } )
} )


describe( 'AreaPromptLoader.loadArea — substitutions (PRD-3.2)', () => {
    const substitutions = {
        namespace: 'etherscan',
        toolName: 'getBalance',
        schemaName: 'etherscan',
        schemaPath: 'repos/flowmcp-schemas-private/schemas/v4.0.0/providers/etherscan/etherscan.mjs',
        responseFixturePath: '_grading/providers/etherscan/etherscan/summary.json'
    }

    test( 'fills NAME tokens + real file paths, leaving no torso', async () => {
        const { promptsRoot } = AreaPromptLoader.getPromptsRoot()
        const result = await AreaPromptLoader.loadArea( { promptsRoot, area: 'single-test', substitutions } )

        expect( result.prompt.includes( '{{NAMESPACE}}' ) ).toBe( false )
        expect( result.prompt.includes( '{{TOOL_NAME}}' ) ).toBe( false )
        expect( result.prompt.includes( '{{schemaPath}}' ) ).toBe( false )
        expect( result.prompt.includes( 'etherscan.getBalance' ) ).toBe( true )
        expect( result.prompt.includes( substitutions.schemaPath ) ).toBe( true )
        // the inline output schema (block token) is filled, not a dead ref
        expect( result.prompt.includes( '{{OUTPUT_SCHEMA_REF}}' ) ).toBe( false )
        expect( result.prompt.includes( 'Output schema (binding)' ) ).toBe( true )
    } )

    test( 'throws APL-010 when a referenced NAME token has no substitution value', async () => {
        const { promptsRoot } = AreaPromptLoader.getPromptsRoot()
        await expect(
            AreaPromptLoader.loadArea( { promptsRoot, area: 'single-test', substitutions: { namespace: 'etherscan', schemaPath: 'x.mjs', responseFixturePath: 'y.json' } } )
        ).rejects.toThrow( /APL-010/ )
    } )

    test( 'without substitutions the legacy placeholders are kept (back-compat)', async () => {
        const { promptsRoot } = AreaPromptLoader.getPromptsRoot()
        const result = await AreaPromptLoader.loadArea( { promptsRoot, area: 'single-test' } )
        expect( result.prompt.includes( '{{NAMESPACE}}' ) ).toBe( true )
    } )
} )
