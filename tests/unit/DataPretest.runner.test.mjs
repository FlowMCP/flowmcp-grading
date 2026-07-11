import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'


// --- flowmcp facade mock -----------------------------------------------------
// PRD-019 F20 — the CLI test-runner (getAllTestsTyped / executeTest /
// runTypedTests / limitOutput / computeDeclared / aggregateByPrimitive) is
// consolidated into DataPretest. This suite covers the PUBLIC runner surface the
// CLI grading bridge now drives: runTypedTests, computeDeclared, aggregateByPrimitive.
// The mock is programmable per test via fetchQueue / resourceQueue. No network,
// no .env. SkillValidator / SelectionValidator pass through to the real v4 modules.

let fetchQueue = []
let resourceQueue = []

const fetchMock = jest.fn( async () => {
    if( fetchQueue.length === 0 ) {
        return { status: false, messages: [ 'no canned fetch result' ], dataAsString: null }
    }
    return fetchQueue.shift()
} )

const executeResourceMock = jest.fn( async () => {
    if( resourceQueue.length === 0 ) {
        return { struct: { status: false, messages: [ 'no canned resource result' ], data: null } }
    }
    return resourceQueue.shift()
} )

const { SkillValidator, SelectionValidator } = await import( 'flowmcp/v4' )

jest.unstable_mockModule( 'flowmcp', () => {
    return {
        FlowMCP: {
            fetch: fetchMock,
            executeResource: executeResourceMock,
            resolveSharedLists: async () => ( { sharedLists: {} } ),
            createHandlers: () => ( { handlerMap: {}, resourceHandlerMap: {} } )
        },
        SkillValidator,
        SelectionValidator
    }
} )


const { DataPretest } = await import( '../../src/DataPretest.mjs' )


// --- helpers -----------------------------------------------------------------

const successFetch = ( { result } ) => {
    return { status: true, messages: [], dataAsString: JSON.stringify( { status: '1', result } ) }
}

const successResource = ( { result } ) => {
    return { struct: { status: true, messages: [], data: [ result ], dataAsString: null } }
}


beforeEach( () => {
    fetchQueue = []
    resourceQueue = []
    fetchMock.mockClear()
    executeResourceMock.mockClear()
} )


describe( 'DataPretest.runTypedTests — aggregation (F20 consolidated runner)', () => {
    test( 'collects typed results + builds byPrimitive summary (all PASS)', async () => {
        fetchQueue = [ successFetch( { result: '1' } ) ]
        resourceQueue = [ successResource( { result: 'r' } ) ]
        const main = {
            namespace: 'agg/ns',
            tools: { getOne: { tests: [ { _description: 't1', id: '1' } ] } },
            resources: { db1: { queries: { searchA: { tests: [ { _description: 'r1', q: 'x' } ] } } } },
            skills: [ { name: 'sk', version: 'flowmcp/4.0.0', whenToUse: 'when testing', type: 'namespace', description: 'd', content: 'hello', output: 'o', tests: [ { _description: 'sk-t' } ] } ],
            prompts: [ { name: 'pr', tests: [ { _description: 'pr-t' } ] } ]
        }

        const { results, summary } = await DataPretest.runTypedTests( { main } )

        expect( results.length ).toBe( 4 )
        expect( summary.overall ).toBe( 'PASS' )
        expect( summary.byPrimitive.tool ).toEqual( { pass: 1, fail: 0 } )
        expect( summary.byPrimitive.resource ).toEqual( { pass: 1, fail: 0 } )
        expect( summary.byPrimitive.skill ).toEqual( { pass: 1, fail: 0 } )
        expect( summary.byPrimitive.prompt ).toEqual( { pass: 1, fail: 0 } )
    } )


    test( 'overall=FAIL when any single test fails', async () => {
        // getOne pulls the one canned success; shouldFail hits the empty queue -> false.
        fetchQueue = [ successFetch( { result: '1' } ) ]
        const main = {
            namespace: 'agg/ns',
            tools: {
                getOne: { tests: [ { _description: 't1' } ] },
                shouldFail: { tests: [ { _description: 'will fail' } ] }
            }
        }

        const { results, summary } = await DataPretest.runTypedTests( { main } )

        expect( results.length ).toBe( 2 )
        expect( summary.overall ).toBe( 'FAIL' )
        expect( summary.byPrimitive.tool ).toEqual( { pass: 1, fail: 1 } )
    } )


    test( 'each result entry carries primitive + name + schemaRef from the typed test', async () => {
        fetchQueue = [ successFetch( { result: '1' } ) ]
        const main = { namespace: 'agg/ns', tools: { getOne: { tests: [ { _description: 't' } ] } } }

        const { results } = await DataPretest.runTypedTests( { main } )

        const r = results[ 0 ]
        expect( r.primitive ).toBe( 'tool' )
        expect( r.name ).toBe( 'getOne' )
        expect( r.schemaRef ).toBe( 'agg/ns' )
    } )


    test( 'empty main produces zero results, overall PASS, empty byPrimitive', async () => {
        const { results, summary } = await DataPretest.runTypedTests( { main: { namespace: 'empty/ns' } } )

        expect( results.length ).toBe( 0 )
        expect( summary.overall ).toBe( 'PASS' )
        expect( summary.byPrimitive ).toEqual( {} )
    } )
} )


