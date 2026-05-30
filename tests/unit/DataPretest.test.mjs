import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals'
import { mkdtemp, rm, readFile, mkdir, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'


// --- flowmcp/v2 mock ---------------------------------------------------------
// The mock is programmable per test via fetchQueue / resourceQueue. No network,
// no .env: every call pulls a canned result. fetch is also a jest.fn so tests
// can assert that stub primitives never reach the fetch layer.

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

jest.unstable_mockModule( 'flowmcp/v2', () => {
    return {
        FlowMCP: {
            fetch: fetchMock,
            executeResource: executeResourceMock,
            resolveSharedLists: async () => ( { sharedLists: {} } ),
            createHandlers: () => ( { handlerMap: {}, resourceHandlerMap: {} } )
        }
    }
} )


const { DataPretest } = await import( '../../src/DataPretest.mjs' )


// --- helpers -----------------------------------------------------------------

let tempRoot = null

const successFetch = ( { result } ) => {
    return { status: true, messages: [], dataAsString: JSON.stringify( { status: '1', result } ) }
}

const makeMainWithToolTests = ( { count } ) => {
    const tests = Array.from( { length: count } )
        .map( ( _entry, idx ) => ( { _description: `case ${idx}`, address: `0xabc${idx}` } ) )
    return {
        namespace: 'etherscan',
        requiredServerParams: [],
        tools: {
            getBalance: { description: 'get balance', tests }
        }
    }
}


beforeAll( async () => {
    tempRoot = await mkdtemp( join( tmpdir(), 'datapretest-' ) )
} )


afterAll( async () => {
    if( tempRoot !== null ) {
        await rm( tempRoot, { recursive: true, force: true } )
    }
} )


beforeEach( () => {
    fetchQueue = []
    resourceQueue = []
    fetchMock.mockClear()
    executeResourceMock.mockClear()
} )


describe( 'DataPretest.getVersion', () => {
    test( 'returns a version string', () => {
        const result = DataPretest.getVersion()
        expect( typeof result.version ).toBe( 'string' )
        expect( result.version.length ).toBeGreaterThan( 0 )
    } )
} )


describe( 'DataPretest typed-test extraction + happy path', () => {
    test( 'three working tool tests pass the abort rule and persist a payload', async () => {
        fetchQueue = [
            successFetch( { result: '284938' } ),
            successFetch( { result: '190021' } ),
            successFetch( { result: '77310' } )
        ]
        const main = makeMainWithToolTests( { count: 3 } )

        const out = await DataPretest.run( {
            namespace: 'etherscan',
            toolName: 'getBalance',
            main,
            gradingDataDir: tempRoot
        } )

        expect( out.ok ).toBe( true )
        expect( out.passedDownloadable ).toBe( 3 )
        expect( out.required ).toBe( 3 )
        expect( out.stopReason ).toBeNull()
        expect( out.errors ).toEqual( [] )
        expect( out.results ).toHaveLength( 3 )
        expect( out.results.every( ( r ) => r.primitive === 'tool' && r.working === true ) ).toBe( true )
        expect( out.payloadHash ).toMatch( /^[0-9a-f]{8}$/ )

        const raw = await readFile( out.payloadPath, 'utf-8' )
        const payload = JSON.parse( raw )
        expect( payload.namespace ).toBe( 'etherscan' )
        expect( payload.toolName ).toBe( 'getBalance' )
        expect( payload.ok ).toBe( true )
        expect( payload.passedDownloadable ).toBe( 3 )
        expect( payload.tests ).toHaveLength( 3 )
        expect( payload.payloadHash ).toBe( out.payloadHash )
        expect( out.payloadPath ).toContain( join( 'schemas', 'etherscan', 'data-pretest' ) )
        expect( out.payloadPath ).toContain( `getBalance--${out.payloadHash}.json` )
    } )
} )


describe( 'DataPretest abort rule', () => {
    test( 'fewer than minWorkingTests working tests -> ok:false with DPT-003', async () => {
        fetchQueue = [
            successFetch( { result: '284938' } ),
            successFetch( { result: '190021' } )
        ]
        const main = makeMainWithToolTests( { count: 2 } )

        const out = await DataPretest.run( {
            namespace: 'etherscan',
            toolName: 'getBalance',
            main,
            gradingDataDir: tempRoot
        } )

        expect( out.ok ).toBe( false )
        expect( out.passedDownloadable ).toBe( 2 )
        expect( out.stopReason ).toContain( 'fewer-than-3' )
        expect( out.errors.some( ( e ) => e.includes( 'DPT-003' ) ) ).toBe( true )
    } )

    test( 'custom minWorkingTests threshold is honoured', async () => {
        fetchQueue = [ successFetch( { result: '1' } ) ]
        const main = makeMainWithToolTests( { count: 1 } )

        const out = await DataPretest.run( {
            namespace: 'etherscan',
            toolName: 'getBalance',
            main,
            gradingDataDir: tempRoot,
            minWorkingTests: 1
        } )

        expect( out.ok ).toBe( true )
        expect( out.required ).toBe( 1 )
    } )
} )


describe( 'DataPretest HTTP-4xx / empty-data rules', () => {
    test( 'an HTTP-4xx style fetch (status:false) is NOT a pass', async () => {
        fetchQueue = [
            { status: false, messages: [ 'HTTP 401 Unauthorized' ], dataAsString: null },
            { status: false, messages: [ 'HTTP 403 Forbidden' ], dataAsString: null },
            { status: false, messages: [ 'HTTP 429 Too Many Requests' ], dataAsString: null }
        ]
        const main = makeMainWithToolTests( { count: 3 } )

        const out = await DataPretest.run( {
            namespace: 'etherscan',
            toolName: 'getBalance',
            main,
            gradingDataDir: tempRoot
        } )

        expect( out.ok ).toBe( false )
        expect( out.passedDownloadable ).toBe( 0 )
        expect( out.results.every( ( r ) => r.working === false ) ).toBe( true )
        expect( out.errors.some( ( e ) => e.includes( 'DPT-004' ) && e.includes( '401' ) ) ).toBe( true )
        expect( out.errors.some( ( e ) => e.includes( 'DPT-003' ) ) ).toBe( true )
    } )

    test( 'status:true but empty data does NOT count as working', async () => {
        fetchQueue = [
            { status: true, messages: [], dataAsString: '[]' },
            { status: true, messages: [], dataAsString: '' },
            { status: true, messages: [], dataAsString: '{}' }
        ]
        const main = makeMainWithToolTests( { count: 3 } )

        const out = await DataPretest.run( {
            namespace: 'etherscan',
            toolName: 'getBalance',
            main,
            gradingDataDir: tempRoot
        } )

        expect( out.ok ).toBe( false )
        expect( out.passedDownloadable ).toBe( 0 )
        expect( out.results.every( ( r ) => r.hasData === false ) ).toBe( true )
    } )

    test( 'missing required server parameter is reported as DPT-005', async () => {
        fetchQueue = [
            successFetch( { result: '1' } ),
            successFetch( { result: '2' } ),
            successFetch( { result: '3' } )
        ]
        const main = makeMainWithToolTests( { count: 3 } )
        main.requiredServerParams = [ 'ETHERSCAN_API_KEY' ]

        const out = await DataPretest.run( {
            namespace: 'etherscan',
            toolName: 'getBalance',
            main,
            gradingDataDir: tempRoot,
            serverParams: {}
        } )

        expect( out.errors.some( ( e ) => e.includes( 'DPT-005' ) && e.includes( 'ETHERSCAN_API_KEY' ) ) ).toBe( true )
    } )
} )


describe( 'DataPretest stub primitives', () => {
    test( 'skill / prompt / selection-member stubs never count toward the threshold', async () => {
        const main = {
            namespace: 'demo',
            requiredServerParams: [],
            skills: [ { name: 'skillA' }, { name: 'skillB' } ],
            prompts: [ { name: 'promptA', tests: [ {} ] } ],
            selection: { tools: [ 'demo.toolX' ], skills: [ { name: 'inlineSkill' } ] }
        }

        const out = await DataPretest.run( {
            namespace: 'demo',
            toolName: 'demoFamily',
            main,
            gradingDataDir: tempRoot
        } )

        expect( out.ok ).toBe( false )
        expect( out.passedDownloadable ).toBe( 0 )
        expect( out.results.length ).toBeGreaterThan( 0 )
        expect( out.results.every( ( r ) => r.working === false ) ).toBe( true )
        // Stub primitives must never reach the live fetch layer.
        expect( fetchMock ).not.toHaveBeenCalled()
        expect( executeResourceMock ).not.toHaveBeenCalled()
    } )
} )


describe( 'DataPretest namespace.json merge (no-overwrite)', () => {
    test( 'merges a dataPretest block into the matching member, preserving other fields', async () => {
        const nsDir = join( tempRoot, 'schemas', 'mergens' )
        await mkdir( nsDir, { recursive: true } )
        const indexBefore = {
            namespace: 'mergens',
            namespaceHash: 'deadbeef',
            aboutHash: 'PENDING',
            members: [
                { schemaId: 'mergens.getBalance', schemaVersion: '1.0.0', schemaHash: '9f8e7d6c' },
                { schemaId: 'mergens.other', schemaVersion: '1.0.0', schemaHash: '11112222' }
            ]
        }
        await writeFile( join( nsDir, 'namespace.json' ), JSON.stringify( indexBefore, null, 4 ) + '\n', 'utf-8' )

        fetchQueue = [
            successFetch( { result: '1' } ),
            successFetch( { result: '2' } ),
            successFetch( { result: '3' } )
        ]
        const main = makeMainWithToolTests( { count: 3 } )

        const out = await DataPretest.run( {
            namespace: 'mergens',
            toolName: 'getBalance',
            main,
            gradingDataDir: tempRoot
        } )
        expect( out.ok ).toBe( true )

        const raw = await readFile( join( nsDir, 'namespace.json' ), 'utf-8' )
        const indexAfter = JSON.parse( raw )

        // Top-level fields preserved.
        expect( indexAfter.namespaceHash ).toBe( 'deadbeef' )
        expect( indexAfter.aboutHash ).toBe( 'PENDING' )

        const matched = indexAfter.members.find( ( m ) => m.schemaId === 'mergens.getBalance' )
        expect( matched.schemaHash ).toBe( '9f8e7d6c' )
        expect( matched.schemaVersion ).toBe( '1.0.0' )
        expect( matched.dataPretest.ok ).toBe( true )
        expect( matched.dataPretest.passedDownloadable ).toBe( 3 )
        expect( matched.dataPretest.payloadHash ).toBe( out.payloadHash )
        expect( matched.dataPretest.payloadPath ).toBe( `schemas/mergens/data-pretest/getBalance--${out.payloadHash}.json` )
        expect( matched.dataPretest.payloadPath.startsWith( '/' ) ).toBe( false )

        // The non-matching member is untouched.
        const other = indexAfter.members.find( ( m ) => m.schemaId === 'mergens.other' )
        expect( other.dataPretest ).toBeUndefined()
        expect( other.schemaHash ).toBe( '11112222' )
    } )

    test( 'no namespace.json present -> payload still written, no crash', async () => {
        fetchQueue = [
            successFetch( { result: '1' } ),
            successFetch( { result: '2' } ),
            successFetch( { result: '3' } )
        ]
        const main = makeMainWithToolTests( { count: 3 } )

        const out = await DataPretest.run( {
            namespace: 'orphan',
            toolName: 'getBalance',
            main,
            gradingDataDir: tempRoot
        } )

        expect( out.ok ).toBe( true )
        const files = await readdir( join( tempRoot, 'schemas', 'orphan', 'data-pretest' ) )
        expect( files.length ).toBe( 1 )
    } )
} )


describe( 'DataPretest input validation', () => {
    test( 'missing toolName yields DPT-001', async () => {
        const out = await DataPretest.run( {
            namespace: 'x',
            main: { namespace: 'x' },
            gradingDataDir: tempRoot
        } )
        expect( out.ok ).toBe( false )
        expect( out.stopReason ).toBe( 'invalid-input' )
        expect( out.errors.some( ( e ) => e.includes( 'DPT-001' ) ) ).toBe( true )
    } )
} )
