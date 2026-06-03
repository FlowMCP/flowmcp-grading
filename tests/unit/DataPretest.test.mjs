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
        // Test-Leiter pass bar is 2 (Memo 101); 3 working clears it as the ideal rung.
        expect( out.required ).toBe( 2 )
        expect( out.stopReason ).toBeNull()
        expect( out.errors ).toEqual( [] )
        expect( out.results ).toHaveLength( 3 )
        expect( out.results.every( ( r ) => r.primitive === 'tool' && r.working === true ) ).toBe( true )
        expect( out.perTool.getBalance ).toEqual( { working: 3, total: 3, level: 'data-analyzable' } )

        // summary.json — human-readable, no opaque hash
        const summary = JSON.parse( await readFile( out.summaryPath, 'utf-8' ) )
        expect( summary.namespace ).toBe( 'etherscan' )
        expect( summary.schemaFile ).toBe( 'getBalance' )
        expect( summary.ok ).toBe( true )
        expect( summary.perTool.getBalance ).toEqual( { working: 3, total: 3, level: 'data-analyzable' } )
        expect( out.summaryPath ).toContain( join( 'providers', 'etherscan', 'getBalance', 'summary.json' ) )

        // per-test files: numbered + self-describing (real response + HTTP status,
        // NO request — F26 forbids persisting interpolated {{KEY}} server params)
        const t1 = JSON.parse( await readFile( join( out.schemaDir, 'tools', 'getBalance', 'tests', 'test-1.json' ), 'utf-8' ) )
        expect( t1.test ).toBe( 1 )
        expect( t1.tool ).toBe( 'getBalance' )
        expect( t1.status ).toBe( true )
        expect( t1.working ).toBe( true )
        expect( Object.prototype.hasOwnProperty.call( t1, 'request' ) ).toBe( false )
        expect( t1.response ).not.toBeNull()
        const t3 = JSON.parse( await readFile( join( out.schemaDir, 'tools', 'getBalance', 'tests', 'test-3.json' ), 'utf-8' ) )
        expect( t3.test ).toBe( 3 )
    } )
} )


