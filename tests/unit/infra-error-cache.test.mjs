import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'


// An infrastructure error (sqlite bindings, TLS, network) is local and transient,
// not the API's verdict. Persisting it would turn a fixable environment problem into
// a sticky cached FAIL that survives the fix. #persist must drop infra-failed results;
// a real HTTP status (4xx/5xx) is the API answering and must still be persisted.

let fetchQueue = []

const fetchMock = jest.fn( async () => {
    if( fetchQueue.length === 0 ) {
        return { status: false, messages: [ 'no canned fetch result' ], dataAsString: null }
    }
    return fetchQueue.shift()
} )

const { SkillValidator, SelectionValidator } = await import( 'flowmcp/v4' )

jest.unstable_mockModule( 'flowmcp', () => {
    return {
        FlowMCP: {
            fetch: fetchMock,
            executeResource: async () => ( { struct: { status: false, messages: [], data: null } } ),
            resolveSharedLists: async () => ( { sharedLists: {} } ),
            createHandlers: () => ( { handlerMap: {}, resourceHandlerMap: {} } )
        },
        SkillValidator,
        SelectionValidator
    }
} )

const { DataPretest } = await import( '../../src/DataPretest.mjs' )


let tempRoot = null

beforeEach( async () => {
    tempRoot = await mkdtemp( join( tmpdir(), 'infra-cache-' ) )
} )

afterEach( async () => {
    await rm( tempRoot, { recursive: true, force: true } )
    fetchQueue = []
} )


const infraFail = () => ( { status: false, messages: [ 'No response received from server.', 'Network error: fetch failed' ], dataAsString: null } )
const httpFail = () => ( { status: false, messages: [ 'HTTP 500: Internal Server Error' ], dataAsString: null } )

const mainWithTests = ( { count } ) => {
    const tests = Array.from( { length: count } )
        .map( ( _entry, idx ) => ( { _description: `case ${idx}`, address: `0xabc${idx}` } ) )
    return {
        namespace: 'etherscan',
        requiredServerParams: [],
        tools: { getBalance: { description: 'get balance', tests } }
    }
}


describe( 'DataPretest — infrastructure errors are not cached', () => {
    test( 'an infra-failed tool persists NO test-N.json (cache-miss next run)', async () => {
        fetchQueue = [ infraFail(), infraFail() ]

        const out = await DataPretest.run( { namespace: 'etherscan', toolName: 'getBalance', main: mainWithTests( { count: 2 } ), gradingDataDir: tempRoot } )

        expect( out.ok ).toBe( false )
        // summary.json reflects this run, but NO per-test cache file was written.
        expect( existsSync( out.summaryPath ) ).toBe( true )
        const testsDir = join( out.schemaDir, 'tools', 'getBalance', 'tests' )
        const files = existsSync( testsDir ) ? await readdir( testsDir ) : []
        const testFiles = files.filter( ( name ) => name.startsWith( 'test-' ) )
        expect( testFiles ).toEqual( [] )
    } )

    test( 'a real HTTP failure (5xx) IS persisted — it is the API verdict, not infra', async () => {
        fetchQueue = [ httpFail(), httpFail() ]

        const out = await DataPretest.run( { namespace: 'etherscan', toolName: 'getBalance', main: mainWithTests( { count: 2 } ), gradingDataDir: tempRoot } )

        const testsDir = join( out.schemaDir, 'tools', 'getBalance', 'tests' )
        const files = existsSync( testsDir ) ? await readdir( testsDir ) : []
        const testFiles = files.filter( ( name ) => name.startsWith( 'test-' ) )
        expect( testFiles.length ).toBeGreaterThan( 0 )
    } )
} )