describe( 'DataPretest.runTypedTests — v4 primitive extraction (5 primitives)', () => {
    test( 'runs one entry per declared test across tools/resources/skills/prompts', async () => {
        fetchQueue = [ successFetch( { result: 'a' } ) ]
        resourceQueue = [
            successResource( { result: 'b' } ),
            successResource( { result: 'c' } ),
            successResource( { result: 'd' } ),
            successResource( { result: 'e' } )
        ]
        const main = {
            namespace: 'frictiontest',
            tools: { getThing: { tests: [ { _description: 't1', id: '42' } ] } },
            resources: {
                db1: {
                    queries: {
                        searchA: { tests: [ { _description: 'r1', q: 'x' }, { _description: 'r2', q: 'y' } ] },
                        searchB: { tests: [ { _description: 'r3', q: 'z' }, { _description: 'r4', q: 'w' } ] }
                    }
                }
            },
            skills: [ { name: 'analyze', content: 'Analyze', tests: [ { _description: 'skill-t1' } ] } ],
            prompts: [ { name: 'p1', tests: [ { _description: 'p-test', topic: 'A' } ] } ]
        }

        const { results } = await DataPretest.runTypedTests( { main } )

        // 1 tool + 4 resource (2+2) + 1 skill + 1 prompt = 7
        expect( results.length ).toBe( 7 )
        expect( results.filter( ( r ) => r.primitive === 'tool' ).length ).toBe( 1 )
        expect( results.filter( ( r ) => r.primitive === 'resource' ).length ).toBe( 4 )
        expect( results.filter( ( r ) => r.primitive === 'skill' ).length ).toBe( 1 )
        expect( results.filter( ( r ) => r.primitive === 'prompt' ).length ).toBe( 1 )

        const toolEntry = results.find( ( r ) => r.primitive === 'tool' )
        expect( toolEntry.name ).toBe( 'getThing' )
        expect( toolEntry.schemaRef ).toBe( 'frictiontest' )

        const resEntry = results.find( ( r ) => r.primitive === 'resource' )
        expect( resEntry.name ).toBe( 'db1.searchA' )
    } )


    test( 'auto-generates one implicit structural test for a skill without explicit tests', async () => {
        const main = { namespace: 'frictiontest', skills: [ { name: 'demo', content: 'Demo skill' } ] }

        const { results } = await DataPretest.runTypedTests( { main } )

        expect( results.length ).toBe( 1 )
        expect( results[ 0 ].primitive ).toBe( 'skill' )
        expect( results[ 0 ].name ).toBe( 'demo' )
    } )


    test( 'extracts selection-member + inline-skill entries from a selection file', async () => {
        const main = {
            namespace: 'frictiontest/sel',
            selection: {
                tools: [ 'frictiontest/tool/getThing' ],
                resources: [ 'frictiontest/resource/db1.searchA' ],
                prompts: [],
                skills: [
                    { name: 'analyze-inline', content: '...' },
                    { name: 'second-inline', content: '...', tests: [ { _description: 'inline-t' } ] }
                ]
            }
        }

        const { results } = await DataPretest.runTypedTests( { main } )

        const selectionMembers = results.filter( ( r ) => r.primitive === 'selection-member' )
        const inlineSkills = results.filter( ( r ) => r.primitive === 'skill' )
        expect( selectionMembers.length ).toBe( 2 )
        expect( inlineSkills.length ).toBe( 2 )
        expect( selectionMembers.some( ( r ) => r.name === 'frictiontest/tool/getThing' ) ).toBe( true )
    } )
} )