describe( 'DataPretest abort rule', () => {
    test( 'one working test (below the bar of 2) -> ok:false with DPT-003, not green', async () => {
        fetchQueue = [
            successFetch( { result: '284938' } )
        ]
        const main = makeMainWithToolTests( { count: 1 } )

        const out = await DataPretest.run( {
            namespace: 'etherscan',
            toolName: 'getBalance',
            main,
            gradingDataDir: tempRoot
        } )

        expect( out.ok ).toBe( false )
        expect( out.passedDownloadable ).toBe( 1 )
        expect( out.required ).toBe( 2 )
        expect( out.stopReason ).toContain( 'tools-below-2' )
        expect( out.errors.some( ( e ) => e.includes( 'DPT-003' ) ) ).toBe( true )
        // Test-Leiter: 1 working is `reachable` (minimum, insufficient — not green).
        expect( out.perTool.getBalance.level ).toBe( 'reachable' )
    } )

    test( 'exactly two working tests clear the bar -> ok:true, level schema-validatable (deterministic-green)', async () => {
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

        expect( out.ok ).toBe( true )
        expect( out.required ).toBe( 2 )
        expect( out.stopReason ).toBeNull()
        expect( out.perTool.getBalance.level ).toBe( 'schema-validatable' )
    } )

    test( 'per-tool gate: one fully-working tool does NOT mask a sibling with zero working tests', async () => {
        // getBalance: 3 working; getSupply: 3 failing. Schema-file total = 3 (>=3),
        // but the per-tool rule must FAIL because getSupply has 0/3 working.
        fetchQueue = [
            successFetch( { result: '284938' } ),
            successFetch( { result: '190021' } ),
            successFetch( { result: '77310' } )
            // getSupply's 3 tests hit the empty queue -> status:false -> 0 working
        ]
        const main = {
            namespace: 'etherscan',
            requiredServerParams: [],
            tools: {
                getBalance: { description: 'get balance', tests: [ { address: '0x1' }, { address: '0x2' }, { address: '0x3' } ] },
                getSupply: { description: 'get supply', tests: [ { address: '0x4' }, { address: '0x5' }, { address: '0x6' } ] }
            }
        }

        const out = await DataPretest.run( {
            namespace: 'etherscan',
            toolName: 'multi',
            main,
            gradingDataDir: tempRoot
        } )

        expect( out.passedDownloadable ).toBe( 3 )
        expect( out.ok ).toBe( false )
        expect( out.toolsBelowThreshold.some( ( t ) => t.includes( 'getSupply' ) ) ).toBe( true )
        expect( out.toolsBelowThreshold.some( ( t ) => t.includes( 'getBalance' ) ) ).toBe( false )
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


describe( 'DataPretest on-disk layout (readable: per-tool numbered tests + summary)', () => {
    test( 'writes providers/<ns>/<schema>/tools/<tool>/tests/test-N.json + summary.json', async () => {
        fetchQueue = [
            successFetch( { result: '1' } ),
            successFetch( { result: '2' } ),
            successFetch( { result: '3' } )
        ]
        const main = makeMainWithToolTests( { count: 3 } )

        const out = await DataPretest.run( {
            namespace: 'layoutns',
            toolName: 'prices',
            main,
            gradingDataDir: tempRoot
        } )
        expect( out.ok ).toBe( true )

        // numbered, self-describing test files under tools/<tool>/tests/
        const toolDir = join( tempRoot, 'providers', 'layoutns', 'prices', 'tools', 'getBalance', 'tests' )
        const files = ( await readdir( toolDir ) ).sort()
        expect( files ).toEqual( [ 'test-1.json', 'test-2.json', 'test-3.json' ] )

        const t2 = JSON.parse( await readFile( join( toolDir, 'test-2.json' ), 'utf-8' ) )
        expect( t2.test ).toBe( 2 )
        expect( t2.tool ).toBe( 'getBalance' )
        expect( t2.response ).not.toBeNull()
        expect( t2.working ).toBe( true )
        // F26: no request field is persisted
        expect( Object.prototype.hasOwnProperty.call( t2, 'request' ) ).toBe( false )

        // summary.json with per-tool gate result, no opaque hash filename
        const summary = JSON.parse( await readFile( join( tempRoot, 'providers', 'layoutns', 'prices', 'summary.json' ), 'utf-8' ) )
        expect( summary.schemaFile ).toBe( 'prices' )
        expect( summary.ok ).toBe( true )
        expect( summary.perTool.getBalance ).toEqual( { working: 3, total: 3, level: 'data-analyzable' } )

        // schema folder holds tools/ + summary.json; the tool lives under tools/
        const schemaFileEntries = await readdir( join( tempRoot, 'providers', 'layoutns', 'prices' ) )
        expect( schemaFileEntries ).not.toContain( 'data-pretest' )
        expect( schemaFileEntries.sort() ).toEqual( [ 'summary.json', 'tools' ] )
        const toolEntries = await readdir( join( tempRoot, 'providers', 'layoutns', 'prices', 'tools', 'getBalance' ) )
        expect( toolEntries ).toContain( 'tests' )
    } )
} )


describe( 'DataPretest F26 key-hygiene (no request, no API key on disk)', () => {
    const collectFiles = async ( { dir } ) => {
        const entries = await readdir( dir, { withFileTypes: true } )
        const nested = await entries
            .reduce( ( promise, entry ) => promise.then( async ( acc ) => {
                const full = join( dir, entry.name )
                if( entry.isDirectory() ) {
                    const sub = await collectFiles( { dir: full } )
                    return acc.concat( sub )
                }
                return acc.concat( [ full ] )
            } ), Promise.resolve( [] ) )
        return nested
    }

    test( 'persisted test files omit request and never leak a serverParams key value', async () => {
        const secret = 'SUPER-SECRET-API-KEY-1234567890'
        fetchQueue = [
            successFetch( { result: 'a' } ),
            successFetch( { result: 'b' } ),
            successFetch( { result: 'c' } )
        ]
        const main = {
            namespace: 'keyns',
            requiredServerParams: [ 'ETHERSCAN_API_KEY' ],
            tools: {
                getBalance: {
                    description: 'get balance',
                    tests: Array.from( { length: 3 } )
                        .map( ( _e, idx ) => ( { _description: `case ${idx}`, address: `0xabc${idx}` } ) )
                }
            }
        }

        const out = await DataPretest.run( {
            namespace: 'keyns',
            toolName: 'getBalance',
            main,
            serverParams: { ETHERSCAN_API_KEY: secret },
            gradingDataDir: tempRoot
        } )
        expect( out.ok ).toBe( true )

        const persisted = await collectFiles( { dir: join( tempRoot, 'providers', 'keyns' ) } )
        expect( persisted.length ).toBeGreaterThan( 0 )

        const contents = await persisted
            .reduce( ( promise, file ) => promise.then( async ( acc ) => {
                const body = await readFile( file, 'utf-8' )
                return acc.concat( [ { file, body } ] )
            } ), Promise.resolve( [] ) )

        // No persisted artifact contains the secret key value anywhere.
        contents
            .forEach( ( { body } ) => {
                expect( body.includes( secret ) ).toBe( false )
            } )

        // Every persisted test file omits the `request` field entirely.
        const testFiles = contents
            .filter( ( { file } ) => file.endsWith( '.json' ) && file.includes( join( 'tests', 'test-' ) ) )
        expect( testFiles.length ).toBe( 3 )
        testFiles
            .forEach( ( { body } ) => {
                const parsed = JSON.parse( body )
                expect( Object.prototype.hasOwnProperty.call( parsed, 'request' ) ).toBe( false )
                expect( parsed.response ).not.toBeNull()
            } )
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
