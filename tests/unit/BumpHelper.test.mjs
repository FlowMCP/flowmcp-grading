import { describe, test, expect } from '@jest/globals'

import { BumpHelper } from '../../src/BumpHelper.mjs'


const baseSchema = () => {
    return {
        version: '4.0.0',
        schemaVersion: '1.0.0',
        namespace: 'test',
        name: 'demo',
        description: 'Fetches demo data from the service',
        tools: {
            getThing: {
                method: 'GET',
                path: '/thing',
                description: 'Fetch a thing by id',
                parameters: { id: { type: 'string', required: true } },
                output: { schema: { properties: { thingId: { type: 'string' } } } }
            }
        }
    }
}


describe( 'BumpHelper.diffSchemas', () => {
    test( 'identical schemas → bump: none', () => {
        const r = BumpHelper.diffSchemas( { oldSchema: baseSchema(), newSchema: baseSchema() } )
        expect( r.bump ).toBe( 'none' )
        expect( r.reasons ).toEqual( [] )
    } )

    test( 'tool renamed → bump: major', () => {
        const newSchema = baseSchema()
        delete newSchema.tools.getThing
        newSchema.tools.fetchThing = {
            method: 'GET', path: '/thing', description: 'Fetch a thing by id',
            parameters: { id: { type: 'string', required: true } },
            output: { schema: { properties: { thingId: { type: 'string' } } } }
        }
        const r = BumpHelper.diffSchemas( { oldSchema: baseSchema(), newSchema } )
        expect( r.bump ).toBe( 'major' )
        const has = r.reasons.some( ( reason ) => reason.category === 'tool-renamed' )
        expect( has ).toBe( true )
    } )

    test( 'added optional parameter → bump: minor', () => {
        const newSchema = baseSchema()
        newSchema.tools.getThing.parameters.limit = { type: 'number', required: false }
        const r = BumpHelper.diffSchemas( { oldSchema: baseSchema(), newSchema } )
        expect( r.bump ).toBe( 'minor' )
        const has = r.reasons.some( ( reason ) => reason.category === 'param-added-optional' )
        expect( has ).toBe( true )
    } )

    test( 'added required parameter → bump: major', () => {
        const newSchema = baseSchema()
        newSchema.tools.getThing.parameters.network = { type: 'string', required: true }
        const r = BumpHelper.diffSchemas( { oldSchema: baseSchema(), newSchema } )
        expect( r.bump ).toBe( 'major' )
        const has = r.reasons.some( ( reason ) => reason.category === 'param-added-required' )
        expect( has ).toBe( true )
    } )

    test( 'param renamed → bump: major', () => {
        const newSchema = baseSchema()
        delete newSchema.tools.getThing.parameters.id
        newSchema.tools.getThing.parameters.walletAddress = { type: 'string', required: true }
        const r = BumpHelper.diffSchemas( { oldSchema: baseSchema(), newSchema } )
        expect( r.bump ).toBe( 'major' )
        const has = r.reasons.some( ( reason ) => reason.category === 'param-renamed' )
        expect( has ).toBe( true )
    } )

    test( 'stylistic description change → bump: patch', () => {
        // Same long-words (>=4 chars), only word order/punctuation changes.
        const oldSchema = baseSchema()
        oldSchema.tools.getThing.description = 'Fetch thing user identifier swiftly'
        const newSchema = baseSchema()
        newSchema.tools.getThing.description = 'Fetch user identifier thing swiftly!'
        const r = BumpHelper.diffSchemas( { oldSchema, newSchema } )
        expect( r.bump ).toBe( 'patch' )
    } )

    test( 'semantic description change → bump: minor', () => {
        const newSchema = baseSchema()
        newSchema.tools.getThing.description = 'Fetch detailed transaction history for a thing identifier'
        const r = BumpHelper.diffSchemas( { oldSchema: baseSchema(), newSchema } )
        expect( r.bump ).toBe( 'minor' )
    } )

    test( 'output field added → bump: minor', () => {
        const newSchema = baseSchema()
        newSchema.tools.getThing.output.schema.properties.timestamp = { type: 'string' }
        const r = BumpHelper.diffSchemas( { oldSchema: baseSchema(), newSchema } )
        expect( r.bump ).toBe( 'minor' )
    } )

    test( 'output field removed → bump: major', () => {
        const newSchema = baseSchema()
        delete newSchema.tools.getThing.output.schema.properties.thingId
        const r = BumpHelper.diffSchemas( { oldSchema: baseSchema(), newSchema } )
        expect( r.bump ).toBe( 'major' )
    } )

    test( 'missing oldSchema yields BMP-001', () => {
        const r = BumpHelper.diffSchemas( { newSchema: baseSchema() } )
        expect( r.errors[ 0 ] ).toContain( 'BMP-001' )
    } )
} )


describe( 'BumpHelper.diffSelections', () => {
    test( 'added member → bump: minor', () => {
        const oldSel = { members: [ { schemaId: 'a' } ] }
        const newSel = { members: [ { schemaId: 'a' }, { schemaId: 'b' } ] }
        const r = BumpHelper.diffSelections( { oldSelection: oldSel, newSelection: newSel } )
        expect( r.bump ).toBe( 'minor' )
    } )

    test( 'removed member → bump: major', () => {
        const oldSel = { members: [ { schemaId: 'a' }, { schemaId: 'b' } ] }
        const newSel = { members: [ { schemaId: 'a' } ] }
        const r = BumpHelper.diffSelections( { oldSelection: oldSel, newSelection: newSel } )
        expect( r.bump ).toBe( 'major' )
    } )

    test( 'persona-list change → bump: major', () => {
        const oldSel = { members: [], personaIds: [ 'p1' ] }
        const newSel = { members: [], personaIds: [ 'p2' ] }
        const r = BumpHelper.diffSelections( { oldSelection: oldSel, newSelection: newSel } )
        expect( r.bump ).toBe( 'major' )
    } )
} )


describe( 'BumpHelper.checkVersionHashConsistency', () => {
    test( 'same version + same hash → no violation', () => {
        const r = BumpHelper.checkVersionHashConsistency( {
            snapshots: [
                { schemaVersion: '1.0.0', schemaHash: 'abcdef12' },
                { schemaVersion: '1.0.0', schemaHash: 'abcdef12' }
            ]
        } )
        expect( r.violations ).toEqual( [] )
    } )

    test( 'same version + different hashes → BMP-WARN-001', () => {
        const r = BumpHelper.checkVersionHashConsistency( {
            snapshots: [
                { schemaVersion: '1.0.0', schemaHash: 'aaaaaaaa' },
                { schemaVersion: '1.0.0', schemaHash: 'bbbbbbbb' }
            ]
        } )
        expect( r.violations.length ).toBe( 1 )
        expect( r.errors[ 0 ] ).toContain( 'BMP-WARN-001' )
    } )

    test( 'missing snapshots yields BMP-001', () => {
        const r = BumpHelper.checkVersionHashConsistency( {} )
        expect( r.errors[ 0 ] ).toContain( 'BMP-001' )
    } )
} )