describe( 'DataPretest.runTypedTests — output capture (preview vs full)', () => {
    const bigResult = 'x'.repeat( 500 )
    const makeMain = () => ( { namespace: 'test/ns', tools: { getThing: { tests: [ { _description: 'big', big: 'v' } ] } } } )

    test( 'truncates output to a 200-char preview by default', async () => {
        fetchQueue = [ successFetch( { result: bigResult } ) ]
        const { results } = await DataPretest.runTypedTests( { main: makeMain() } )
        expect( results[ 0 ].output.length ).toBe( 200 )
    } )


    test( 'returns full untruncated output when fullOutput=true', async () => {
        fetchQueue = [ successFetch( { result: bigResult } ) ]
        const { results } = await DataPretest.runTypedTests( { main: makeMain(), fullOutput: true } )
        expect( results[ 0 ].output.length ).toBeGreaterThan( 200 )
        expect( results[ 0 ].output ).toContain( bigResult )
    } )
} )


// PRD-019 F20 — one executor, ONE semantics: an HTTP 4xx is never a PASS,
// an HTTP 200 with empty data is never a working download, only HTTP 200 + real data
// passes. The runner reports status per fetch; the working/hasData gate lives in run().
describe( 'DataPretest F20 pass semantics (4xx never PASS, empty never PASS, data PASSES)', () => {
    test( 'HTTP 400 in the runner is a FAIL (status:false -> overall FAIL)', async () => {
        fetchQueue = [ { status: false, messages: [ 'HTTP 400: Bad Request' ], dataAsString: null } ]
        const main = { namespace: 'x/ns', tools: { t: { tests: [ { _description: 'a' } ] } } }

        const { results, summary } = await DataPretest.runTypedTests( { main } )

        expect( results[ 0 ].status ).toBe( false )
        expect( summary.overall ).toBe( 'FAIL' )
    } )


    test( 'HTTP 200 with real data PASSES the runner', async () => {
        fetchQueue = [ successFetch( { result: 'real-data' } ) ]
        const main = { namespace: 'x/ns', tools: { t: { tests: [ { _description: 'a' } ] } } }

        const { summary } = await DataPretest.runTypedTests( { main } )

        expect( summary.overall ).toBe( 'PASS' )
    } )


    test( 'the gate (DataPretest.run) treats HTTP 200 + empty data as FAIL (not working)', async () => {
        // The runner reports status:true for a 200; the working/hasData gate lives in run().
        // 200 + empty body is NOT a working download -> below bar -> ok:false.
        fetchQueue = [
            { status: true, messages: [], dataAsString: '[]' },
            { status: true, messages: [], dataAsString: '{}' }
        ]
        const main = { namespace: 'x', requiredServerParams: [], tools: { t: { tests: [ { _description: 'a' }, { _description: 'b' } ] } } }
        const tempRoot = await mkdtemp( join( tmpdir(), 'dpt-runner-' ) )

        const out = await DataPretest.run( { namespace: 'x', toolName: 't', main, gradingDataDir: tempRoot } )

        expect( out.ok ).toBe( false )
        expect( out.passedDownloadable ).toBe( 0 )
        expect( out.results.every( ( r ) => r.hasData === false ) ).toBe( true )

        await rm( tempRoot, { recursive: true, force: true } )
    } )
} )


describe( 'DataPretest.computeDeclared (PRD-006)', () => {
    test( 'detects tools as declared when present (even if empty object)', () => {
        const { declared } = DataPretest.computeDeclared( { main: { tools: {} } } )
        expect( declared.tool ).toBe( true )
        expect( declared.resource ).toBe( false )
        expect( declared.skill ).toBe( false )
        expect( declared.prompt ).toBe( false )
        expect( declared[ 'selection-member' ] ).toBe( false )
    } )


    test( 'accepts legacy "routes" key for tools', () => {
        const { declared } = DataPretest.computeDeclared( { main: { routes: {} } } )
        expect( declared.tool ).toBe( true )
    } )


    test( 'detects all primitives when all declared', () => {
        const { declared } = DataPretest.computeDeclared( {
            main: { tools: {}, resources: {}, skills: [], prompts: [], selection: {} }
        } )
        expect( declared.tool ).toBe( true )
        expect( declared.resource ).toBe( true )
        expect( declared.skill ).toBe( true )
        expect( declared.prompt ).toBe( true )
        expect( declared[ 'selection-member' ] ).toBe( true )
    } )


    test( 'handles undefined main gracefully', () => {
        const { declared } = DataPretest.computeDeclared( { main: undefined } )
        expect( declared.tool ).toBe( false )
        expect( declared.resource ).toBe( false )
    } )
} )


describe( 'DataPretest.aggregateByPrimitive (PRD-006)', () => {
    test( 'aggregates pass/fail per primitive', () => {
        const results = [
            { primitive: 'tool', status: true },
            { primitive: 'tool', status: true },
            { primitive: 'resource', status: true },
            { primitive: 'resource', status: false }
        ]
        const declared = { tool: true, resource: true, skill: false, prompt: false, 'selection-member': false }

        const { summary } = DataPretest.aggregateByPrimitive( { results, declared, filter: null } )

        expect( summary.tool.passed ).toBe( 2 )
        expect( summary.tool.total ).toBe( 2 )
        expect( summary.tool.declared ).toBe( true )
        expect( summary.tool.filtered ).toBe( false )
        expect( summary.resource.passed ).toBe( 1 )
        expect( summary.resource.total ).toBe( 2 )
    } )


    test( 'marks non-matching primitives as filtered when filter is set', () => {
        const declared = { tool: true, resource: true, skill: false, prompt: false, 'selection-member': false }

        const { summary } = DataPretest.aggregateByPrimitive( { results: [], declared, filter: [ 'tool' ] } )

        expect( summary.tool.filtered ).toBe( false )
        expect( summary.resource.filtered ).toBe( true )
        expect( summary.skill.filtered ).toBe( true )
    } )


    test( 'distinguishes "not declared" from "declared empty"', () => {
        const declared = { tool: true, resource: false, skill: false, prompt: false, 'selection-member': false }

        const { summary } = DataPretest.aggregateByPrimitive( { results: [], declared, filter: null } )

        expect( summary.tool.declared ).toBe( true )
        expect( summary.tool.total ).toBe( 0 )
        expect( summary.resource.declared ).toBe( false )
    } )


    test( 'handles undefined results without crashing', () => {
        const { summary } = DataPretest.aggregateByPrimitive( { results: undefined, declared: undefined, filter: null } )

        expect( summary.tool.total ).toBe( 0 )
        expect( summary.tool.declared ).toBe( false )
    } )
} )
